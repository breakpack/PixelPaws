# PixelPaws

데스크톱에서 함께 노는 픽셀 고양이(Electron)와, 웹에서 고양이와 가시성을 제어하는 SaaS(React+Vite + FastAPI)로 구성된 모노레포입니다.

본 프로젝트는 바이브 코딩(assistant 기반 페어프로그래밍)으로 개발되었습니다.

## 특징
- 투명·항상 위 창의 데스크톱 펫(Electron)
- 상태/애니메이션: idle, walk, run, sit, liedown, jump, land, attack
- 드래그로 들어올리기, 클릭 시 점프→착지→5초 추격
- 웹 컨트롤 패널에서 Visible 토글·고양이 선택 → 앱이 폴링으로 반영
- 매니페스트 기반(각 애니메이션 파일 경로)으로 고양이 세트 교체

## 기술스택
- 데스크톱 앱
  - Electron 28, Vanilla JS
  - 투명 윈도우, alwaysOnTop, pass-through 제어
  - Preload IPC: setWindowPosition, setWindowVisibility, getDeviceId, get/setConfig 등
  - 패키징: electron-builder (macOS dmg/zip, Windows nsis/zip, Linux AppImage/deb)
- 백엔드(API)
  - FastAPI, Uvicorn, Pydantic v2
  - SQLAlchemy 2, Postgres (Supabase) / 로컬 SQLite 지원
  - CORS 설정 및 간단 시드 데이터(cat01)
  - 엔드포인트 (MVP)
    - GET /v1/devices/{deviceId}/state
    - PATCH /v1/devices/{deviceId}/state
    - GET /v1/cats
    - GET /v1/cats/{catId}/manifest
- 프론트엔드(Web)
  - React 18 + Vite 5 + TypeScript
  - Axios 기반 API 클라이언트
  - Device ID 입력 → Visible 토글/고양이 선택/저장 UI
- 인프라(권장)
  - Web: Vercel, Netlify
  - API: Fly.io, Render, 또는 Docker+AWS ECS/Fargate
  - DB: Supabase(Postgres)
  - 자산/CDN: S3 + CloudFront (버전 경로)

## 디렉토리 구조
```
PixelPaws/
├─ apps/
│  ├─ server/            # FastAPI
│  │  ├─ app/
│  │  │  ├─ api/v1/routers/
│  │  │  │  ├─ devices.py
│  │  │  │  └─ cats.py
│  │  │  ├─ core/
│  │  │  │  ├─ db.py
│  │  │  │  └─ models.py
│  │  │  └─ main.py
│  │  └─ requirements.txt
│  └─ web/               # React + Vite
│     ├─ src/
│     │  ├─ lib/api.ts
│     │  ├─ App.tsx
│     │  └─ main.tsx
│     ├─ index.html
│     ├─ vite.config.ts
│     └─ package.json
├─ cat.html / cat.js / preload.js / main.js / styles.css
├─ catset_assets/        # 로컬 테스트용 애니메이션 파일들
└─ package.json          # Electron 앱 루트
```

## 빠른 시작(로컬)
1) API 서버
```
cd apps/server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# (선택) .env에 DATABASE_URL, CORS_ORIGINS 설정
uvicorn app.main:app --reload --port 8000
```

2) 웹 컨트롤 패널
```
cd apps/web
cp .env.example .env   # VITE_API_BASE=http://localhost:8000
npm i
npm run dev            # http://localhost:5173
```

3) 데스크톱 앱(Electron)
```
npm i
npm run start
```
DevTools 콘솔에서:
```js
await window.electronAPI.getDeviceId() // 웹에 입력할 Device ID
await window.electronAPI.setConfig({
  apiBase: "http://localhost:8000",
  apiToken: "dev", // MVP에서는 임의 문자열 허용
  selectedCatId: "cat01"
})
```
웹에서 Device ID 로드 → Visible 토글/고양이 선택 후 Save → 앱이 3초 내 반영.

로컬 자산(CDN 대체) 테스트 팁:
```
# PixelPaws 루트에서 정적 서버 실행
python -m http.server 8001
```
DB의 cats.base_url을 `http://localhost:8001/catset_assets/catset_gifs/cat01_gifs`로 업데이트하면 앱이 로컬 파일을 HTTP로 로드합니다.

## 환경변수
- 서버(apps/server/.env)
  - `DATABASE_URL` (예: `postgresql+psycopg2://...supabase.co:5432/postgres?sslmode=require`)
  - `CORS_ORIGINS` (예: `https://app.pixelpaws.com`)  
  - `API_TITLE`, `PORT`
- 웹(apps/web/.env)
  - `VITE_API_BASE`, `VITE_API_TOKEN`
- 앱(Electron)
  - 런타임에서 `window.electronAPI.setConfig({ apiBase, apiToken, selectedCatId })`
  - 디버그: `OPAQUE_DEBUG=1 npm start` (불투명 창)

## 배포 요약
- Web: Vercel/Netlify, `VITE_API_BASE=https://api.pixelpaws.com`
- API: Docker로 빌드 후 Fly.io/Render 배포, `DATABASE_URL`/`CORS_ORIGINS` 설정
- DB: Supabase(Postgres), 테이블은 서버 부팅 시 자동 생성 또는 SQL로 생성
- 앱(Electron):
```
# 개발 산출물
npm run pack
# 배포 산출물 (.dmg/.exe 등)
npm run dist
```
macOS 서명/노타라이즈 필요 시 Apple 계정/앱 비밀번호 설정 후 electron-builder 환경변수 적용.

## 보안·운영
- Electron: contextIsolation 활성화, 프로덕션 CSP 권장
- API: JWT 도입 권장(현재는 MVP), RLS 정책(Supabase) 적용 권장
- 로깅/모니터링: Sentry/서비스 로그, 스테이징 분리

## 라이선스
ISC (변경 가능)

## 고마움
본 프로젝트는 바이브 코딩(assistant 기반 페어프로그래밍)으로 함께 만들었습니다.
