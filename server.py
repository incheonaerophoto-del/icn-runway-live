#!/usr/bin/env python3
"""ICN Runway Live — lightweight ADS-B approach monitoring web app.

Requires Python 3.9+. No third-party packages. Not for aviation operations.
ADS-B arrival/runway inference is approximate and has no ATC/NOTAM feed.
"""
import json
import math
import os
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

BASE = Path(__file__).resolve().parent
HOST = os.environ.get('HOST', '0.0.0.0')
PORT = int(os.environ.get('PORT', '8765'))
CACHE_SECONDS = 15
CENTER = (37.4625, 126.447)
MAX_LAT_AGE = 55
# Verified ICAO runway-end locations (RKSI AIP / aviation airport database).
# Each pair: (southern threshold, northern threshold). Other reciprocal labels are included.
PAIRS = [
    ('33L', '15R', (37.454201, 126.460999), (37.481800, 126.435997)),
    ('33R', '15L', (37.456402, 126.464996), (37.483898, 126.440002)),
    ('34R', '16L', (37.443432, 126.441697), (37.472740, 126.415631)),
    ('34L', '16R', (37.441272, 126.437882), (37.468746, 126.413446)),
]

def xy(point):
    """Relative local planar metres (east, north), adequate within ~40km."""
    return ((point[1] - CENTER[1]) * 111320 * math.cos(math.radians(CENTER[0])),
            (point[0] - CENTER[0]) * 111320)


def make_runways():
    runways = {}
    for south_name, north_name, south, north in PAIRS:
        for name, a, b in [(south_name, south, north), (north_name, north, south)]:
            sx, sy = xy(a)
            ex, ey = xy(b)
            dx, dy = ex - sx, ey - sy
            length = math.hypot(dx, dy)
            runways[name] = {
                'name': name, 'threshold': a, 'opposite': b,
                'ux': dx / length, 'uy': dy / length,
                'length': length, 'bearing': math.degrees(math.atan2(dx, dy)) % 360,
                'ox': sx, 'oy': sy,
            }
    return runways

RUNWAYS = make_runways()
NORTH_RUNWAYS = ['33L', '33R', '34R', '34L']
ALL_RUNWAYS = ['33L', '33R', '34R', '34L', '15R', '15L', '16L', '16R']
CARGO_PREFIXES = ('FDX', 'UPS', 'GTI', 'CKS', 'ABW', 'BOX', 'CLX', 'KYE', 'AHK', 'PAC', 'NCA', 'TAY', 'SFH', 'HYT', 'KZR')
CARGO_TYPES = {'B77L', 'B74F', 'A124', 'A306', 'A30B', 'B763F'}

def angular_difference(a, b):
    return abs((a - b + 180) % 360 - 180)


def finite_number(x):
    if isinstance(x, bool):
        return None
    try:
        n = float(x)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None


def classify_approach(lat, lon, track, altitude):
    """Runway *candidate* from inbound heading and lateral deviation.
    Never represents an ATC runway clearance or confirmed landing.
    """
    if track is None or altitude is None or altitude > 7000 or altitude < -1000:
        return None
    px, py = xy((lat, lon))
    best = None
    for name, r in RUNWAYS.items():
        dx, dy = px - r['ox'], py - r['oy']
        # Along + = beyond threshold in landing direction; - = on final approach.
        along = dx * r['ux'] + dy * r['uy']
        cross = abs(dx * r['uy'] - dy * r['ux'])
        if not (-18000 <= along <= 1450):
            continue
        # At final approach, strict centerline match to distinguish parallel RWYs.
        tolerance = min(240, 95 + max(0, -along) * 0.012)
        if cross > tolerance:
            continue
        heading_diff = angular_difference(track, r['bearing'])
        if heading_diff > 24:
            continue
        # Distance scoring: lateral alignment most important.
        score = cross / tolerance + heading_diff / 55 + max(0, along) / 12000
        if best is None or score < best['score']:
            best = {
                'runway': name, 'along_m': round(along), 'cross_m': round(cross),
                'distance_nm': round(max(0, -along) / 1852, 1), 'score': score,
            }
    return best


def cargo_guess(raw, flight):
    description = str(raw.get('desc') or '').lower()
    typ = str(raw.get('t') or '').upper()
    return (str(flight).upper().startswith(CARGO_PREFIXES) or typ in CARGO_TYPES
            or 'freighter' in description or 'cargo aircraft' in description)


