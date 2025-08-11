# PixelPaws

데스크톱에서 함께 노는 픽셀 고양이(Electron)와, 웹에서 고양이와 가시성을 제어하는 SaaS(React+Vite + FastAPI)로 구성된 모노레포입니다.

본 프로젝트는 바이브 코딩(assistant 기반 페어프로그래밍)으로 개발되었습니다.

## 데모 영상
[![데모영상](https://youtu.be/_imBTGDmyPg)](https://youtu.be/_imBTGDmyPg)
> 위 이미지를 클릭하면 YouTube에서 데모 영상을 볼 수 있습니다.


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

## 데스크톱 앱(Electron)
```
npm i
npm run start
```
## 배포 요약
- 앱(Electron)

```
# 개발 산출물
npm start
# 배포 산출물 (.dmg/.exe 등)
npm run dist
```

## 추후계획
- macOS 서명/노타라이즈 필요 시 Apple 계정/앱 비밀번호 설정 후 electron-builder 환경변수 적용.
- 웹과 연동

## 보안·운영
- Electron: contextIsolation 활성화, 프로덕션 CSP 권장

## 라이선스
ISC (변경 가능)

본 프로젝트는 바이브 코딩(assistant 기반 페어프로그래밍)으로 함께 만들었습니다.
