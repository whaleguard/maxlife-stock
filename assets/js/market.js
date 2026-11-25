// 시세 모듈 — 실시세(KIS → GitHub data 브랜치) 우선, 미연결 시 샘플 시세
const Market = (() => {
  const C = window.MLS_CONFIG;
  const ev = U.emitter();
  let universe = null;
  let state = { status: 'LOADING', source: '', updatedAt: null, fx: 1400, indices: {}, items: {}, books: {}, ticks: {} };
  let overrides = { hidden: [], base: {} }; // 관리자 설정 (숨김 종목, 샘플 기준가)
  let dataBase = null; // 실제 데이터 URL
  const candleCache = {};
  const simTicks = {};
  let simTimer = null, pollTimer = null;

  const isUS = (s) => s && (s.market === 'NASDAQ' || s.market === 'NYSE');
  const meta = (code) => universe.stocks.find((s) => s.code === code);

  async function fetchJSON(url) {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Math.floor(Date.now() / 30000), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }

  async function init(opts = {}) {
    overrides = { hidden: [], base: {}, ...(opts.overrides || {}) };
    universe = await fetchJSON(C.LOCAL_DATA + '/universe.json');
    await refresh();
    pollTimer = setInterval(refresh, C.QUOTE_POLL_MS);
    return api;
  }
  function setOverrides(o) { overrides = { hidden: [], base: {}, ...(o || {}) }; if (state.status === 'SAMPLE') buildSample(true); ev.emit('update', state); }

  async function refresh() {
    let live = null;
    for (const base of [...C.DATA_URLS, C.LOCAL_DATA]) {
      try {
        const j = await fetchJSON(base + '/quotes.json');
        if (j && j.items && Object.keys(j.items).length >= 5 && j.source === 'KIS') { live = j; dataBase = base; break; }
      } catch {}
    }
    if (live) {
      stopSim();
      const prevItems = state.items;
      state = { status: 'LIVE', source: 'KIS', updatedAt: live.updatedAt, fx: live.fx || 1400, indices: live.indices || {}, items: {}, books: live.books || {}, ticks: {} };
      for (const s of universe.stocks) {
        const q = live.items[s.code];
        if (!q) continue;
        state.items[s.code] = { code: s.code, sector: s.sector, ...q, name: s.name, market: s.market, currency: isUS(s) ? 'USD' : 'KRW' };
        const t = (live.ticks || {})[s.code];
        state.ticks[s.code] = t ? t.map(([hhmmss, p, v]) => ({ t: hhmmss.slice(0, 2) + ':' + hhmmss.slice(2, 4) + ':' + hhmmss.slice(4, 6), p, v, side: 0 })) : [];
        const old = prevItems[s.code]; state.items[s.code].dir = old ? Math.sign(state.items[s.code].price - old.price) : 0;
      }
      // 실시세에 없는 종목은 샘플로 보충
      for (const s of universe.stocks) if (!state.items[s.code]) state.items[s.code] = sampleItem(s);
    } else if (state.status !== 'SAMPLE') {
      buildSample();
    }
    ev.emit('update', state);
  }

  // ── 샘플 시세 ──
  function sampleItem(s) {
    const r = U.rng(s.code + U.today());
    const base = overrides.base[s.code] || s.sample;
    const us = isUS(s);
    const prev = us ? +(base).toFixed(2) : U.roundTick(base, 'KRW');
    const chgPct = (r() - 0.47) * 6;
    let price = prev * (1 + chgPct / 100); price = us ? +price.toFixed(2) : U.roundTick(price, 'KRW');
    const open = us ? +(prev * (1 + (r() - 0.5) * 0.01)).toFixed(2) : U.roundTick(prev * (1 + (r() - 0.5) * 0.01), 'KRW');
    const high = Math.max(price, open) * (1 + r() * 0.012), low = Math.min(price, open) * (1 - r() * 0.012);
    return {
      code: s.code, name: s.name, market: s.market, sector: s.sector, currency: us ? 'USD' : 'KRW', sample: true,
      price, prevClose: prev, change: +(price - prev).toFixed(2), changePct: +((price - prev) / prev * 100).toFixed(2),
      open, high: us ? +high.toFixed(2) : U.roundTick(high, 'KRW'), low: us ? +low.toFixed(2) : U.roundTick(low, 'KRW'),
      volume: Math.floor((us ? 2e7 : 3e6) * (0.3 + r())), upper: us ? 0 : U.roundTick(prev * 1.3, 'KRW', 'floor'), lower: us ? 0 : U.roundTick(prev * 0.7, 'KRW', 'ceil'),
      high52: (us ? 1 : 1) * prev * (1.2 + r() * 0.3), low52: prev * (0.6 + r() * 0.15), per: +(8 + r() * 30).toFixed(2), pbr: +(0.5 + r() * 4).toFixed(2),
      marketCap: 0, dir: 0,
    };
  }
  function buildSample(keep) {
    const r = U.rng('ix' + U.today());
    state.status = 'SAMPLE'; state.source = 'SAMPLE'; state.updatedAt = new Date().toISOString(); state.fx = universe.fx.sample;
    if (!keep || !Object.keys(state.indices).length) {
      state.indices = {};
      for (const ix of universe.indices) { const p = (r() - 0.45) * 2; state.indices[ix.code] = { name: ix.name, price: ix.sample * (1 + p / 100), change: ix.sample * p / 100, changePct: +p.toFixed(2), base: ix.sample }; }
    }
    for (const s of universe.stocks) if (!keep || !state.items[s.code] || overrides.base[s.code]) state.items[s.code] = sampleItem(s);
    state.books = {};
    startSim();
  }
  function startSim() {
    if (simTimer) return;
    simTimer = setInterval(() => {
      const codes = Object.keys(state.items);
      const n = Math.max(4, Math.floor(codes.length / 5));
      for (let i = 0; i < n; i++) {
        const q = state.items[codes[Math.floor(Math.random() * codes.length)]];
        const us = q.currency === 'USD';
        const steps = Math.random() < 0.5 ? -1 : 1;
        let np = us ? +(q.price * (1 + steps * (0.0005 + Math.random() * 0.0015))).toFixed(2) : U.stepPrice(q.price, 'KRW', steps);
        if (!us && (np > q.upper || np < q.lower)) continue;
        if (Math.abs((np - q.prevClose) / q.prevClose) > 0.12) np = q.price; // 샘플 과도 변동 방지
        q.dir = Math.sign(np - q.price); q.price = np;
        q.change = +(np - q.prevClose).toFixed(2); q.changePct = +((np - q.prevClose) / q.prevClose * 100).toFixed(2);
        q.high = Math.max(q.high, np); q.low = Math.min(q.low, np);
        const v = Math.ceil(Math.random() * (us ? 300 : 400));
        q.volume += v;
        (simTicks[q.code] = simTicks[q.code] || []).unshift({ t: U.time(Date.now()), p: np, v, side: q.dir });
        simTicks[q.code].length = Math.min(simTicks[q.code].length, 40);
        const c = candleCache[q.code + ':D'];
        if (c && c.length) { const last = c[c.length - 1]; last.c = np; last.h = Math.max(last.h, np); last.l = Math.min(last.l, np); last.v += v; }
        const m = candleCache[q.code + ':m'];
        if (m && m.length) { const last = m[m.length - 1]; last.c = np; last.h = Math.max(last.h, np); last.l = Math.min(last.l, np); last.v += v; }
      }
      for (const k in state.indices) { const ix = state.indices[k]; const d = (Math.random() - 0.5) * 0.0006; ix.price *= 1 + d; ix.change = ix.price - ix.base; ix.changePct = +(ix.change / ix.base * 100).toFixed(2); }
      state.updatedAt = new Date().toISOString();
      ev.emit('update', state);
    }, C.SAMPLE_TICK_MS);
  }
  function stopSim() { if (simTimer) { clearInterval(simTimer); simTimer = null; } }

  // ── 조회 ──
  const quote = (code) => state.items[code];
  const list = (filter) => universe.stocks.filter((s) => !overrides.hidden.includes(s.code)).map((s) => state.items[s.code]).filter(Boolean).filter((q) => !filter || filter(q));
  const allMeta = () => universe.stocks;
  const fx = () => state.fx || 1400;
  const toKrw = (v, ccy) => (ccy === 'USD' ? v * fx() : v);

  function book(code) {
    const q = quote(code); if (!q) return { asks: [], bids: [] };
    const lb = state.books[code];
    if (state.status === 'LIVE' && lb && lb.asks && lb.asks[0] && lb.asks[0][0]) {
      return { asks: lb.asks.slice(0, 10), bids: lb.bids.slice(0, 10), live: true };
    }
    // 합성 호가 (현재가 기준, 교육용)
    const r = U.rng(code + Math.floor(Date.now() / 4000));
    const asks = [], bids = [];
    let a = q.currency === 'USD' ? +(q.price + 0.01).toFixed(2) : U.stepPrice(q.price, 'KRW', 1);
    let b = q.price;
    const baseQ = q.currency === 'USD' ? 400 : Math.max(50, Math.round(3e7 / q.price));
    for (let i = 0; i < 10; i++) {
      asks.push([a, Math.round(baseQ * (0.3 + r() * 1.6) * (1 + i * 0.08))]);
      bids.push([b, Math.round(baseQ * (0.3 + r() * 1.6) * (1 + i * 0.08))]);
      a = q.currency === 'USD' ? +(a + 0.01).toFixed(2) : U.stepPrice(a, 'KRW', 1);
      b = q.currency === 'USD' ? +(b - 0.01).toFixed(2) : U.stepPrice(b, 'KRW', -1);
    }
    return { asks, bids, live: false };
  }
  const bestAsk = (code) => { const b = book(code); return b.asks[0] ? b.asks[0][0] : quote(code).price; };
  const bestBid = (code) => { const b = book(code); return b.bids[0] ? b.bids[0][0] : quote(code).price; };

  function ticks(code) {
    if (state.status === 'LIVE' && state.ticks[code] && state.ticks[code].length) {
      const arr = state.ticks[code];
      return arr.map((t, i) => ({ ...t, side: i < arr.length - 1 ? Math.sign(t.p - arr[i + 1].p) : 0 }));
    }
    if (!simTicks[code] || !simTicks[code].length) {
      const q = quote(code); if (!q) return [];
      const r = U.rng(code + 'tk'); let p = q.price; const now = Date.now(); const out = [];
      for (let i = 0; i < 20; i++) { out.push({ t: U.time(now - i * 7000), p, v: Math.ceil(r() * 300), side: 0 }); p = q.currency === 'USD' ? +(p + (r() - 0.5) * 0.04).toFixed(2) : U.stepPrice(p, 'KRW', r() < 0.5 ? -1 : 1); }
      simTicks[code] = out;
    }
    return simTicks[code];
  }

  // ── 캔들 ──
  function synthDaily(code) {
    const q = quote(code); const r = U.rng(code + 'daily');
    const n = 260; const us = q.currency === 'USD';
    const closes = new Array(n); closes[n - 1] = q.prevClose;
    for (let i = n - 2; i >= 0; i--) closes[i] = closes[i + 1] / (1 + (r() - 0.49) * 0.035);
    const out = []; const d = new Date(); d.setHours(0, 0, 0, 0);
    const dates = []; const cur = new Date(d);
    while (dates.length < n + 1) { if (cur.getDay() !== 0 && cur.getDay() !== 6) dates.unshift(new Date(cur)); cur.setDate(cur.getDate() - 1); }
    const rnd = (v) => (us ? +v.toFixed(2) : U.roundTick(v, 'KRW'));
    for (let i = 0; i < n; i++) {
      const c = closes[i], o = i ? closes[i - 1] * (1 + (r() - 0.5) * 0.01) : c;
      const h = Math.max(o, c) * (1 + r() * 0.015), l = Math.min(o, c) * (1 - r() * 0.015);
      out.push({ t: dates[i].getTime(), o: rnd(o), h: rnd(h), l: rnd(l), c: rnd(c), v: Math.floor((us ? 3e7 : 4e6) * (0.4 + r())) });
    }
    out.push({ t: dates[n].getTime(), o: q.open, h: q.high, l: q.low, c: q.price, v: q.volume });
    return out;
  }
  function synthMinute(code) {
    const q = quote(code); const r = U.rng(code + 'min' + U.today()); const us = q.currency === 'USD';
    const n = 78; const out = []; const start = new Date(); start.setHours(us ? 23 : 9, us ? 30 : 0, 0, 0); if (us && new Date().getHours() < 12) start.setDate(start.getDate() - 1);
    const path = [q.open]; for (let i = 1; i < n; i++) path.push(path[i - 1] * (1 + (r() - 0.5) * 0.004));
    const drift = (q.price - path[n - 1]) / n;
    const rnd = (v) => (us ? +v.toFixed(2) : U.roundTick(v, 'KRW'));
    let prevC = q.open;
    for (let i = 0; i < n; i++) {
      const c = path[i] + drift * (i + 1); const o = prevC;
      out.push({ t: start.getTime() + i * 5 * 60000, o: rnd(o), h: rnd(Math.max(o, c) * (1 + r() * 0.002)), l: rnd(Math.min(o, c) * (1 - r() * 0.002)), c: rnd(c), v: Math.floor((us ? 3e5 : 5e4) * (0.3 + r())) });
      prevC = c;
    }
    out[n - 1].c = q.price;
    return out;
  }
  const parseYmd = (s) => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), s.length >= 10 ? +s.slice(8, 10) : 0, s.length >= 12 ? +s.slice(10, 12) : 0).getTime();
  async function loadLiveCandles(code) {
    if (state.status !== 'LIVE' || !dataBase) return null;
    const key = code + ':file';
    if (candleCache[key] && Date.now() - candleCache[key].at < 5 * 60000) return candleCache[key].data;
    try {
      const j = await fetchJSON(dataBase + '/candles/' + code + '.json');
      const data = {
        d: (j.d || []).map(([t, o, h, l, c, v]) => ({ t: parseYmd(t), o, h, l, c, v })),
        m: (j.m || []).map(([t, o, h, l, c, v]) => ({ t: parseYmd(t), o, h, l, c, v })),
      };
      candleCache[key] = { at: Date.now(), data };
      return data;
    } catch { return null; }
  }
  function aggregate(daily, unit) {
    const out = []; let cur = null;
    for (const k of daily) {
      const d = new Date(k.t);
      const key = unit === 'W' ? (() => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toDateString(); })() : d.getFullYear() + '-' + d.getMonth();
      if (!cur || cur.key !== key) { cur && out.push(cur.k); cur = { key, k: { ...k } }; }
      else { cur.k.h = Math.max(cur.k.h, k.h); cur.k.l = Math.min(cur.k.l, k.l); cur.k.c = k.c; cur.k.v += k.v; }
    }
    cur && out.push(cur.k);
    return out;
  }
  async function candles(code, tf = 'D') {
    const q = quote(code); if (!q) return { data: [], live: false };
    const live = await loadLiveCandles(code);
    let daily, minute, isLive = false;
    if (live && live.d.length > 5) {
      isLive = true; daily = live.d.slice();
      const last = daily[daily.length - 1]; const td = new Date(); td.setHours(0, 0, 0, 0);
      if (q.currency === 'KRW' && last.t < td.getTime() && q.volume > 0 && new Date().getDay() % 6 !== 0) daily.push({ t: td.getTime(), o: q.open, h: q.high, l: q.low, c: q.price, v: q.volume });
      else { last.c = q.price; last.h = Math.max(last.h, q.price); last.l = Math.min(last.l, q.price); }
      minute = live.m.length > 5 ? live.m : null;
    }
    if (!daily) { const k = code + ':D'; candleCache[k] = candleCache[k] || synthDaily(code); daily = candleCache[k]; }
    if (tf === 'm') {
      if (minute) return { data: minute, live: true, unit: '1분' };
      const k = code + ':m'; candleCache[k] = candleCache[k] || synthMinute(code); return { data: candleCache[k], live: false, unit: '5분' };
    }
    if (tf === 'W') return { data: aggregate(daily, 'W'), live: isLive };
    if (tf === 'M') return { data: aggregate(daily, 'M'), live: isLive };
    return { data: daily, live: isLive };
  }

  // ── 장 운영시간 (KST) ──
  function kst() { const n = new Date(); return new Date(n.getTime() + (n.getTimezoneOffset() + 540) * 60000); }
  function usDST(d) { // 미국 서머타임: 3월 둘째 일요일 ~ 11월 첫째 일요일
    const y = d.getFullYear();
    const sun = (m, nth) => { const x = new Date(y, m, 1); const add = (7 - x.getDay()) % 7; return new Date(y, m, 1 + add + (nth - 1) * 7); };
    return d >= sun(2, 2) && d < sun(10, 1);
  }
  function session(market) {
    const k = kst(); const day = k.getDay(); const hm = k.getHours() * 60 + k.getMinutes();
    if (market === 'KOSPI' || market === 'KOSDAQ' || market === 'KR') {
      const open = day >= 1 && day <= 5 && hm >= 540 && hm < 930;
      return { open, label: open ? '장중' : hm < 540 && day >= 1 && day <= 5 ? '장 시작 전' : '장 마감', hours: '09:00~15:30' };
    }
    const dst = usDST(k); const o = dst ? 22 * 60 + 30 : 23 * 60 + 30; const c = dst ? 5 * 60 : 6 * 60;
    const open = (hm >= o && day >= 1 && day <= 5) || (hm < c && day >= 2 && day <= 6);
    return { open, label: open ? '장중' : '장 마감', hours: dst ? '22:30~05:00' : '23:30~06:00' };
  }

  const api = { init, refresh, on: ev.on, quote, list, allMeta, meta, book, bestAsk, bestBid, ticks, candles, fx, toKrw, session, setOverrides, isUS, get state() { return state; }, get universe() { return universe; } };
  return api;
})();