def parse_planes(payload):
    result = []
    now = time.time()
    for a in payload.get('ac', []):
        lat, lon = finite_number(a.get('lat')), finite_number(a.get('lon'))
        if lat is None or lon is None or not (37.18 <= lat <= 37.75 and 126.12 <= lon <= 126.78):
            continue
        seen_pos = finite_number(a.get('seen_pos'))
        if seen_pos is not None and (seen_pos > MAX_LAT_AGE or seen_pos < 0):
            continue
        flight = (str(a.get('flight') or '').strip() or '미확인')
        ground = str(a.get('alt_baro', '')).lower() == 'ground'
        alt = finite_number(a.get('alt_baro'))
        if alt is None and not ground:
            alt = finite_number(a.get('alt_geom'))
        track = finite_number(a.get('track'))
        speed = finite_number(a.get('gs'))
        vr = finite_number(a.get('baro_rate'))
        approach = None if ground else classify_approach(lat, lon, track, alt)
        reg = str(a.get('r') or '').strip().upper()
        typ = str(a.get('t') or '').strip().upper()
        plane = {
            'hex': str(a.get('hex') or '').lower(), 'flight': flight,
            'registration': reg, 'type': typ, 'lat': lat, 'lon': lon,
            'altitude_ft': round(alt) if alt is not None else None,
            'ground': ground, 'speed_kt': round(speed) if speed is not None else None,
            'track_deg': round(track) if track is not None else None,
            'vertical_speed_fpm': round(vr) if vr is not None else None,
            'age_seconds': round(seen_pos or 0, 1),
            'cargo_guess': cargo_guess(a, flight),
            'runway': approach['runway'] if approach else None,
            'distance_nm': approach['distance_nm'] if approach else None,
            'along_m': approach['along_m'] if approach else None,
            'cross_m': approach['cross_m'] if approach else None,
            'phase': ('지상' if ground else
                      ('접근 중' if approach and approach['along_m'] < 0 else
                       '활주로 상공' if approach else '주변 비행')),
            'last_seen': round(now),
        }
        if plane['hex']:
            result.append(plane)
    return result


