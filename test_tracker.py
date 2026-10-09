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

if __name__=='__main__':unittest.main()
