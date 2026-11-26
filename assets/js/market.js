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
  // ── 국내 실시간 시세 (서버가 2초 캐시로 받아온 실시간 체결가·누적 거래량) ──
  const RT = { last: {}, ticks: {}, timer: 0, provider: null, busy: false, ok: 0 };
  function setLiveProvider(fn) { RT.provider = fn; if (!RT.timer) { RT.timer = setInterval(rtPoll, 2500); rtPoll(); } }
  function rtApply(code, d) {
    const q = state.items[code]; if (!q || q.currency !== 'KRW' || !d || !(d.price > 0)) return false;
    const pv = q._rv != null ? q._rv : null; const dv = pv != null ? d.volume - pv : 0; const dir = Math.sign(d.price - q.price);
    if (dv > 0) { const L = (RT.ticks[code] = RT.ticks[code] || []); L.unshift({ t: U.time(Date.now()), p: d.price, v: dv, side: dir || (L[0] ? L[0].side : 0) }); L.length = Math.min(L.length, 60); }
    q.dir = dir || q.dir; q.price = d.price; if (d.open) q.open = d.open; if (d.high) q.high = d.high; if (d.low) q.low = d.low;
    if (d.volume != null) { q.volume = d.volume; q._rv = d.volume; } if (d.change != null) q.change = d.change; if (d.changePct != null) q.changePct = d.changePct;
    q.rtAt = Date.now(); q.mkt = d.status;
    for (const k of [':D', ':m']) { const c = candleCache[code + k]; if (c && c.length) { const last = c[c.length - 1]; last.c = d.price; last.h = Math.max(last.h, d.price); last.l = Math.min(last.l, d.price); if (dv > 0) last.v += dv; } }
    return true;
  }
  async function rtPoll() {
    if (RT.busy || document.hidden || state.status !== 'LIVE' || !RT.provider || typeof Store === 'undefined' || !Store.rt) return;
    const codes = [...new Set((RT.provider() || []).filter((c) => state.items[c] && state.items[c].currency === 'KRW'))].slice(0, 40); if (!codes.length) return;
    RT.busy = true;
    try { const D = await Store.rt(codes); let n = 0; for (const c in D || {}) { RT.last[c] = D[c]; if (rtApply(c, D[c])) n++; } if (n) { RT.ok = Date.now(); state.updatedAt = new Date().toISOString(); ev.emit('update', state); } } catch {} finally { RT.busy = false; }
  }
  const isRealtime = (code) => { const q = state.items[code]; return !!(q && q.rtAt && Date.now() - q.rtAt < 15000); };
  let simTimer = null, pollTimer = null;

  const isUS = (s) => s && (s.market === 'NASDAQ' || s.market === 'NYSE' || s.market === 'AMEX');
  let metaMap = {};
  const meta = (code) => metaMap[code];
  const setStocks = (arr) => { universe.stocks = arr; metaMap = {}; for (const s of arr) metaMap[s.code] = s; };

  async function fetchJSON(url) {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Math.floor(Date.now() / 30000), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }

  async function init(opts = {}) {
    overrides = { hidden: [], base: {}, ...(opts.overrides || {}) };
    universe = await fetchJSON(C.LOCAL_DATA + '/universe.json'); setStocks(universe.stocks);
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
        if (j && j.items && Object.keys(j.items).length >= 5 && j.status === 'LIVE') { live = j; dataBase = base; break; }
      } catch {}
    }
    if (live) {
      stopSim();
      const prevItems = state.items;
      state = { status: 'LIVE', source: live.source, updatedAt: live.updatedAt, fx: live.fx || 1400, indices: live.indices || {}, items: {}, books: live.books || {}, ticks: {} };
      // 전 종목: 실시세 파일의 종목 목록을 그대로 사용 (기존 종목의 업종 정보는 유지)
      if (Object.keys(live.items).length > universe.stocks.length) {
        const old = metaMap;
        setStocks(Object.entries(live.items).filter(([, q]) => q && q.price > 0).sort((a, b) => (b[1].marketCap || 0) - (a[1].marketCap || 0))
          .map(([code, q]) => ({ code, name: q.name, market: q.market, sector: (old[code] && old[code].sector) || q.sector || (q.type === 'etf' ? 'ETF' : ''), sample: q.price })));
      }
      for (const s of universe.stocks) {
        const q = live.items[s.code];
        if (!q) continue;
        state.items[s.code] = { code: s.code, sector: s.sector, ...q, name: s.name, market: s.market, currency: isUS(s) ? 'USD' : 'KRW' };
        const it = state.items[s.code];
        if (it.currency === 'KRW' && it.prevClose) { it.upper = U.roundTick(it.prevClose * 1.3, 'KRW', 'floor'); it.lower = U.roundTick(it.prevClose * 0.7, 'KRW', 'ceil'); }
        const t = (live.ticks || {})[s.code];
        state.ticks[s.code] = t ? t.map(([hhmmss, p, v]) => ({ t: hhmmss.slice(0, 2) + ':' + hhmmss.slice(2, 4) + ':' + hhmmss.slice(4, 6), p, v, side: 0 })) : [];
        const old = prevItems[s.code]; state.items[s.code].dir = old ? Math.sign(state.items[s.code].price - old.price) : 0;
      }
      // 실시간으로 받은 값이 파일보다 최신이면 유지
      for (const c in RT.last) { const it = state.items[c]; if (it) { const o = prevItems[c]; if (o && o._rv != null) it._rv = o._rv; if (new Date(RT.last[c].at) > new Date(live.updatedAt)) rtApply(c, RT.last[c]); } }
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
    if (state.status === 'LIVE' && lb && lb.asks && lb.asks[0] && lb.asks[0][0] && lb.bids && lb.bids[0] && lb.bids[0][0] <= q.price && lb.asks[0][0] >= q.price) {
      const asks = lb.asks.slice(0, 10), bids = lb.bids.slice(0, 10);
      const avg = Math.max(1, Math.round([...asks, ...bids].reduce((t, x) => t + x[1], 0) / (asks.length + bids.length)));
      const r = U.rng(code + U.today());
      while (asks.length < 10) { const a = U.stepPrice(asks[asks.length - 1][0], 'KRW', 1); asks.push([a, Math.round(avg * (0.5 + r()))]); }
      while (bids.length < 10) { const b = U.stepPrice(bids[bids.length - 1][0], 'KRW', -1); bids.push([b, Math.round(avg * (0.5 + r()))]); }
      return { asks, bids, live: true };
    }
    // 합성 호가 (현재가 기준)
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
    if (RT.ticks[code] && RT.ticks[code].length) return RT.ticks[code];
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

  // ── 종목 정보 · 투자자 · 뉴스 (국내 거래대금 상위 500) / 지수 일봉 ──
  const infoCache = {};
  let picksCache = null;
  async function aiPicks() {
    if (picksCache && Date.now() - picksCache.at < 10 * 60000) return picksCache.data;
    let data = null;
    for (const base of [dataBase, ...C.DATA_URLS, C.LOCAL_DATA].filter(Boolean)) { try { data = await fetchJSON(base + '/ai/picks.json'); break; } catch {} }
    picksCache = { at: Date.now(), data }; return data;
  }
  async function info(code) {
    if (infoCache[code] && Date.now() - infoCache[code].at < 10 * 60000) return infoCache[code].data;
    let data = null;
    for (const base of [dataBase, ...C.DATA_URLS, C.LOCAL_DATA].filter(Boolean)) { try { data = await fetchJSON(base + '/info/' + code + '.json'); break; } catch {} }
    infoCache[code] = { at: Date.now(), data }; return data;
  }
  async function indexCandles(code) {
    const k = 'IX:' + code; if (candleCache[k] && Date.now() - candleCache[k].at < 10 * 60000) return candleCache[k].data;
    let d = [];
    for (const base of [dataBase, ...C.DATA_URLS, C.LOCAL_DATA].filter(Boolean)) { try { const j = await fetchJSON(base + '/index/' + code + '.json'); d = (j.d || []).map(([t, o, h, l, c, v]) => ({ t: parseYmd(t), o, h, l, c, v })); break; } catch {} }
    const ix = state.indices[code]; if (ix && d.length) { const last = d[d.length - 1]; const td = new Date(); td.setHours(0, 0, 0, 0); if (last.t < td.getTime() && code.match(/KOS/)) d.push({ t: td.getTime(), o: last.c, h: Math.max(last.c, ix.price), l: Math.min(last.c, ix.price), c: ix.price, v: 0 }); else { last.c = ix.price; last.h = Math.max(last.h, ix.price); last.l = Math.min(last.l, ix.price); } }
    candleCache[k] = { at: Date.now(), data: d }; return d;
  }

  // ── 장 운영시간 (KST) ──
  function kst() { const n = new Date(); return new Date(n.getTime() + (n.getTimezoneOffset() + 540) * 60000); }
  function usDST(d) { // 미국 서머타임: 3월 둘째 일요일 ~ 11월 첫째 일요일
    const y = d.getFullYear();
    const sun = (m, nth) => { const x = new Date(y, m, 1); const add = (7 - x.getDay()) % 7; return new Date(y, m, 1 + add + (nth - 1) * 7); };
    return d >= sun(2, 2) && d < sun(10, 1);
  }
  // 세션: 국내(KST) 장전 시간외 종가 08:30~08:40 · 동시호가 08:40~09:00 · 정규장 09:00~15:20 · 마감 동시호가 15:20~15:30
  //       장후 시간외 종가 15:40~16:00 · 시간외 단일가 16:00~18:00 / 미국(뉴욕) 프리 04:00~09:30 · 정규 09:30~16:00 · 애프터 16:00~20:00
  const SES_KR = [[510, 520, 'pre_close', '장전 시간외 종가'], [520, 540, 'pre_auction', '장 시작 동시호가'], [540, 920, 'regular', '정규장'], [920, 930, 'close_auction', '장 마감 동시호가'], [930, 940, 'post_wait', '장 마감'], [940, 960, 'post_close', '장후 시간외 종가'], [960, 1080, 'single', '시간외 단일가']];
  const SES_US = [[240, 570, 'pre', '프리마켓'], [570, 960, 'regular', '정규장'], [960, 1200, 'after', '애프터마켓']];
  const EXT = ['pre_close', 'post_close', 'single', 'pre', 'after'];
  let holidays = [];
  function nyNow() { const k = kst(); const off = usDST(k) ? 13 : 14; return new Date(k.getTime() - off * 3600000); }
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  function session(market) {
    const kr = market === 'KOSPI' || market === 'KOSDAQ' || market === 'KONEX' || market === 'KR';
    const t = kr ? kst() : nyNow(); const day = t.getDay(); const hm = t.getHours() * 60 + t.getMinutes();
    const ymd = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const T = kr ? SES_KR : SES_US; const work = day >= 1 && day <= 5 && !(kr && holidays.includes(ymd));
    const cur = work ? T.find(([a, b]) => hm >= a && hm < b) : null;
    const code = cur ? cur[2] : 'closed'; const label = cur ? cur[3] : (work && hm < T[0][0] ? '장 시작 전' : '장 마감');
    // 다음 이벤트까지 남은 시간
    let left = null, nextLabel = '';
    if (cur) { left = cur[1] - hm; const nx = T.find(([a]) => a === cur[1]); nextLabel = nx ? nx[3] : '장 마감'; }
    else if (work && hm < T[0][0]) { left = T[0][0] - hm; nextLabel = T[0][3]; }
    const toK = (m) => (kr ? hhmm(m) : hhmm(m + (usDST(kst()) ? 13 * 60 : 14 * 60)));
    const hours = kr ? '09:00~15:30' : `${toK(570)}~${toK(960)}`;
    return { code, label, open: code === 'regular', ext: EXT.includes(code), left, nextLabel, hours, kr,
      extHours: kr ? '장전 08:30~08:40 · 장후 15:40~16:00 · 단일가 16:00~18:00' : `프리 ${toK(240)}~${toK(570)} · 애프터 ${toK(960)}~${toK(1200)} (한국시간)` };
  }
  function setHolidays(h) { holidays = Array.isArray(h) ? h : []; }

  const api = { init, refresh, on: ev.on, info, aiPicks, indexCandles, quote, list, allMeta, meta, book, bestAsk, bestBid, ticks, candles, fx, toKrw, session, setHolidays, setOverrides, isUS, setLiveProvider, isRealtime, rtPoll, get rtOk() { return RT.ok; }, get state() { return state; }, get universe() { return universe; } };
  return api;
})();
