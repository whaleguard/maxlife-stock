// MAX라이프 주식 — 한국투자증권 Open API 시세 수집기
// GitHub Actions에서 실행: data/quotes.json, data/candles/*.json 갱신
// 필요 Secrets: KIS_APP_KEY, KIS_APP_SECRET
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const di = process.argv.indexOf('--data');
const DATA = di > 0 ? path.resolve(process.argv[di + 1]) : path.join(ROOT, 'data');
const BASE = 'https://openapi.koreainvestment.com:9443';
const KEY = process.env.KIS_APP_KEY;
const SECRET = process.env.KIS_APP_SECRET;
const TOKEN_FILE = path.join(DATA, '.kis-token.json'); // actions/cache 로 유지 (git 제외)
const MODE = process.argv[2] || 'quotes'; // quotes | candles | all
fs.mkdirSync(path.join(DATA, 'candles'), { recursive: true });

if (!KEY || !SECRET) {
  console.log('KIS_APP_KEY / KIS_APP_SECRET 미설정 → 수집 건너뜀 (샘플 시세 유지)');
  process.exit(0);
}

const universe = JSON.parse(fs.readFileSync(path.join(DATA, 'universe.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (v === undefined || v === null || v === '' ? 0 : Number(v));

async function getToken() {
  try {
    const t = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    if (t.access_token && t.expires_at > Date.now() + 10 * 60 * 1000) return t.access_token;
  } catch {}
  const res = await fetch(`${BASE}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: KEY, appsecret: SECRET }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(j));
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ access_token: j.access_token, expires_at: Date.now() + (num(j.expires_in) || 86400) * 1000 }));
  return j.access_token;
}

let TOKEN;
async function kis(pathname, trId, params, retry = 2) {
  const url = `${BASE}${pathname}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${TOKEN}`,
      appkey: KEY,
      appsecret: SECRET,
      tr_id: trId,
      custtype: 'P',
    },
  });
  const j = await res.json().catch(() => ({}));
  await sleep(80); // 초당 호출 제한 대응
  if (j.rt_cd !== '0') {
    if (retry > 0 && /EGW00201|초당/.test(JSON.stringify(j))) { await sleep(1100); return kis(pathname, trId, params, retry - 1); }
    throw new Error(`${trId} ${params.FID_INPUT_ISCD || params.SYMB || ''}: ${j.msg1 || res.status}`);
  }
  return j;
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000);

// ── 국내 ──
async function krQuote(code) {
  const j = await kis('/uapi/domestic-stock/v1/quotations/inquire-price', 'FHKST01010100', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code });
  const o = j.output;
  const price = num(o.stck_prpr);
  const change = num(o.prdy_vrss) * (['4', '5'].includes(o.prdy_vrss_sign) ? -1 : 1);
  return {
    price, change, changePct: num(o.prdy_ctrt) * (change < 0 && num(o.prdy_ctrt) > 0 ? -1 : 1),
    prevClose: num(o.stck_sdpr) || price - change, open: num(o.stck_oprc), high: num(o.stck_hgpr), low: num(o.stck_lwpr),
    volume: num(o.acml_vol), value: num(o.acml_tr_pbmn), upper: num(o.stck_mxpr), lower: num(o.stck_llam),
    per: num(o.per), pbr: num(o.pbr), marketCap: num(o.hts_avls) * 1e8, high52: num(o.w52_hgpr), low52: num(o.w52_lwpr),
  };
}
async function krBook(code) {
  const j = await kis('/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn', 'FHKST01010200', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code });
  const o = j.output1;
  const asks = [], bids = [];
  for (let i = 1; i <= 10; i++) {
    asks.push([num(o[`askp${i}`]), num(o[`askp_rsqn${i}`])]);
    bids.push([num(o[`bidp${i}`]), num(o[`bidp_rsqn${i}`])]);
  }
  return { asks, bids };
}
async function krTicks(code) {
  const j = await kis('/uapi/domestic-stock/v1/quotations/inquire-ccnl', 'FHKST01010300', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code });
  return (j.output || []).slice(0, 30).map((r) => [r.stck_cntg_hour, num(r.stck_prpr), num(r.cntg_vol)]);
}
async function krIndex(iscd) {
  const j = await kis('/uapi/domestic-stock/v1/quotations/inquire-index-price', 'FHPUP02100000', { FID_COND_MRKT_DIV_CODE: 'U', FID_INPUT_ISCD: iscd });
  const o = j.output;
  const change = num(o.bstp_nmix_prdy_vrss) * (['4', '5'].includes(o.prdy_vrss_sign) ? -1 : 1);
  return { price: num(o.bstp_nmix_prpr), change, changePct: num(o.bstp_nmix_prdy_ctrt) * (change < 0 && num(o.bstp_nmix_prdy_ctrt) > 0 ? -1 : 1) };
}
async function krDaily(code) {
  const end = kstNow(); const start = new Date(end.getTime() - 150 * 86400000);
  const j = await kis('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice', 'FHKST03010100', {
    FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_INPUT_DATE_1: ymd(start), FID_INPUT_DATE_2: ymd(end), FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: '0',
  });
  return (j.output2 || []).filter((r) => r.stck_bsop_date).map((r) => [r.stck_bsop_date, num(r.stck_oprc), num(r.stck_hgpr), num(r.stck_lwpr), num(r.stck_clpr), num(r.acml_vol)]).reverse();
}
async function krMinute(code) {
  const hhmmss = kstNow().toISOString().slice(11, 19).replace(/:/g, '');
  const t = hhmmss > '153000' ? '153000' : hhmmss;
  const j = await kis('/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice', 'FHKST03010200', {
    FID_ETC_CLS_CODE: '', FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_INPUT_HOUR_1: t, FID_PW_DATA_INCU_YN: 'Y',
  });
  return (j.output2 || []).filter((r) => r.stck_cntg_hour).map((r) => [r.stck_bsop_date + r.stck_cntg_hour, num(r.stck_oprc), num(r.stck_hgpr), num(r.stck_lwpr), num(r.stck_prpr), num(r.cntg_vol)]).reverse();
}

// ── 해외 ──
async function usQuote(s) {
  const j = await kis('/uapi/overseas-price/v1/quotations/price-detail', 'HHDFS76200200', { AUTH: '', EXCD: s.excd, SYMB: s.code });
  const o = j.output;
  const price = num(o.last); const prev = num(o.base) || price;
  return {
    price, prevClose: prev, change: +(price - prev).toFixed(4), changePct: prev ? +(((price - prev) / prev) * 100).toFixed(2) : 0,
    open: num(o.open), high: num(o.high), low: num(o.low), volume: num(o.tvol), value: num(o.tamt),
    per: num(o.perx), pbr: num(o.pbrx), marketCap: num(o.tomv), high52: num(o.h52p), low52: num(o.l52p),
  };
}
async function usDaily(s) {
  const j = await kis('/uapi/overseas-price/v1/quotations/dailyprice', 'HHDFS76240000', { AUTH: '', EXCD: s.excd, SYMB: s.code, GUBN: '0', BYMD: '', MODP: '1' });
  return (j.output2 || []).filter((r) => r.xymd).map((r) => [r.xymd, num(r.open), num(r.high), num(r.low), num(r.clos), num(r.tvol)]).reverse();
}
async function usIndex(iscd) {
  const end = kstNow(); const start = new Date(end.getTime() - 10 * 86400000);
  const j = await kis('/uapi/overseas-price/v1/quotations/inquire-daily-chartprice', 'FHKST03030100', {
    FID_COND_MRKT_DIV_CODE: iscd.startsWith('FX') ? 'X' : 'N', FID_INPUT_ISCD: iscd, FID_INPUT_DATE_1: ymd(start), FID_INPUT_DATE_2: ymd(end), FID_PERIOD_DIV_CODE: 'D',
  });
  const o = j.output1;
  const change = num(o.ovrs_nmix_prdy_vrss) * (['4', '5'].includes(o.prdy_vrss_sign) ? -1 : 1);
  return { price: num(o.ovrs_nmix_prpr), change, changePct: num(o.prdy_ctrt) * (change < 0 && num(o.prdy_ctrt) > 0 ? -1 : 1) };
}

function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }

async function main() {
  TOKEN = await getToken();
  const qFile = path.join(DATA, 'quotes.json');
  const prev = readJSON(qFile, { items: {}, indices: {}, books: {} });
  const out = { source: 'KIS', status: 'LIVE', updatedAt: new Date().toISOString(), fx: prev.fx || universe.fx.sample, indices: prev.indices || {}, items: prev.items || {}, books: prev.books || {}, ticks: prev.ticks || {}, errors: [] };

  if (MODE === 'quotes' || MODE === 'all') {
    for (const ix of universe.indices) {
      try { out.indices[ix.code] = { name: ix.name, ...(ix.src === 'KR' ? await krIndex(ix.kis) : await usIndex(ix.kis)) }; } catch (e) { out.errors.push(e.message); }
    }
    try { const fx = await usIndex(universe.fx.kis); if (fx.price) out.fx = fx.price; } catch (e) { out.errors.push('FX ' + e.message); }
    for (const s of universe.stocks) {
      try {
        const q = s.excd ? await usQuote(s) : await krQuote(s.code);
        if (q.price) out.items[s.code] = { name: s.name, market: s.market, currency: s.excd ? 'USD' : 'KRW', ...q };
        if (!s.excd) { out.books[s.code] = await krBook(s.code); out.ticks[s.code] = await krTicks(s.code); }
      } catch (e) { out.errors.push(e.message); }
    }
    fs.writeFileSync(qFile, JSON.stringify(out));
    console.log(`quotes: ${Object.keys(out.items).length} items, errors ${out.errors.length}`);
  }

  if (MODE === 'candles' || MODE === 'all') {
    for (const s of universe.stocks) {
      const f = path.join(DATA, 'candles', `${s.code}.json`);
      const c = readJSON(f, { d: [], m: [] });
      try { c.d = s.excd ? await usDaily(s) : await krDaily(s.code); } catch (e) { out.errors.push(e.message); }
      if (!s.excd) { try { const m = await krMinute(s.code); if (m.length) c.m = m; } catch (e) { out.errors.push(e.message); } }
      c.updatedAt = new Date().toISOString();
      fs.writeFileSync(f, JSON.stringify(c));
    }
    console.log('candles updated');
  }
  if (out.errors.length) console.log('errors:\n' + out.errors.slice(0, 20).join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
