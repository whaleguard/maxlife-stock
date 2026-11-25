# MAX라이프 주식 — 실전형 가상투자 교육 플랫폼

실제 국내·미국 주식 시세로 매수·매도를 연습하고, 강사의 리딩(교육용 매매 시연)을 가상계좌로 따라하며 배우는 플랫폼입니다. 실제 돈은 오가지 않습니다.

- 사용자: `index.html` — 홈 · 종목/주문(캔들차트·10단계 호가·체결·지정가/시장가·정정/취소) · 잔고 · 거래내역 · 입출금(관리자 승인) · 리딩룸 · 랭킹 · 마이페이지
- 관리자/강사: `admin.html` — 대시보드 · 회원관리(회원별 보유/매입·매출/수익률/입출금/정지) · 입출금 승인 · 리딩·공지 · 종목·시세 · 수수료·세금·운영 설정

## 동작 모드

| 모드 | 설정 | 특징 |
|---|---|---|
| 데모 모드 (기본) | `assets/js/config.js` 의 `API_BASE: ''` | GitHub Pages 만으로 동작. 데이터는 브라우저에 저장(기기별). 데모 계정 포함 |
| 운영 모드 | `API_BASE` 에 `server/api.php` 주소 입력 | PHP+MySQL 서버에 회원·거래 데이터 저장. 여러 회원이 공유 |

데모 계정: 수강생 `demo/demo1234` · 강사 `teacher/teacher1234` · 관리자 `admin/admin1234`

## 실시세 연동 (한국투자증권 Open API)

1. 한국투자증권 계좌 개설 → [KIS Developers](https://apiportal.koreainvestment.com) 에서 Open API 신청 → App Key / App Secret 발급
2. GitHub 저장소 **Settings → Secrets and variables → Actions** 에 `KIS_APP_KEY`, `KIS_APP_SECRET` 등록
3. **Actions → 시세 수집 (KIS Open API) → Run workflow** (mode: `all`) 1회 실행

이후 장중 5분마다 국내·미국 현재가, 국내 10단계 호가·체결, 지수, 환율, 일봉/분봉이 `data` 브랜치에 갱신되고 앱이 자동으로 실시세로 전환됩니다. 연결 전에는 "샘플 시세"(교육용 시뮬레이션)로 동작합니다.

> 지연 시세(최대 5분)로 교육 목적에 한해 표시합니다. 상업적 실시간 시세 재배포에는 거래소 정보이용 계약이 필요합니다.

## 운영 모드 서버 설치 (Cafe24 / VPS, PHP 8+ · MySQL)

1. `server/` 폴더를 웹 서버에 업로드
2. `server/config.sample.php` → `server/config.php` 로 복사 후 DB 정보·허용 도메인·관리자 계정 입력
3. 브라우저로 `https://도메인/server/install.php` 1회 접속 (테이블·관리자 생성)
4. `assets/js/config.js` 의 `API_BASE` 를 `https://도메인/server/api.php` 로 변경 후 배포
5. (선택) 크론: `*/2 * * * * php /경로/server/cron.php` — 미체결 지정가 주문 체결 검사 (없어도 접속 시 30초 간격 자동 검사)

운영 모드에서는 실시세가 연결된 경우에만 주문이 체결됩니다 (서버·화면의 가격 일치 보장).

## 거래 규칙

- 국내 수수료 0.015%, 매도 세금 0.20%, 미국 수수료 0.25% (관리자 설정에서 변경)
- 국내 호가단위·상하한가(±30%) 검증, 미국주식은 원화 자동 환전(적용 환율 표시)
- 시장가: 최우선 호가로 즉시 체결 · 지정가: 시세가 도달하면 체결(미체결 대기 중 정정/취소 가능)
- 기본은 장외시간에도 마지막 시세로 교육용 체결 허용. "실제 장 운영시간만 체결" 설정 가능

## 구조

```
index.html / admin.html
assets/css/app.css            디자인 시스템 (다크/라이트)
assets/js/config.js           모드·데이터 주소
assets/js/market.js           시세(실시세/샘플)·호가·캔들·장운영시간
assets/js/engine.js           체결 엔진·계좌 평가
assets/js/store.js            데이터 저장소 (LocalStore / ApiStore)
assets/js/chart.js            캔버스 차트
assets/js/app.js / admin.js   사용자 앱 / 관리자 콘솔
data/universe.json            거래 종목 목록
scripts/fetch-kis.mjs         KIS 시세 수집기 (GitHub Actions)
server/                       운영 모드 PHP API + 스키마
```
