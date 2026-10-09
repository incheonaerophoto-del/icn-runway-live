# ✈️ ICN Runway Live — 아이폰 홈 화면 앱 버전

인천공항 주변에서 수신되는 ADS-B 항공기와 **33R / 34L 등 접근 활주로 추정**을 볼 수 있는 개인용 PWA(홈 화면 웹앱)입니다.

## 아이폰에서 일반 앱처럼 쓰는 순서

먼저 **HTTPS 웹주소로 앱을 배포**해야 합니다. 이 압축 파일만 iPhone에서 열면 실시간 기능이 동작하지 않습니다.

### 1) GitHub에 코드 올리기 — 처음 한 번
1. https://github.com 에서 계정을 만들고 로그인합니다.
2. 새 저장소(New repository)를 만든 후 공개(Public)로 설정합니다. 이름 예: `icn-runway-live`.
3. **ZIP 압축을 풀고 `ICN_Runway_Live_iPhone` 폴더 안의 파일을 저장소의 최상위 폴더에 모두 업로드**합니다. `server.py`, `index.html`, `render.yaml` 등이 루트에 있어야 합니다.
4. GitHub에서 변경사항을 커밋(Commit changes)합니다.

### 2) Render에 무료 웹 서비스 만들기 — 처음 한 번
1. https://dashboard.render.com 에 로그인하고 GitHub 계정을 연결합니다.
2. `New` → `Web Service` 를 선택하고 방금 만든 저장소를 연결합니다.
3. 서비스 이름을 `icn-runway-live-내이름` 등 사용 가능한 이름으로 입력합니다.
4. **Runtime: Python** / **Build command: `echo ready`** / **Start command: `python server.py`** / **Instance type: Free** 를 선택합니다. `render.yaml` 파일로 Blueprint 배포해도 됩니다.
5. 배포(Deploy) 뒤 Render에서 `https://...onrender.com` 주소를 받으면 Safari로 접속합니다.

Render의 무료 서버는 15분간 요청이 없으면 잠자기 모드로 전환될 수 있고 다시 열 때 약 1분 기다려야 할 수 있습니다. 서버가 재시작되면 착륙 추정 기록이 초기화됩니다. 무료 제공 조건은 바뀔 수 있습니다.

### 3) iPhone Safari에서 홈 화면에 추가
1. 배포된 `https://...onrender.com` 주소를 **Safari**로 엽니다.
2. **공유 버튼(□↑) → 홈 화면에 추가**를 누릅니다.
3. **웹 앱으로 열기**를 켜고 **추가**를 누릅니다.
4. iPhone 홈 화면에 **ICN Runway** 아이콘이 생깁니다. 탭하면 주소창 없이 앱처럼 열립니다.

## 알아둘 점
- 데이터는 약 15초마다 갱신되지만 앱이 **열려 있을 때만** 갱신됩니다. 앱이 닫혔을 때 뒤에서 추적하거나 알림을 보내는 기능은 없습니다.
- ADS-B 제공처: ADSB.lol 공개 API. 공개 데이터 사용 정책·수신 상태·속도제한에 따라 실시간 데이터가 표시되지 않을 수 있습니다.
- 접근 활주로/화물기 여부와 착륙 기록은 **항적에 따른 추정**이고 실제 ATC 활주로 배정·착륙 확정·NOTAM을 보여주지 않습니다.
- 인터넷이 끊겨도 앱의 **화면은 열릴 수 있지만 실시간 항공기 데이터는 볼 수 없습니다.** 데모 버튼은 가상 항공기를 보여줍니다.
- 공개 무료 서버는 누구나 URL로 접근할 수 있습니다. 개인정보/비밀번호는 업로드하지 마세요.
- 이 앱은 App Store에 등록된 iOS 네이티브 앱(.ipa)이 아니라 **PWA 홈 화면 웹앱**입니다.

## PC에서 미리 테스트

Python 3.9 이상에서 (추가 패키지 없음) `python server.py`를 실행하고 `http://localhost:8765`로 접속하세요. `python -m unittest test_tracker.py`로 알고리즘 테스트를 할 수 있습니다. 로컬 Wi-Fi 주소로 iPhone에서 접속하면 https가 아니므로 일반 PWA 서비스워커는 동작하지 않습니다.

## 파일

- `index.html`: 설치 안내 포함 반응형 대시보드
- `server.py`: 공개 ADS-B API 접근 서버 및 활주로 추정
- `manifest.webmanifest`: 홈 화면 앱 이름, 색상, 아이콘 등
- `sw.js`: 화면 캐시용 서비스 워커 (비행 데이터는 캐시하지 않음)
- `icon-180.png`, `icon-192.png`, `icon-512.png`: iOS/PWA 아이콘
- `render.yaml`: Render 무료 Python 서비스용 구성
- `test_tracker.py`: 내부 테스트

데이터 출처: https://www.adsb.lol/ (ODbL 1.0), 대한민국 AIP RKSI. 항공기 운항에 사용하지 마세요.
