# MAX라이프 주식 — 실전형 가상투자 리딩 플랫폼

실제 국내·미국 주식 시세로 매수·매도를 연습하고, 강사의 리딩(리딩용 매매 시연)을 가상계좌로 따라하며 배우는 플랫폼입니다. 실제 돈은 오가지 않습니다.

- 사용자: `index.html` — 홈 · 종목/주문(캔들차트·10단계 호가·체결·지정가/시장가·정정/취소) · 잔고 · 거래내역 · 입출금(관리자 승인) · 리딩룸 · 랭킹 · 마이페이지
- 관리자/강사: `admin.html` — 대시보드 · 회원관리(회원별 보유/매입·매출/수익률/입출금/정지) · 입출금 승인 · 리딩·공지 · 종목·시세 · 수수료·세금·운영 설정

## 동작 모드

| 모드 | 설정 | 특징 |
|---|---|---|
| 데모 모드 (기본) | `assets/js/config.js` 의 `API_BASE: ''` | GitHub Pages 만으로 동작. 데이터는 브라우저에 저장(기기별). 데모 계정 포함 |
| 운영 모드 | `API_BASE` 에 `server/api.php` 주소 입력 | PHP+MySQL 서버에 회원·거래 데이터 저장. 여러 회원이 공유 |

데모 계정: 수강생 `demo/demo1234` · 강사 `teacher/teacher1234` · 관리자 `admin/admin1234`

## 시세 연동 (API 키 불필요)

`scripts/fetch-market.mjs` 를 GitHub Actions 가 장중 5분마다 실행해 `data` 브랜치에 저장합니다.

- 국내: 코스피·코스닥 전 종목(ETF 포함) 현재가·시가·고가·저가·거래량·거래대금, 거래대금 상위 300종목 호가, 상위 150종목 분봉
- 미국: 나스닥·뉴욕·아멕스 상장 종목 현재가·등락·거래량, 시가총액 상위 300종목 당일 시가·고가·저가
- 지수(코스피·코스닥·나스닥·S&P500·다우), 원/달러 환율
- 일봉 1년치: 국내 전 종목 + 미국 시가총액 상위 1,500종목 (매일 장 마감 후)

`data` 브랜치는 매번 단일 커밋으로 덮어써서 저장소 용량이 늘지 않습니다. 수동 실행: **Actions → 시세 수집 → Run workflow** (mode: `all`).

## 운영 DB (Supabase · 연결됨)

회원·주문·체결·입출금·리딩은 Supabase 프로젝트 `maxlife-stock` 에 저장되어 모든 기기와 관리자 화면이 같은 데이터를 봅니다.

- 설치: `supabase/schema.sql` 전체를 Supabase SQL Editor 에서 실행 (여러 번 실행해도 안전)
- 테이블은 외부 접근이 잠겨 있고, 모든 요청은 `mls_api()` 함수 하나로 처리 (비밀번호는 bcrypt)
- 시세: Supabase 가 pg_cron 으로 5분마다 `data` 브랜치 quotes.json 을 직접 가져와 체결에 사용
- 앱 연결: `assets/js/config.js` 의 `SUPABASE_URL` · `SUPABASE_KEY`(공개 키)

## (참고) PHP 서버 설치 (Cafe24 / VPS, PHP 8+ · MySQL)

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
- 기본은 장외시간에도 마지막 시세로 리딩용 체결 허용. "실제 장 운영시간만 체결" 설정 가능

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