class TrackingStore:
    def __init__(self):
        self.lock = threading.Lock()
        self.last_poll = 0
        self.last_success = 0
        self.provider = None
        self.err = None
        self.planes = []
        self.polling = False
        self.next_poll = 0
        self.failures = 0
        self.tracks = {}
        self.events = deque(maxlen=200)

    def _fetch(self):
        req = urllib.request.Request(
            'https://api.adsb.lol/v2/point/37.4625/126.447/42',
            headers={'User-Agent': 'ICN-Runway-Live/1.1 (personal noncommercial ADS-B dashboard)', 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=25) as response:
            payload = json.load(response)
        if not isinstance(payload, dict) or not isinstance(payload.get('ac'), list):
            raise ValueError('ADSB.lol 응답 형식 오류')
        return 'adsb.lol', payload

    def _refresh(self):
        try:
            source, payload = self._fetch()
            planes = parse_planes(payload)
            completed = time.time()
            with self.lock:
                self._ingest(planes, completed)
                self.planes = planes
                self.last_success = completed
                self.provider = source
                self.err = None
                self.failures = 0
        except Exception as exc:
            with self.lock:
                self.failures += 1
                if isinstance(exc, urllib.error.HTTPError):
                    self.err = f'ADSB.lol HTTP {exc.code}'
                    delay = 300 if exc.code in (401, 403, 429) else 30
                else:
                    self.err = 'ADSB.lol 응답 지연 또는 일시적인 연결 실패'
                    delay = min(120, 15 * 2 ** min(self.failures, 3))
                self.next_poll = time.time() + delay
                print(f'ADSB.lol update failed: {type(exc).__name__}: {exc}', flush=True)
        finally:
            with self.lock:
                self.polling = False

    def _ingest(self, planes, stamp):
        for p in planes:
            key = p['hex']
            state = self.tracks.setdefault(key, {
                'runway': None, 'approach_at': 0, 'last_along': None,
                'event_at': 0, 'last_seen': stamp,
            })
            if p['runway'] and p['phase'] == '접근 중' and p['along_m'] < -150:
                state.update(runway=p['runway'], approach_at=stamp,
                             last_along=p['along_m'], last_seen=stamp)
            elif (state['runway'] and stamp - state['approach_at'] < 420 and
                  stamp - state['event_at'] > 900):
                r = RUNWAYS[state['runway']]
                px, py = xy((p['lat'], p['lon']))
                dx, dy = px - r['ox'], py - r['oy']
                along = dx * r['ux'] + dy * r['uy']
                cross = abs(dx * r['uy'] - dy * r['ux'])
                # Must have been seen inbound before threshold; now over runway.
                if -100 <= along <= r['length'] + 250 and cross < 125 and (
                    p['ground'] or (p['altitude_ft'] is not None and p['altitude_ft'] < 1300)
                ):
                    self.events.appendleft({
                        'timestamp': int(stamp), 'runway': state['runway'],
                        'flight': p['flight'], 'registration': p['registration'],
                        'type': p['type'], 'cargo_guess': p['cargo_guess'],
                        'status': '지상 수신' if p['ground'] else '착륙 추정',
                        'hex': p['hex'],
                    })
                    state['event_at'] = stamp
                    state['runway'] = None
                state['last_seen'] = stamp
            else:
                state['last_seen'] = stamp
        self.tracks = {k: v for k, v in self.tracks.items()
                       if stamp - v['last_seen'] < 1500}
        while self.events and stamp - self.events[-1]['timestamp'] > 86400:
            self.events.pop()

    def get(self):
        with self.lock:
            now = time.time()
            if not self.polling and now >= self.next_poll and now - self.last_poll >= CACHE_SECONDS:
                self.last_poll = now
                self.next_poll = now + CACHE_SECONDS
                self.polling = True
                threading.Thread(target=self._refresh, daemon=True).start()
            age = now - self.last_success if self.last_success else None
            return {
                'source': self.provider,
                'polling': self.polling,
                'retry_after': max(0, round(self.next_poll - now)),
                'received_at': int(self.last_success) if self.last_success else None,
                'seconds_old': round(age) if age is not None else None,
                'fresh': age is not None and age < 70,
                'error': self.err,
                'aircraft': self.planes if age is not None and age < 150 else [],
                'events': [e for e in self.events if now - e['timestamp'] <= 7200],
                'runways': [
                    {'name': name, 'threshold': r['threshold'],
                     'opposite': r['opposite'], 'bearing': round(r['bearing'])}
                    for name, r in RUNWAYS.items()
                ],
                'note': '항공기 위치/진행방향으로 활주로를 추정합니다. 실제 착륙, 관제 허가, 활주로 폐쇄 여부는 확인되지 않습니다.',
            }


STORE = TrackingStore()


def build_demo():
    stamp = time.time()
    aircraft = []
    specs = [
        ('AAR871', 'HL7620', 'B77L', '33R', 5.2, 2200, 174, True),
        ('FDX5172', 'N878FD', 'B77L', '34L', 2.3, 1050, 158, True),
        ('KAL703', 'HL8081', 'B789', '33L', 7.6, 3100, 196, False),
        ('UPS087', 'N601UP', 'B748', '34R', 8.2, 2800, 180, True),
        ('CPA418', 'B-LRA', 'A359', '33R', 10.4, 4400, 210, False),
    ]
    for i, (flight, reg, typ, rw, km, alt, speed, cargo) in enumerate(specs):
        r = RUNWAYS[rw]
        xx = r['ox'] - r['ux'] * km * 1000
        yy = r['oy'] - r['uy'] * km * 1000
        lat = CENTER[0] + yy / 111320
        lon = CENTER[1] + xx / (111320 * math.cos(math.radians(CENTER[0])))
        aircraft.append(dict(hex=f'demo{i:02d}', flight=flight, registration=reg,
                             type=typ, lat=lat, lon=lon, altitude_ft=alt,
                             ground=False, speed_kt=speed, track_deg=round(r['bearing']),
                             vertical_speed_fpm=-650, age_seconds=2, cargo_guess=cargo,
                             runway=rw, distance_nm=round(km / 1.852, 1), along_m=-km*1000,
                             cross_m=0, phase='접근 중', last_seen=int(stamp)))
    return {
        'source': 'DEMO · 가상 데이터', 'received_at': int(stamp),
        'seconds_old': 0, 'fresh': True, 'error': None, 'aircraft': aircraft,
        'events': [],
        'runways': [dict(name=name, threshold=r['threshold'],
                         opposite=r['opposite'], bearing=round(r['bearing']))
                    for name, r in RUNWAYS.items()],
        'note': '데모 데이터입니다. 표시된 항공편·위치는 실제 실시간 자료가 아닙니다.',
        'demo': True,
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ('/api/live', '/api/demo', '/health'):
            if path == '/health':
                data = {'ok': True, 'time': datetime.now(timezone.utc).isoformat()}
            elif path == '/api/demo':
                data = build_demo()
            else:
                data = STORE.get()
            payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        static_assets = {
            '/manifest.webmanifest': ('manifest.webmanifest', 'application/manifest+json; charset=utf-8'),
            '/sw.js': ('sw.js', 'text/javascript; charset=utf-8'),
            '/icon-180.png': ('icon-180.png', 'image/png'),
            '/icon-192.png': ('icon-192.png', 'image/png'),
            '/icon-512.png': ('icon-512.png', 'image/png'),
        }
        if path in static_assets:
            name, mime = static_assets[path]
            payload = (BASE / name).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Cache-Control', 'public, max-age=3600' if name.endswith('.png') else 'no-cache')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if path in ('/', '/index.html'):
            payload = (BASE / 'index.html').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_error(404, 'Not found')

    def log_message(self, fmt, *args):
        print('%s - %s' % (self.address_string(), fmt % args))


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f'ICN Runway Live: http://localhost:{PORT}')
    print('종료: Ctrl+C | ADS-B 기반 추정으로 실제 관제/NOTAM 확인용이 아닙니다.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
