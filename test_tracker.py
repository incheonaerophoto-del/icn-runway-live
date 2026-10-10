import math
import unittest
import server

class GeometryTests(unittest.TestCase):
    def on_final(self, rw, km=3):
        r=server.RUNWAYS[rw]
        x=r['ox'] - r['ux']*km*1000
        y=r['oy'] - r['uy']*km*1000
        return (server.CENTER[0]+y/111320,
                server.CENTER[1]+x/(111320*math.cos(math.radians(server.CENTER[0]))))

    def test_all_eight_runway_directions(self):
        for name,r in server.RUNWAYS.items():
            with self.subTest(runway=name):
                lat,lon=self.on_final(name)
                approach=server.classify_approach(lat,lon,r['bearing'],1400)
                self.assertIsNotNone(approach)
                self.assertEqual(approach['runway'],name)

    def test_reject_high_altitude(self):
        r=server.RUNWAYS['34L'];lat,lon=self.on_final('34L')
        self.assertIsNone(server.classify_approach(lat,lon,r['bearing'],20000))

    def test_reject_wrong_heading(self):
        r=server.RUNWAYS['33R'];lat,lon=self.on_final('33R')
        self.assertIsNone(server.classify_approach(lat,lon,(r['bearing']+180)%360,1400))

    def test_sample_data(self):
        demo=server.build_demo()
        self.assertTrue(demo['demo'])
        self.assertEqual(len(demo['aircraft']),5)
        self.assertFalse(demo['events'])
        self.assertTrue(all('runway' in p for p in demo['aircraft']))

    def test_data_parser(self):
        r=server.RUNWAYS['33R'];lat,lon=self.on_final('33R')
        sample={'ac':[{'hex':'123abc','flight':'FDX001 ','lat':lat,'lon':lon,'track':r['bearing'],
                       'alt_baro':1100,'gs':160,'seen_pos':1.0,'t':'B77L'}]}
        planes=server.parse_planes(sample)
        self.assertEqual(len(planes),1)
        self.assertEqual(planes[0]['runway'],'33R')
        self.assertTrue(planes[0]['cargo_guess'])

class RefreshTests(unittest.TestCase):
    def test_slow_source_does_not_block_or_duplicate(self):
        import threading
        from unittest.mock import patch
        store = server.TrackingStore()
        entered, release = threading.Event(), threading.Event()
        def slow():
            entered.set()
            release.wait(2)
            return 'test', {'ac': []}
        with patch.object(store, '_fetch', side_effect=slow) as fetch:
            result = store.get()
            try:
                self.assertTrue(result['polling'])
                self.assertTrue(entered.wait(1))
                self.assertTrue(store.get()['polling'])
                self.assertEqual(fetch.call_count, 1)
            finally:
                release.set()

    def test_denial_preserves_cache_and_backs_off(self):
        from unittest.mock import patch
        store = server.TrackingStore()
        store.last_success = server.time.time()
        store.planes = [{'hex': 'cached'}]
        error = server.urllib.error.HTTPError('https://api.adsb.lol', 403, 'Forbidden', {}, None)
        with patch.object(store, '_fetch', side_effect=error) as fetch:
            store._refresh()
            result = store.get()
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(result['aircraft'], [{'hex': 'cached'}])
            self.assertIn('403', result['error'])
            self.assertGreater(result['retry_after'], 290)
            self.assertFalse(result['polling'])

if __name__=='__main__':unittest.main()

class PredictionTests(unittest.TestCase):
    def plane(self, runway='33R', distance=5000, **kw):
        r=server.RUNWAYS[runway];x=r['ox']-r['ux']*distance;y=r['oy']-r['uy']*distance
        p=dict(hex='abc',flight='TEST1',lat=server.CENTER[0]+y/111320,
            lon=server.CENTER[1]+x/(111320*math.cos(math.radians(server.CENTER[0]))),
            altitude_ft=1000,track_deg=r['bearing'],speed_kt=150,
            vertical_speed_fpm=-600,age_seconds=1,ground=False,runway=runway,phase='접근 중')
        p.update(kw);return p
    def test_all_runway_directions(self):
        for r in server.RUNWAYS:
            self.assertEqual(server.predict_runway(self.plane(r))[0]['runway'],r)
    def test_reject_goaround_ground_stale_and_impossible_height(self):
        for kw in [{'vertical_speed_fpm':900},{'ground':True},{'age_seconds':40},{'track_deg':None},{'altitude_ft':7000}]:
            self.assertEqual(server.predict_runway(self.plane(distance=1000,**kw)),[])
    def test_repeated_position_cannot_be_high_confidence(self):
        hist={}
        for t in [100,115,130]:
            p=self.plane();server.enrich_predictions([p],hist,t)
        self.assertEqual(p['prediction']['samples'],1)
        self.assertNotEqual(p['prediction']['confidence'],'높음')
    def test_moving_aligned_descent_confidence(self):
        hist={}
        for t,d in [(100,5000),(115,4000),(130,3000)]:
            p=self.plane(distance=d,altitude_ft=d*.052/.3048);server.enrich_predictions([p],hist,t)
        self.assertEqual(p['predicted_runway'],'33R')
        self.assertEqual(p['prediction']['confidence'],'높음')
        self.assertGreater(p['arrival_eta'],130)
    def test_parallel_midpoint_is_ambiguous(self):
        a=self.plane('33L');b=self.plane('33R');a['lat']=(a['lat']+b['lat'])/2;a['lon']=(a['lon']+b['lon'])/2
        server.enrich_predictions([a],{},100)
        self.assertTrue(a['prediction']['ambiguous']);self.assertIsNone(a['predicted_runway'])
