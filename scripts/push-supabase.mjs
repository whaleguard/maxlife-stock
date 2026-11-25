// 수집한 시세를 Supabase 운영 DB(mls_quotes)에 반영 — 체결 엔진이 이 가격으로 주문을 처리
// 필요 Secrets: SUPA_URL, SUPA_KEY(공개 키), SUPA_PUSH_SECRET(설치 SQL 실행 결과의 push_secret)
import fs from 'node:fs';
import path from 'node:path';
const di = process.argv.indexOf('--data');
const DATA = di > 0 ? path.resolve(process.argv[di + 1]) : path.resolve('data');
const { SUPA_URL, SUPA_KEY, SUPA_PUSH_SECRET } = process.env;
if (!SUPA_URL || !SUPA_KEY || !SUPA_PUSH_SECRET) { console.log('Supabase 설정 없음 → 건너뜀'); process.exit(0); }
const q = JSON.parse(fs.readFileSync(path.join(DATA, 'quotes.json'), 'utf8'));
const items = Object.entries(q.items).map(([code, v]) => {
  const b = (q.books || {})[code];
  return [code, v.name, v.market, v.currency, v.price, v.prevClose ?? '', b && b.asks && b.asks[0] ? b.asks[0][0] : '', b && b.bids && b.bids[0] ? b.bids[0][0] : '', v.upper ?? '', v.lower ?? ''];
});
const headers = { 'content-type': 'application/json', apikey: SUPA_KEY, ...(SUPA_KEY.startsWith('eyJ') ? { authorization: 'Bearer ' + SUPA_KEY } : {}) };
const r = await fetch(SUPA_URL.replace(/\/$/, '') + '/rest/v1/rpc/mls_push_quotes', { method: 'POST', headers, body: JSON.stringify({ p_secret: SUPA_PUSH_SECRET, p_items: items, p_fx: q.fx }) });
const t = await r.text();
console.log('supabase push', r.status, t.slice(0, 200));
if (!r.ok) process.exit(1);
