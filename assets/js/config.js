// MAX라이프 주식 — 환경 설정
// API_BASE 가 비어 있으면 '데모 모드'(브라우저 저장소, 단일 기기)로 동작합니다.
// 서버(PHP+MySQL)를 올린 뒤 API_BASE 에 api.php 주소를 넣으면 '운영 모드'(다중 회원 공유)로 전환됩니다.
window.MLS_CONFIG = {
  APP_NAME: 'MAX라이프 주식',
  // 예: 'https://stock.maxdaylife.com/server/api.php'
  API_BASE: '',
  // Supabase 운영 DB (설정되면 회원·주문이 서버에 저장되어 모든 기기·관리자와 공유됨)
  SUPABASE_URL: 'https://iejssgbspxwdmofbxwlt.supabase.co',
  SUPABASE_KEY: 'sb_publishable_GOuzqp0JFFBAL0tm4RkLaw_EBFdbsvM',
  // 시세 데이터 (GitHub Actions 가 data 브랜치에 5분마다 갱신)
  DATA_URLS: [
    'https://raw.githubusercontent.com/whaleguard/maxlife-stock/data',
    'https://cdn.jsdelivr.net/gh/whaleguard/maxlife-stock@data',
  ],
  LOCAL_DATA: './data',
  QUOTE_POLL_MS: 60 * 1000,
  SAMPLE_TICK_MS: 2000,
  STALE_MIN: 30, // 이 시간(분) 이상 갱신 없으면 '지연' 표시
};
