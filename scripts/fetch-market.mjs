// MAX라이프 주식 — 전 종목 시세 수집기 (API 키 불필요)
// 국내: 코스피·코스닥 전 종목(ETF 포함) / 미국: 나스닥·뉴욕·아멕스 상장 보통주
// 실행: node scripts/fetch-market.mjs <quotes|candles|all> --data <dir>
import fs from 'node:fs';
import path from 'node:path';

const di = process.argv.indexOf('--data');
const DATA = di > 0 ? path.resolve(process.argv[di + 1]) : path.resolve('data');
const MODE = process.argv[2] || 'quotes';
fs.mkdirSync(path.join(DATA, 'candles'), { recursive: true });

const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept: 'application/json,text/plain,*/*' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => { if (v === undefined || v === null || v === '' || v === 'N/A') return 0; const n = Number(String(v).replace(/[,$%+]/g, '')); return Number.isFinite(n) ? n : 0; };
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const errors = [];

async function get(url, { json = true, retry = 3, headers = {} } = {}) {
  for (let i = 0; i <= retry; i++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch(url, { headers: { ...UA, ...headers }, signal: ctl.signal });
      clearTimeout(t);
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { fatal: true });
      return json ? await r.json() : await r.text();
    } catch (e) {
      if (e.fatal || i === retry) throw e;
      await sleep(600 * (i + 1));
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { errors.push(String(e.message || e)); } } }));
  return out;
}

// ───────── 국내 ─────────
async function krList(market) {
  const out = [];
  for (let page = 1; page < 60; page++) {
    const j = await get(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`);
    const rows = j.stocks || [];
    for (const s of rows) out.push({ code: s.itemCode, name: s.stockName, market, type: s.stockEndType, cap: num(s.marketValue) * 1e8 });
    if (rows.length < 100) break;
    await sleep(120);
  }
  return out;
}
async function krPoll(codes) {
  const map = {};
  const chunks = []; for (let i = 0; i < codes.length; i += 100) chunks.push(codes.slice(i, i + 100));
  await pool(chunks, 4, async (c) => {
    const j = await get('https://polling.finance.naver.com/api/realtime/domestic/stock/' + c.join(','));
    for (const d of j.datas || []) map[d.itemCode] = d;
  });
  return map;
}
async function krIndex(code) {
  const j = await get(`https://m.stock.naver.com/api/index/${code}/basic`);
  return { price: num(j.closePrice), change: num(j.compareToPreviousClosePrice), changePct: num(j.fluctuationsRatio) };
}
async function krBook(code) {
  const j = await get(`https://m.stock.naver.com/api/stock/${code}/askingPrice`);
  const asks = (j.sellInfo || []).map((r) => [num(r.price), num(r.count)]).sort((a, b) => a[0] - b[0]);
  const bids = (j.buyInfos || []).map((r) => [num(r.price), num(r.count)]).sort((a, b) => b[0] - a[0]);
  return { asks, bids };
}
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3);
const ymdhm = (d) => d.toISOString().slice(0, 16).replace(/[-T:]/g, '');
async function krDaily(code) {
  const end = kstDate(); const start = new Date(end.getTime() - 400 * 86400e3);
  const j = await get(`https://api.stock.naver.com/chart/domestic/item/${code}/day?startDateTime=${ymdhm(start).slice(0, 8)}0000&endDateTime=${ymdhm(end).slice(0, 8)}2359`);
  return (Array.isArray(j) ? j : []).map((r) => [r.localDate, r.openPrice, r.highPrice, r.lowPrice, r.closePrice, r.accumulatedTradingVolume]);
}
async function krMinute(code) {
  const now = kstDate(); const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  const j = await get(`https://api.stock.naver.com/chart/domestic/item/${code}/minute?startDateTime=${d}0900&endDateTime=${d}1530`);
  const rows = Array.isArray(j) ? j : [];
  // 1분봉 → 5분봉 (화면 표시용)
  const out = []; let cur = null;
  for (const r of rows) {
    const t = r.localDateTime.slice(0, 12); const mm = +t.slice(10, 12); const key = t.slice(0, 10) + String(mm - (mm % 5)).padStart(2, '0');
    if (!cur || cur[0] !== key) { cur && out.push(cur); cur = [key, r.openPrice, r.highPrice, r.lowPrice, r.currentPrice, r.accumulatedTradingVolume]; }
    else { cur[2] = Math.max(cur[2], r.highPrice); cur[3] = Math.min(cur[3], r.lowPrice); cur[4] = r.currentPrice; cur[5] += r.accumulatedTradingVolume; }
  }
  cur && out.push(cur);
  return out;
}

// ───────── 미국 ─────────
async function usList(exchange) {
  const j = await get(`https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true&exchange=${exchange}`, { headers: { origin: 'https://www.nasdaq.com', referer: 'https://www.nasdaq.com/' } });
  const rows = (j.data && j.data.rows) || [];
  const mk = exchange === 'nasdaq' ? 'NASDAQ' : exchange === 'nyse' ? 'NYSE' : 'AMEX';
  return rows
    .filter((r) => /^[A-Z]{1,5}$/.test(r.symbol) && num(r.lastsale) > 0 && num(r.marketCap) > 0 && !/ Warrant| Right| Unit|Preferred|Depositary Shares/i.test(r.name))
    .map((r) => {
      const price = num(r.lastsale), change = num(r.netchange);
      return { code: r.symbol, name: r.name.replace(/ (Common Stock|Class [A-C] Common Stock|Ordinary Shares|Common Shares|American Depositary Shares).*$/i, '').trim(), market: mk, sector: r.sector || '', price, change, changePct: num(r.pctchange), prevClose: +(price - change).toFixed(4), volume: num(r.volume), cap: num(r.marketCap) };
    });
}
async function yahoo(symbol, range = '1d', interval = '5m') {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`);
  return j.chart && j.chart.result && j.chart.result[0];
}
const ySym = (code) => code.replace('.', '-');

// ───────── 수집 ─────────
async function quotes() {
  const qFile = path.join(DATA, 'quotes.json');
  const prev = readJSON(qFile, { items: {}, indices: {}, books: {} });
  const out = { source: 'MARKET', status: 'LIVE', updatedAt: new Date().toISOString(), fx: prev.fx || 1400, indices: { ...(prev.indices || {}) }, items: {}, books: { ...(prev.books || {}) }, ticks: {} };

  // 지수 · 환율
  for (const [k, n] of [['KOSPI', '코스피'], ['KOSDAQ', '코스닥']]) { try { out.indices[k] = { name: n, ...(await krIndex(k)) }; } catch (e) { errors.push(k + ' ' + e.message); } }
  for (const [k, sym, n] of [['NASDAQ', '^IXIC', '나스닥'], ['SPX', '^GSPC', 'S&P 500'], ['DJI', '^DJI', '다우존스']]) {
    try { const m = (await yahoo(sym)).meta; const p = m.regularMarketPrice, pc = m.chartPreviousClose || m.previousClose; out.indices[k] = { name: n, price: p, change: +(p - pc).toFixed(2), changePct: +(((p - pc) / pc) * 100).toFixed(2) }; } catch (e) { errors.push(k + ' ' + e.message); }
  }
  try { const m = (await yahoo('KRW=X')).meta; if (m.regularMarketPrice > 500) out.fx = +m.regularMarketPrice.toFixed(2); } catch (e) { errors.push('FX ' + e.message); }

  // 국내 전 종목
  let kr = [];
  try { kr = [...(await krList('KOSPI')), ...(await krList('KOSDAQ'))]; } catch (e) { errors.push('KR list ' + e.message); }
  if (kr.length) {
    const poll = await krPoll(kr.map((s) => s.code));
    for (const s of kr) {
      const d = poll[s.code]; if (!d) continue;
      const price = num(d.closePriceRaw || d.closePrice); if (!price) continue;
      const change = num(d.compareToPreviousClosePriceRaw || d.compareToPreviousClosePrice);
      const prevClose = price - change;
      const tick = (p) => p; // 상하한가는 앱에서 호가단위로 계산
      out.items[s.code] = {
        name: s.name, market: s.market, currency: 'KRW', type: s.type,
        price, change, changePct: num(d.fluctuationsRatioRaw || d.fluctuationsRatio), prevClose,
        open: num(d.openPriceRaw) || price, high: num(d.highPriceRaw) || price, low: num(d.lowPriceRaw) || price,
        volume: num(d.accumulatedTradingVolumeRaw), value: num(d.accumulatedTradingValueRaw),
        upper: tick(Math.floor(prevClose * 1.3)), lower: tick(Math.ceil(prevClose * 0.7)),
        marketCap: num(d.marketValueFullRaw) || s.cap, halted: d.tradableStatusCode && d.tradableStatusCode !== 'ok' ? 1 : 0,
      };
    }
  } else {
    for (const [k, v] of Object.entries(prev.items || {})) if (v.currency === 'KRW') out.items[k] = v;
  }

  // 국내 호가 (거래대금 상위 300)
  const topKr = Object.entries(out.items).filter(([, v]) => v.currency === 'KRW').sort((a, b) => b[1].value - a[1].value).slice(0, 300).map(([k]) => k);
  const books = {};
  await pool(topKr, 6, async (code) => { const b = await krBook(code); if (b.asks.length && b.bids.length) books[code] = b; });
  out.books = books;

  // 미국 전 종목
  let us = [];
  for (const ex of ['nasdaq', 'nyse', 'amex']) { try { us.push(...(await usList(ex))); } catch (e) { errors.push('US ' + ex + ' ' + e.message); } }
  if (us.length) {
    const seen = new Set();
    for (const s of us) {
      if (seen.has(s.code) || out.items[s.code]) continue; seen.add(s.code);
      out.items[s.code] = { name: s.name, market: s.market, currency: 'USD', sector: s.sector, price: s.price, change: s.change, changePct: s.changePct, prevClose: s.prevClose, open: s.price, high: s.price, low: s.price, volume: s.volume, value: Math.round(s.volume * s.price), marketCap: s.cap };
    }
    // 시가총액 상위 300 은 당일 시가·고가·저가까지
    const topUs = us.sort((a, b) => b.cap - a.cap).slice(0, 300).map((s) => s.code);
    await pool(topUs, 6, async (code) => {
      const r = await yahoo(ySym(code)); const m = r && r.meta; const it = out.items[code]; if (!m || !it) return;
      const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
      const opens = (q.open || []).filter((x) => x != null);
      it.price = +m.regularMarketPrice.toFixed(4);
      const pc = m.chartPreviousClose || m.previousClose || it.prevClose;
      it.prevClose = pc; it.change = +(it.price - pc).toFixed(4); it.changePct = +(((it.price - pc) / pc) * 100).toFixed(2);
      it.open = opens[0] || it.price; it.high = m.regularMarketDayHigh || it.price; it.low = m.regularMarketDayLow || it.price;
      it.volume = m.regularMarketVolume || it.volume; it.value = Math.round(it.volume * it.price);
      it.high52 = m.fiftyTwoWeekHigh || 0; it.low52 = m.fiftyTwoWeekLow || 0;
    });
  } else {
    for (const [k, v] of Object.entries(prev.items || {})) if (v.currency === 'USD' && !out.items[k]) out.items[k] = v;
  }

  const n = Object.keys(out.items).length;
  if (n < 100) { console.log('수집 실패 — 이전 데이터 유지', errors.slice(0, 10)); return; }
  out.errors = errors.slice(0, 30);
  fs.writeFileSync(qFile, JSON.stringify(out));
  console.log(`quotes: ${n} items (KR ${Object.values(out.items).filter((v) => v.currency === 'KRW').length} / US ${Object.values(out.items).filter((v) => v.currency === 'USD').length}), books ${Object.keys(books).length}, errors ${errors.length}`);

  // 국내 분봉 (거래대금 상위 150, 장중만)
  const k = kstDate(); const hm = k.getUTCHours() * 60 + k.getUTCMinutes();
  if (k.getUTCDay() >= 1 && k.getUTCDay() <= 5 && hm >= 540 && hm <= 960) {
    await pool(topKr.slice(0, 150), 6, async (code) => {
      const m = await krMinute(code); if (!m.length) return;
      const f = path.join(DATA, 'candles', code + '.json'); const c = readJSON(f, { d: [], m: [] }); c.m = m; fs.writeFileSync(f, JSON.stringify(c));
    });
  }
}

async function candles() {
  const q = readJSON(path.join(DATA, 'quotes.json'), { items: {} });
  const all = Object.entries(q.items);
  const kr = all.filter(([, v]) => v.currency === 'KRW').map(([k]) => k);
  const us = all.filter(([, v]) => v.currency === 'USD').sort((a, b) => (b[1].marketCap || 0) - (a[1].marketCap || 0)).slice(0, 1500).map(([k]) => k);
  let ok = 0;
  await pool(kr, 8, async (code) => {
    const d = await krDaily(code); if (d.length < 2) return;
    const f = path.join(DATA, 'candles', code + '.json'); const c = readJSON(f, { d: [], m: [] }); c.d = d; c.updatedAt = new Date().toISOString(); fs.writeFileSync(f, JSON.stringify(c)); ok++;
  });
  await pool(us, 6, async (code) => {
    const r = await yahoo(ySym(code), '1y', '1d'); if (!r || !r.timestamp) return;
    const qq = r.indicators.quote[0]; const d = [];
    r.timestamp.forEach((t, i) => { if (qq.close[i] == null) return; const dt = new Date((t + (r.meta.gmtoffset || 0)) * 1000).toISOString().slice(0, 10).replace(/-/g, ''); d.push([dt, +(qq.open[i] ?? qq.close[i]).toFixed(4), +(qq.high[i] ?? qq.close[i]).toFixed(4), +(qq.low[i] ?? qq.close[i]).toFixed(4), +qq.close[i].toFixed(4), qq.volume[i] || 0]); });
    if (d.length < 2) return;
    const f = path.join(DATA, 'candles', code + '.json'); const c = readJSON(f, { d: [], m: [] }); c.d = d; c.updatedAt = new Date().toISOString(); fs.writeFileSync(f, JSON.stringify(c)); ok++;
  });
  console.log(`candles: ${ok} files, errors ${errors.length}`);
}

(async () => {
  if (MODE === 'quotes' || MODE === 'all') await quotes();
  if (MODE === 'candles' || MODE === 'all') await candles();
  if (errors.length) console.log('errors(sample):\n' + errors.slice(0, 15).join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
