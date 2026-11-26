// MAX라이프 주식 — 코인 선물(가상 USDT · 무기한) · 스테이킹 · USDT 지갑
// 시세: OKX 공개 시세(웹소켓 실시간 + REST 캔들). 체결·청산은 서버(Supabase)가 처리합니다.
(() => {
  const { $, $$, esc, won, n0, cls, ICON } = U;
  const M = () => window.MLS;
  const SYMN = { BTC: '비트코인', ETH: '이더리움', SOL: '솔라나', XRP: '리플', DOGE: '도지코인', BNB: 'BNB', ADA: '에이다', AVAX: '아발란체', LINK: '체인링크', TON: '톤코인', SUI: '수이', TRX: '트론', DOT: '폴카닷', LTC: '라이트코인', NEAR: '니어', APT: '앱토스', ARB: '아비트럼', OP: '옵티미즘', PEPE: '페페', SHIB: '시바이누' };
  const cp = (v) => { if (v == null || !isFinite(v)) return '-'; const a = Math.abs(v); return a >= 1000 ? v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : a >= 10 ? v.toFixed(2) : a >= 1 ? v.toFixed(4) : a >= 0.01 ? v.toFixed(5) : v.toPrecision(4); };
  const usd = (v, d = 2) => (v == null || !isFinite(v) ? '-' : (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const sgn = (v, d = 2) => (v > 0 ? '+' : '') + usd(v, d);
  const qtyFmt = (q) => (q >= 100 ? n0(q) : q >= 1 ? (+q.toFixed(4)).toString() : (+q.toPrecision(4)).toString());

  // ───────── 실시간 시세 ─────────
  const CF = {
    t: {}, books: {}, trades: {}, ws: null, subs: new Set(), ev: U.emitter(), ok: false, lastMsg: 0,
    syms() { return (M().S.st.cfSymbols || ['BTC', 'ETH', 'SOL']).slice(); },
    inst: (s) => s + '-USDT-SWAP',
    async init() {
      if (this._init) return; this._init = true;
      try { const r = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SWAP'); const j = await r.json(); const set = new Set(this.syms()); for (const x of j.data || []) { const s = x.instId.split('-')[0]; if (x.instId.endsWith('-USDT-SWAP') && set.has(s)) this.put(x); } this.ev.emit('tick'); } catch {}
      this.connect();
      setInterval(() => { if (Date.now() - this.lastMsg > 20000) this.connect(); }, 10000);
    },
    put(x) { const s = x.instId.split('-')[0]; const last = +x.last; const o = +x.open24h || last; this.t[s] = { sym: s, last, open24: o, chg: o ? ((last - o) / o) * 100 : 0, high: +x.high24h, low: +x.low24h, vol: (+x.volCcy24h || 0) * last, bid: +x.bidPx || last, ask: +x.askPx || last, at: Date.now() }; },
    connect() {
      try { if (this.ws) this.ws.close(); } catch {}
      let ws; try { ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public'); } catch { return; }
      this.ws = ws; this.lastMsg = Date.now();
      ws.onopen = () => { this.ok = true; ws.send(JSON.stringify({ op: 'subscribe', args: this.syms().map((s) => ({ channel: 'tickers', instId: this.inst(s) })) })); for (const s of this.subs) this.subBook(s, true); this.ev.emit('status'); this._ping = setInterval(() => { try { ws.send('ping'); } catch {} }, 20000); };
      ws.onclose = () => { this.ok = false; clearInterval(this._ping); this.ev.emit('status'); };
      ws.onmessage = (m) => {
        this.lastMsg = Date.now(); if (m.data === 'pong') return; let j; try { j = JSON.parse(m.data); } catch { return; }
        if (!j.arg || !j.data) return; const ch = j.arg.channel; const s = j.arg.instId.split('-')[0];
        if (ch === 'tickers') { for (const x of j.data) this.put(x); this.ev.emit('tick', s); }
        else if (ch === 'books5') { const b = j.data[0]; this.books[s] = { asks: b.asks.map((a) => [+a[0], +a[1]]), bids: b.bids.map((a) => [+a[0], +a[1]]), at: Date.now() }; this.ev.emit('book', s); }
        else if (ch === 'trades') { const L = (this.trades[s] = this.trades[s] || []); for (const x of j.data) L.unshift({ px: +x.px, sz: +x.sz, side: x.side, ts: +x.ts }); L.length = Math.min(L.length, 40); this.ev.emit('trades', s); }
      };
    },
    subBook(s, force) {
      if (this.subs.has(s) && !force) return; this.subs.add(s);
      try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'books5', instId: this.inst(s) }, { channel: 'trades', instId: this.inst(s) }] })); } catch {}
    },
    unsubBook(s) { this.subs.delete(s); try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ op: 'unsubscribe', args: [{ channel: 'books5', instId: this.inst(s) }, { channel: 'trades', instId: this.inst(s) }] })); } catch {} },
    // 웹소켓이 막힌 환경: 호가·체결을 REST로 2초마다 보충
    async restBook(s) {
      if (this.books[s] && Date.now() - (this.books[s].at || 0) < 4000) return;
      try {
        const [b, t] = await Promise.all([fetch(`https://www.okx.com/api/v5/market/books?instId=${this.inst(s)}&sz=10`).then((r) => r.json()), fetch(`https://www.okx.com/api/v5/market/trades?instId=${this.inst(s)}&limit=20`).then((r) => r.json())]);
        const d = b.data && b.data[0]; if (d) { this.books[s] = { asks: d.asks.map((a) => [+a[0], +a[1]]), bids: d.bids.map((a) => [+a[0], +a[1]]), at: Date.now(), rest: true }; this.ev.emit('book', s); }
        if (t.data && t.data.length) { this.trades[s] = t.data.map((x) => ({ px: +x.px, sz: +x.sz, side: x.side, ts: +x.ts })); this.ev.emit('trades', s); }
        if (!this.ok) { const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${this.inst(s)}`).then((r) => r.json()); if (r.data && r.data[0]) { this.put(r.data[0]); this.ev.emit('tick', s); } }
      } catch {}
    },
    async candles(s, bar) {
      const r = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${this.inst(s)}&bar=${bar}&limit=300`); const j = await r.json();
      return (j.data || []).map((c) => ({ t: +c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[5] })).reverse();
    },
    async fng() { try { const r = await fetch('https://api.alternative.me/fng/?limit=1'); const j = await r.json(); return j.data && j.data[0] ? { v: +j.data[0].value, label: j.data[0].value_classification } : null; } catch { return null; } },
  };
  window.CF = CF;

  // 공통 상태 (서버)
  const W = { st: null, at: 0, async load(force) { if (!force && this.st && Date.now() - this.at < 4000) return this.st; this.st = await Store.cfState(); this.at = Date.now(); return this.st; } };
  // 강제청산 근접 경고 (설정: liqWarn %, liqCooldown 분)
  const warned = {};
  function liqWarn(positions) {
    const st = M().S.st; const th = st.liqWarn || 20; const cd = (st.liqCooldown || 10) * 60000;
    for (const p of positions || []) {
      const t = CF.t[p.sym]; if (!t) continue; const px = t.last; const dist = Math.abs(px - p.liq) / Math.abs(p.entry - p.liq || 1) * 100;
      if (dist <= th && Date.now() - (warned[p.sym] || 0) > cd) { warned[p.sym] = Date.now(); const m = `${p.sym} ${p.side === 'long' ? '롱' : '숏'} 포지션이 강제 청산가(${cp(p.liq)})에 가까워졌습니다.`; U.toast(m, true); M().Voice.say(`${SYMN[p.sym] || p.sym} 포지션이 강제 청산가에 가까워졌습니다.`); M().notify('청산 경고', m); }
    }
  }

  // USDT 지갑 전환 모달
  function convertDlg(after) {
    const S = M().S; const st = W.st || {}; const fx = st.fx || 1350; let dir = 'toUsdt';
    U.modal({ title: '원화 ↔ USDT 전환', body: `<div class="seg" id="cvD" style="width:100%;margin-bottom:12px"><button data-v="toUsdt" class="on" style="flex:1">원화 → USDT</button><button data-v="toKrw" style="flex:1">USDT → 원화</button></div>
      <div class="field"><label id="cvL">전환할 원화</label><input class="input" id="cvA" inputmode="decimal" placeholder="0"></div><div class="pct-row" id="cvP"><button data-r=".25">25%</button><button data-r=".5">50%</button><button data-r="1">전액</button></div>
      <dl class="kv" style="margin-top:12px"><dt>원화 예수금</dt><dd>${won(S.v ? S.v.orderable : st.cash)}</dd><dt>USDT 지갑</dt><dd>${usd(st.usdt || 0)} USDT</dd><dt>적용 환율</dt><dd>1 USDT = ${n0(fx)}원</dd><dt><b>받는 금액</b></dt><dd id="cvR" class="brand">-</dd></dl>
      <p class="dim" style="font-size:12px;margin:8px 0 0">앱 안의 가상 자산 간 전환이며 실제 코인으로 지급되지 않습니다.</p>`,
      foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="cvGo">전환</button>',
      onMount: (m, close) => {
        const calc = () => { const a = parseFloat(($('#cvA', m).value || '').replace(/,/g, '')) || 0; $('#cvR', m).textContent = a ? (dir === 'toUsdt' ? usd(a / fx) + ' USDT' : won(Math.round(a * fx))) : '-'; };
        $$('#cvD button', m).forEach((b) => (b.onclick = () => { dir = b.dataset.v; $$('#cvD button', m).forEach((x) => x.classList.toggle('on', x === b)); $('#cvL', m).textContent = dir === 'toUsdt' ? '전환할 원화' : '전환할 USDT'; $('#cvA', m).value = ''; calc(); }));
        $('#cvA', m).oninput = calc;
        $$('#cvP button', m).forEach((b) => (b.onclick = () => { const max = dir === 'toUsdt' ? Math.floor(S.v ? S.v.orderable : st.cash) : Math.floor((st.usdt || 0) * 100) / 100; $('#cvA', m).value = dir === 'toUsdt' ? Math.floor(max * +b.dataset.r) : (Math.floor(max * +b.dataset.r * 100) / 100); calc(); }));
        $('#cvGo', m).onclick = async () => { const a = parseFloat(($('#cvA', m).value || '').replace(/,/g, '')) || 0; if (!a) return U.toast('금액을 입력해 주세요.', true); try { await Store.cfConvert(dir, a); close(); U.toast('전환되었습니다.'); M().Voice.say('전환이 완료되었습니다.'); await W.load(true); after && after(); } catch (e) { U.toast(e.message, true); } };
      } });
  }

  // ═════════ 코인 선물 ═════════
  function Futures(main, symArg) {
    const S = M().S; const syms = CF.syms(); let sym = (symArg || 'BTC').toUpperCase(); if (!syms.includes(sym)) sym = syms[0];
    const O = { side: 'buy', type: 'market', lev: +(localStorage.getItem('mls.cf.lev') || 10), qtyMode: 'usdt', amt: '', price: '', tp: '', sl: '', reduce: false, oneClick: localStorage.getItem('mls.cf.oc') === '1' };
    let tab = 'pos', bar = localStorage.getItem('mls.cf.bar') || '15m', mk = 'all', q = '';
    const maxLev = S.st.cfMaxLev || 100;
    main.innerHTML = `
      <div class="cf-top" id="cfTop"></div>
      <div class="cf-grid">
        <aside class="panel cf-list"><div class="panel-h" style="gap:8px"><div class="search" style="flex:1">${ICON.search}<input id="cfQ" placeholder="코인 검색" style="width:100%"></div></div>
          <div class="seg cf-seg" id="cfMk"><button data-v="all" class="on">전체</button><button data-v="up">상승</button><button data-v="down">하락</button><button data-v="vol">거래대금</button></div><div id="cfL"></div><div class="cf-fng" id="cfFng"></div></aside>
        <section class="cf-center">
          <div class="panel"><div class="cf-head" id="cfHead"></div>
            <div class="chart-tools" style="padding:0 12px"><div class="seg" id="cfBar">${['1m', '5m', '15m', '1H', '4H', '1D'].map((b) => `<button data-v="${b}" class="${b === bar ? 'on' : ''}">${b.replace('m', '분').replace('H', '시간').replace('1D', '일')}</button>`).join('')}</div><span class="dim" style="font-size:12px;margin-left:auto" id="cfWs"></span></div>
            <div class="chart-box" style="height:400px"><div class="chart-tip" id="cfTip"></div><canvas id="cfChart"></canvas></div></div>
          <div class="panel"><div class="tabs" id="cfTab" style="padding:0 12px">${[['pos', '포지션'], ['open', '미체결'], ['hist', '체결 내역'], ['flow', 'USDT 내역']].map(([k, n]) => `<button data-v="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}<span style="margin-left:auto;display:flex;gap:6px;align-items:center"><button class="btn btn-sm" id="cfCloseAll">일괄 청산</button><button class="btn btn-sm" id="cfCancelAll">미체결 전체 취소</button></span></div><div id="cfBottom"></div></div>
        </section>
        <aside class="cf-right">
          <div class="panel cf-book-p"><div class="panel-h"><h3>호가</h3><label class="dim" style="font-size:12px;display:flex;gap:4px;align-items:center"><input type="checkbox" id="cfOC" ${O.oneClick ? 'checked' : ''}> 호가 원터치 주문</label></div><div id="cfBook"></div><div class="cf-trades" id="cfTr"></div></div>
          <div class="panel cf-order" id="cfOrder"></div>
        </aside>
      </div>`;
    const chart = Chart.candle($('#cfChart'), { ccy: 'COIN', tip: $('#cfTip'), view: window.innerWidth < 760 ? 60 : 110, ma: [7, 25, 99], tf: bar === '1D' ? 'D' : 'm' });
    CF.subBook(sym);
    async function loadChart() { try { const d = await CF.candles(sym, bar); chart.set({ data: d, tf: bar === '1D' ? 'D' : 'm', offset: 0, lines: posLines() }); } catch { } }
    function posLines() { const p = W.st && W.st.positions.find((x) => x.sym === sym); if (!p) return []; return [{ price: p.entry, label: '진입', color: Chart.css('--brand') }, { price: p.liq, label: '청산', color: Chart.css('--warn') }].concat(p.tp ? [{ price: p.tp, label: '익절', color: Chart.css('--up') }] : []).concat(p.sl ? [{ price: p.sl, label: '손절', color: Chart.css('--down') }] : []); }
    $('#cfBar').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; bar = b.dataset.v; localStorage.setItem('mls.cf.bar', bar); $$('#cfBar button').forEach((x) => x.classList.toggle('on', x === b)); loadChart(); };
    $('#cfMk').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; mk = b.dataset.v; $$('#cfMk button').forEach((x) => x.classList.toggle('on', x === b)); list(); };
    $('#cfQ').oninput = (e) => { q = e.target.value.trim().toUpperCase(); list(); };
    $('#cfOC').onchange = (e) => { O.oneClick = e.target.checked; localStorage.setItem('mls.cf.oc', O.oneClick ? '1' : '0'); U.toast(O.oneClick ? '호가를 누르면 그 가격으로 바로 지정가 주문합니다.' : '호가를 누르면 가격만 입력합니다.'); };
    $('#cfTab').onclick = (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; tab = b.dataset.v; $$('#cfTab button[data-v]').forEach((x) => x.classList.toggle('on', x === b)); bottom(); };
    $('#cfCloseAll').onclick = async () => { const P = (W.st && W.st.positions) || []; if (!P.length) return U.toast('보유 포지션이 없습니다.'); if (!(await U.confirmBox('일괄 청산', `포지션 ${P.length}개를 모두 시장가로 청산할까요?`, '일괄 청산', 'btn-danger'))) return; for (const p of P) { try { await Store.cfClose(p.sym); } catch (e) { U.toast(e.message, true); } } M().Voice.say('모든 포지션을 청산했습니다.'); refresh(true); };
    $('#cfCancelAll').onclick = async () => { await Store.cfCancel(null, true); U.toast('미체결 주문을 모두 취소했습니다.'); refresh(true); };

    function list() {
      const L = syms.map((s) => CF.t[s] ? CF.t[s] : { sym: s, last: null, chg: 0, vol: 0 }).filter((t) => !q || t.sym.includes(q) || (SYMN[t.sym] || '').includes(q));
      if (mk === 'up') L.sort((a, b) => b.chg - a.chg); else if (mk === 'down') L.sort((a, b) => a.chg - b.chg); else if (mk === 'vol') L.sort((a, b) => b.vol - a.vol);
      $('#cfL').innerHTML = L.map((t) => `<a class="cf-row ${t.sym === sym ? 'on' : ''}" href="#/futures/${t.sym}"><span class="cf-ic">${t.sym.slice(0, 1)}</span><span class="cf-nm"><b>${t.sym}<small>USDT</small></b><small>${SYMN[t.sym] || ''}</small></span><span class="cf-px"><b class="${cls(t.chg)}">${cp(t.last)}</b><small class="${cls(t.chg)}">${t.chg > 0 ? '+' : ''}${t.chg.toFixed(2)}%</small></span></a>`).join('');
    }
    function head() {
      const t = CF.t[sym] || {}; const st = W.st;
      $('#cfHead').innerHTML = `<div class="cf-hl"><span class="cf-ic lg">${sym.slice(0, 1)}</span><div><b>${sym}USDT <span class="tag tag-no">무기한</span></b><small>${SYMN[sym] || ''} · 가상 USDT</small></div></div>
        <div class="cf-hp"><b class="${cls(t.chg)}">${cp(t.last)}</b><small class="${cls(t.chg)}">${t.chg > 0 ? '+' : ''}${(t.chg || 0).toFixed(2)}%</small></div>
        <dl class="cf-hs"><div><dt>24시간 고가</dt><dd>${cp(t.high)}</dd></div><div><dt>24시간 저가</dt><dd>${cp(t.low)}</dd></div><div><dt>24시간 거래대금</dt><dd>${t.vol ? (t.vol / 1e6).toFixed(1) + 'M' : '-'}</dd></div><div><dt>원화 환산</dt><dd>${t.last && st ? won(Math.round(t.last * st.fx)) : '-'}</dd></div></dl>`;
      $('#cfWs').innerHTML = CF.ok ? '<span class="brand">●</span> 실시간 연결' : CF.books[sym] && CF.books[sym].rest ? '<span class="brand">●</span> 실시간 (2초 갱신)' : '<span style="color:var(--warn)">●</span> 연결 중…';
    }
    function top() {
      const st = W.st; if (!st) { $('#cfTop').innerHTML = ''; return; }
      const up = st.positions.reduce((s, p) => s + liveUpnl(p), 0), mg = st.positions.reduce((s, p) => s + p.margin, 0);
      const eq = st.usdt + mg + up;
      $('#cfTop').innerHTML = `<div class="cf-sum"><div><small>USDT 지갑 (주문 가능)</small><b>${usd(st.usdt)}</b></div><div><small>사용 중 증거금</small><b>${usd(mg)}</b></div><div><small>미실현 손익</small><b class="${cls(up)}">${sgn(up)}</b></div><div><small>총 평가 (USDT)</small><b>${usd(eq)}</b><em>≈ ${won(Math.round(eq * st.fx))}</em></div><div class="cf-sum-act"><button class="btn btn-sm btn-brand" id="cfCv">원화 ↔ USDT 전환</button><a class="btn btn-sm" href="#/staking">스테이킹</a></div></div>`;
      $('#cfCv').onclick = () => convertDlg(() => refresh(true));
    }
    function liveUpnl(p) { const t = CF.t[p.sym]; const px = t ? t.last : p.mark; return p.side === 'long' ? (px - p.entry) * p.qty : (p.entry - px) * p.qty; }
    function book() {
      const b = CF.books[sym]; const t = CF.t[sym] || {};
      if (!b) { $('#cfBook').innerHTML = '<div class="empty">호가 불러오는 중…</div>'; return; }
      const mx = Math.max(...b.asks.map((a) => a[1]), ...b.bids.map((a) => a[1]), 1);
      const row = (p, s, k) => `<div class="cf-br ${k}" data-px="${p}"><span class="p">${cp(p)}</span><span class="s">${qtyFmt(s)}</span><i style="width:${(s / mx) * 100}%"></i></div>`;
      $('#cfBook').innerHTML = `<div class="cf-bh"><span>가격 (USDT)</span><span>수량</span></div>${b.asks.slice(0, 5).reverse().map((a) => row(a[0], a[1], 'ask')).join('')}<div class="cf-mid ${cls(t.chg)}">${cp(t.last)}</div>${b.bids.slice(0, 5).map((a) => row(a[0], a[1], 'bid')).join('')}`;
    }
    $('#cfBook').onclick = async (e) => {
      const r = e.target.closest('[data-px]'); if (!r) return; const px = +r.dataset.px;
      if (O.oneClick) { const side = r.classList.contains('ask') ? 'sell' : 'buy'; O.type = 'limit'; O.price = px; O.side = side; form(); return submit(true); }
      O.type = 'limit'; O.price = px; form();
    };
    function trades() { const L = CF.trades[sym] || []; $('#cfTr').innerHTML = `<div class="cf-bh"><span>체결가</span><span>수량</span><span>시간</span></div>` + L.slice(0, 14).map((x) => `<div class="cf-tr"><span class="${x.side === 'buy' ? 'up' : 'down'}">${cp(x.px)}</span><span>${qtyFmt(x.sz)}</span><span class="dim">${new Date(x.ts).toTimeString().slice(0, 8)}</span></div>`).join(''); }
    function curPx() { const t = CF.t[sym]; return O.type === 'limit' && +O.price ? +O.price : t ? (O.side === 'buy' ? t.ask : t.bid) : 0; }
    function qtyCoin() { const a = parseFloat(String(O.amt).replace(/,/g, '')) || 0; const px = curPx(); if (!px) return 0; return O.qtyMode === 'usdt' ? (a * O.lev) / px : a; }
    function form() {
      const st = W.st || { usdt: 0, positions: [] }; const px = curPx(); const qc = qtyCoin(); const notional = qc * px; const margin = notional / O.lev;
      const fee = notional * ((O.type === 'limit' ? S.st.cfMakerFee ?? 0.02 : S.st.cfTakerFee ?? 0.05) / 100); const mm = (S.st.cfMaint ?? 0.5) / 100;
      const liq = O.side === 'buy' ? px * (1 - 1 / O.lev + mm) : px * (1 + 1 / O.lev - mm);
      const pos = st.positions.find((x) => x.sym === sym);
      $('#cfOrder').innerHTML = `<div class="cf-ls"><button class="${O.side === 'buy' ? 'on buy' : ''}" data-s="buy">롱 (매수)</button><button class="${O.side === 'sell' ? 'on sell' : ''}" data-s="sell">숏 (매도)</button></div>
        <div class="panel-b" style="padding-top:12px">
          <div style="display:flex;gap:8px;margin-bottom:10px"><div class="seg" id="cfT" style="flex:1"><button data-v="market" class="${O.type === 'market' ? 'on' : ''}" style="flex:1">시장가</button><button data-v="limit" class="${O.type === 'limit' ? 'on' : ''}" style="flex:1">지정가</button></div><button class="btn btn-sm cf-lev" id="cfLev">${O.lev}x</button></div>
          ${O.type === 'limit' ? `<div class="field"><label>주문 가격 (USDT)</label><input class="input" id="cfPx" inputmode="decimal" value="${O.price || cp(CF.t[sym] ? CF.t[sym].last : 0).replace(/,/g, '')}"></div>` : ''}
          <div class="field"><label style="display:flex;justify-content:space-between">수량 <span class="seg sm" id="cfQM"><button data-v="usdt" class="${O.qtyMode === 'usdt' ? 'on' : ''}">증거금 USDT</button><button data-v="coin" class="${O.qtyMode === 'coin' ? 'on' : ''}">${sym}</button></span></label><input class="input" id="cfAmt" inputmode="decimal" value="${O.amt}" placeholder="${O.qtyMode === 'usdt' ? '사용할 증거금 (USDT)' : '코인 수량'}"></div>
          <div class="pct-row" id="cfPct"><button data-r=".1">10%</button><button data-r=".25">25%</button><button data-r=".5">50%</button><button data-r="1">최대</button></div>
          <details class="cf-tpsl" ${O.tp || O.sl ? 'open' : ''}><summary>익절 · 손절 설정</summary><div class="cf-tpsl-b"><div class="field"><label>익절가</label><input class="input" id="cfTp" inputmode="decimal" value="${O.tp}" placeholder="${O.side === 'buy' ? '현재가보다 높게' : '현재가보다 낮게'}"></div><div class="field"><label>손절가</label><input class="input" id="cfSl" inputmode="decimal" value="${O.sl}" placeholder="${O.side === 'buy' ? '현재가보다 낮게' : '현재가보다 높게'}"></div></div><div class="pct-row" id="cfTpP"><button data-tp="1">익절 +1%</button><button data-tp="3">+3%</button><button data-tp="5">+5%</button><button data-sl="1">손절 -1%</button><button data-sl="2">-2%</button></div></details>
          <label class="dim" style="font-size:12px;display:flex;gap:6px;align-items:center;margin:8px 0"><input type="checkbox" id="cfRO" ${O.reduce ? 'checked' : ''}> 포지션 줄이기만 (reduce only)</label>
          <dl class="kv cf-kv"><dt>주문 가능</dt><dd>${usd(st.usdt)} USDT</dd><dt>주문 수량</dt><dd>${qc ? qtyFmt(qc) + ' ' + sym : '-'}</dd><dt>포지션 규모</dt><dd>${notional ? usd(notional) + ' USDT' : '-'}</dd><dt>필요 증거금</dt><dd>${margin ? usd(margin) : '-'}</dd><dt>수수료 (${O.type === 'limit' ? '지정가' : '시장가'})</dt><dd>${fee ? usd(fee, 4) : '-'}</dd><dt>예상 청산가</dt><dd class="warn-t">${qc ? cp(liq) : '-'}</dd></dl>
          <button class="btn btn-block btn-lg ${O.side === 'buy' ? 'btn-buy' : 'btn-sell'}" id="cfGo">${O.side === 'buy' ? '롱 진입 (매수)' : '숏 진입 (매도)'}</button>
          ${pos ? `<p class="dim" style="font-size:12px;margin-top:8px">현재 ${pos.side === 'long' ? '롱' : '숏'} ${qtyFmt(pos.qty)} ${sym} 보유 중 · 반대 방향 주문은 먼저 포지션을 줄이고 남는 수량만 반대로 진입합니다.</p>` : ''}
          <p class="dim" style="font-size:11px;margin-top:8px;line-height:1.6">F9 롱 시장가 · F10 숏 시장가 · Ctrl+Enter 주문 · 실제 시세로 체결되는 가상 USDT 거래이며 실제 코인으로 지급되지 않습니다.</p>
        </div>`;
      $$('[data-s]', $('#cfOrder')).forEach((b) => (b.onclick = () => { O.side = b.dataset.s; form(); }));
      $('#cfT').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; O.type = b.dataset.v; if (O.type === 'limit' && !O.price && CF.t[sym]) O.price = CF.t[sym].last; form(); };
      $('#cfQM').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); O.qtyMode = b.dataset.v; O.amt = ''; form(); };
      const ai = $('#cfAmt'); ai.oninput = () => { O.amt = ai.value; sumOnly(); };
      const pi = $('#cfPx'); if (pi) pi.oninput = () => { O.price = pi.value; sumOnly(); };
      $('#cfTp').oninput = (e) => { O.tp = e.target.value; }; $('#cfSl').oninput = (e) => { O.sl = e.target.value; };
      $('#cfRO').onchange = (e) => { O.reduce = e.target.checked; };
      $('#cfPct').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const avail = (W.st ? W.st.usdt : 0) / (1 + O.lev * ((S.st.cfTakerFee ?? 0.05) / 100)); const v = avail * +b.dataset.r; O.amt = O.qtyMode === 'usdt' ? Math.floor(v * 100) / 100 : +((v * O.lev) / (curPx() || 1)).toPrecision(5); form(); };
      $('#cfTpP').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const px = curPx(); if (b.dataset.tp) O.tp = +(px * (1 + (O.side === 'buy' ? 1 : -1) * b.dataset.tp / 100)).toPrecision(6); if (b.dataset.sl) O.sl = +(px * (1 - (O.side === 'buy' ? 1 : -1) * b.dataset.sl / 100)).toPrecision(6); form(); };
      $('#cfLev').onclick = levDlg;
      $('#cfGo').onclick = () => submit(false);
    }
    function sumOnly() { const x = document.activeElement && document.activeElement.id; form(); if (x) { const el = document.getElementById(x); if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; } } }
    function levDlg() {
      U.modal({ title: '레버리지 설정', body: `<div class="cf-levv" id="lvV">${O.lev}x</div><input type="range" id="lvR" min="1" max="${maxLev}" value="${O.lev}" style="width:100%"><div class="pct-row" id="lvP">${[1, 5, 10, 20, 50, 100, 125].filter((x) => x <= maxLev).map((x) => `<button data-l="${x}">${x}x</button>`).join('')}</div><p class="dim" style="font-size:12px;margin:10px 0 0">레버리지가 높을수록 적은 증거금으로 큰 포지션을 잡지만, 작은 가격 변동에도 강제 청산될 수 있습니다. 최대 ${maxLev}배 (관리자 설정)</p>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="lvOk">적용</button>', onMount: (m, close) => { const r = $('#lvR', m); r.oninput = () => { $('#lvV', m).textContent = r.value + 'x'; }; $$('#lvP button', m).forEach((b) => (b.onclick = () => { r.value = b.dataset.l; r.oninput(); })); $('#lvOk', m).onclick = () => { O.lev = +r.value; localStorage.setItem('mls.cf.lev', O.lev); close(); form(); }; } });
    }
    async function submit(oneClick) {
      const qc = qtyCoin(); if (!qc) return U.toast('수량을 입력해 주세요.', true);
      const body = { sym, side: O.side, type: O.type, qty: +qc.toPrecision(8), lev: O.lev, price: O.type === 'limit' ? +String(O.price).replace(/,/g, '') : 0, tp: +O.tp || 0, sl: +O.sl || 0, reduceOnly: O.reduce };
      if (!oneClick) { const ok = await U.confirmBox(`${O.side === 'buy' ? '롱' : '숏'} 주문 확인`, `<dl class="kv" style="font-size:14px"><dt>종목</dt><dd>${sym}USDT 무기한</dd><dt>방향</dt><dd class="${O.side === 'buy' ? 'up' : 'down'}">${O.side === 'buy' ? '롱 (매수)' : '숏 (매도)'} · ${O.lev}x</dd><dt>유형</dt><dd>${O.type === 'market' ? '시장가' : '지정가 ' + cp(body.price)}</dd><dt>수량</dt><dd>${qtyFmt(body.qty)} ${sym}</dd><dt>포지션 규모</dt><dd>${usd(body.qty * curPx())} USDT</dd>${body.tp ? `<dt>익절</dt><dd>${cp(body.tp)}</dd>` : ''}${body.sl ? `<dt>손절</dt><dd>${cp(body.sl)}</dd>` : ''}</dl>`, '주문', O.side === 'buy' ? 'btn-buy' : 'btn-sell'); if (!ok) return; }
      try {
        const r = await Store.cfOrder(body); const f = r.fill;
        if (f && f.price) { M().chime(); U.toast(`체결 · ${sym} ${O.side === 'buy' ? '롱' : '숏'} ${qtyFmt(f.qty)} @ ${cp(f.price)}${f.pnl ? ` · 실현손익 ${sgn(f.pnl)}` : ''}`); M().Voice.say(`${SYMN[sym] || sym} ${O.side === 'buy' ? '롱' : '숏'} 주문이 체결되었습니다.`); }
        else { U.toast(`지정가 주문 접수 · ${cp(body.price)} 도달 시 체결`); M().Voice.say('지정가 주문이 접수되었습니다.'); }
        O.amt = ''; refresh(true);
      } catch (e) { U.toast(e.message, true); }
    }
    function bottom() {
      const st = W.st; const el = $('#cfBottom'); if (!st) { el.innerHTML = '<div class="empty">불러오는 중…</div>'; return; }
      if (tab === 'pos') {
        el.innerHTML = st.positions.length ? `<div class="table-wrap"><table class="t"><thead><tr><th class="l">종목</th><th>수량</th><th>진입가</th><th>현재가</th><th>청산가</th><th>증거금</th><th>미실현 손익 (ROE)</th><th>익절 / 손절</th><th></th></tr></thead><tbody>${st.positions.map((p) => { const t = CF.t[p.sym]; const px = t ? t.last : p.mark; const u = liveUpnl(p); return `<tr><td class="l"><a href="#/futures/${p.sym}"><b>${p.sym}USDT</b></a> <span class="tag ${p.side === 'long' ? 'tag-buy' : 'tag-sell'}">${p.side === 'long' ? '롱' : '숏'} ${p.lev}x</span></td><td>${qtyFmt(p.qty)}</td><td>${cp(p.entry)}</td><td>${cp(px)}</td><td class="warn-t">${cp(p.liq)}</td><td>${usd(p.margin)}</td><td class="${cls(u)}"><b>${sgn(u)}</b> (${p.margin ? sgn((u / p.margin) * 100) : '0'}%)</td><td class="dim">${p.tp ? cp(p.tp) : '-'} / ${p.sl ? cp(p.sl) : '-'} <button class="btn btn-sm btn-ghost" data-ts="${p.sym}">설정</button></td><td style="white-space:nowrap"><button class="btn btn-sm" data-half="${p.sym}">50%</button> <button class="btn btn-sm btn-danger" data-close="${p.sym}">청산</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">보유 포지션이 없습니다</div>';
        $$('[data-close]', el).forEach((b) => (b.onclick = async () => { try { const r = await Store.cfClose(b.dataset.close); U.toast(`청산 완료 · 실현손익 ${sgn(r.pnl || 0)} USDT`); M().Voice.say('포지션을 청산했습니다.'); refresh(true); } catch (e) { U.toast(e.message, true); } }));
        $$('[data-half]', el).forEach((b) => (b.onclick = async () => { const p = st.positions.find((x) => x.sym === b.dataset.half); try { await Store.cfClose(p.sym, +(p.qty / 2).toPrecision(8)); U.toast('50% 청산했습니다.'); refresh(true); } catch (e) { U.toast(e.message, true); } }));
        $$('[data-ts]', el).forEach((b) => (b.onclick = () => { const p = st.positions.find((x) => x.sym === b.dataset.ts); U.modal({ title: `${p.sym} 익절 · 손절`, body: `<div class="field"><label>익절가</label><input class="input" id="tsT" value="${p.tp || ''}"></div><div class="field"><label>손절가</label><input class="input" id="tsS" value="${p.sl || ''}"></div><p class="dim" style="font-size:12px">비우면 해제됩니다. 진입가 ${cp(p.entry)} · 청산가 ${cp(p.liq)}</p>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="tsOk">저장</button>', onMount: (m, close) => { $('#tsOk', m).onclick = async () => { try { await Store.cfTpSl(p.sym, +$('#tsT', m).value || 0, +$('#tsS', m).value || 0); close(); U.toast('저장했습니다.'); refresh(true); } catch (e) { U.toast(e.message, true); } }; } }); }));
      } else if (tab === 'open') {
        const L = st.orders.filter((o) => o.status === 'pending');
        el.innerHTML = L.length ? `<div class="table-wrap"><table class="t"><thead><tr><th class="l">종목</th><th>방향</th><th>가격</th><th>수량</th><th>레버리지</th><th>주문 시각</th><th></th></tr></thead><tbody>${L.map((o) => `<tr><td class="l">${o.sym}USDT</td><td class="${o.side === 'buy' ? 'up' : 'down'}">${o.side === 'buy' ? '롱' : '숏'}${o.reduceOnly ? ' (줄이기)' : ''}</td><td>${cp(o.price)}</td><td>${qtyFmt(o.qty)}</td><td>${o.lev}x</td><td class="dim">${U.dt(o.createdAt)}</td><td><button class="btn btn-sm" data-cx="${o.id}">취소</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">미체결 주문이 없습니다</div>';
        $$('[data-cx]', el).forEach((b) => (b.onclick = async () => { await Store.cfCancel(b.dataset.cx); U.toast('취소했습니다.'); refresh(true); }));
      } else if (tab === 'hist') {
        const A = { open: '진입', close: '청산', tp: '익절', sl: '손절', liq: '강제 청산' };
        el.innerHTML = st.fills.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>시각</th><th class="l">종목</th><th>구분</th><th>방향</th><th>체결가</th><th>수량</th><th>수수료</th><th>실현손익</th></tr></thead><tbody>${st.fills.map((f) => `<tr><td class="dim">${U.dt(f.at)}</td><td class="l">${f.sym}USDT</td><td><span class="tag ${f.action === 'liq' ? 'tag-sell' : 'tag-no'}">${A[f.action] || f.action}</span></td><td class="${f.side === 'long' ? 'up' : 'down'}">${f.side === 'long' ? '롱' : '숏'}</td><td>${cp(f.price)}</td><td>${qtyFmt(f.qty)}</td><td class="dim">${usd(f.fee, 4)}</td><td class="${cls(f.pnl)}">${f.action === 'open' ? '-' : sgn(f.pnl)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">체결 내역이 없습니다</div>';
      } else {
        const K = { convert_in: '원화 → USDT', convert_out: 'USDT → 원화', stake: '스테이킹 예치', stake_end: '스테이킹 만기', stake_redeem: '스테이킹 해지', funding: '펀딩비' };
        el.innerHTML = st.flows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>시각</th><th class="l">구분</th><th>USDT</th><th>원화</th><th class="l">메모</th></tr></thead><tbody>${st.flows.map((w) => `<tr><td class="dim">${U.dt(w.at)}</td><td class="l">${K[w.kind] || w.kind}</td><td class="${cls(w.amount)}">${sgn(w.amount, 4)}</td><td>${w.krw ? won(w.krw) : '-'}</td><td class="l muted">${esc(w.memo || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">USDT 지갑 내역이 없습니다</div>';
      }
    }
    async function refresh(force) { try { await W.load(force); } catch (e) { $('#cfBottom').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; } top(); form(); bottom(); chart.set({ lines: posLines() }); liqWarn(W.st.positions); }
    const offT = CF.ev.on('tick', (s) => { if (!s || s === sym) { head(); } if (!s || Date.now() - (offT.l || 0) > 1000) { offT.l = Date.now(); list(); if (W.st) { top(); if (tab === 'pos') bottom(); } } });
    const offB = CF.ev.on('book', (s) => { if (s === sym) { book(); if (!CF.ok) head(); } });
    const offR = CF.ev.on('trades', (s) => { if (s === sym) trades(); });
    const offS = CF.ev.on('status', head);
    // 실시간 가격으로 마지막 캔들 갱신
    const ci = setInterval(() => { const t = CF.t[sym]; if (t && chart.patch) chart.patch(t.last); }, 1000);
    const ri = setInterval(() => refresh(true), 15000);
    const bi = setInterval(() => CF.restBook(sym), 2000); CF.restBook(sym);
    // 단축키: F9 롱 시장가 · F10 숏 시장가 · Ctrl+Enter
    const onKey = (e) => {
      if ($('.modal-bg')) return;
      if (e.key === 'F9' || e.key === 'F10') { e.preventDefault(); e.stopPropagation(); O.type = 'market'; O.side = e.key === 'F9' ? 'buy' : 'sell'; form(); submit(false); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(false); }
    };
    document.addEventListener('keydown', onKey, true);
    CF.init().then(() => { list(); head(); });
    list(); head(); book(); trades(); form(); bottom(); loadChart(); refresh(true);
    CF.fng().then((f) => { const el = $('#cfFng'); if (el && f) el.innerHTML = `<div class="fng"><small>코인 공포·탐욕 지수</small><div class="fng-bar"><i style="left:${f.v}%"></i></div><b>${f.v}</b> <span class="dim">${({ 'Extreme Fear': '극도의 공포', Fear: '공포', Neutral: '중립', Greed: '탐욕', 'Extreme Greed': '극도의 탐욕' })[f.label] || f.label}</span></div>`; });
    return { destroy: () => { offT(); offB(); offR(); offS(); clearInterval(ci); clearInterval(ri); clearInterval(bi); document.removeEventListener('keydown', onKey, true); CF.unsubBook(sym); chart.destroy(); }, redraw: () => chart.draw() };
  }

  // ═════════ 스테이킹 ═════════
  function Staking(main) {
    main.innerHTML = `${M().head('스테이킹', '가상 USDT를 기간 동안 예치하면 만기에 원금과 이자를 USDT 지갑으로 받습니다. 중도 해지 시 원금만 돌려받습니다.', '<button class="btn btn-sm btn-brand" id="skCv">원화 ↔ USDT 전환</button>')}
      <div class="cf-sum" id="skSum" style="margin-bottom:16px"></div>
      <div class="sk-grid" id="skP"></div>
      <section class="panel" style="margin-top:16px"><div class="panel-h"><h3>내 스테이킹</h3></div><div id="skL"><div class="empty">불러오는 중…</div></div></section>
      <p class="dim" style="font-size:12px;margin-top:12px">앱 안의 가상 자산 예치 체험이며 실제 코인·현금 이자가 아닙니다. 연 수익률은 관리자가 정하는 가상 이율입니다.</p>`;
    $('#skCv').onclick = () => convertDlg(draw);
    let P = [];
    async function draw() {
      try { [P] = await Promise.all([Store.stakeProducts(), W.load(true)]); } catch (e) { $('#skL').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
      const st = W.st; const act = st.stakes.filter((k) => k.status === 'active');
      $('#skSum').innerHTML = `<div><small>USDT 지갑</small><b>${usd(st.usdt)}</b><em>≈ ${won(Math.round(st.usdt * st.fx))}</em></div><div><small>예치 중</small><b>${usd(act.reduce((s, k) => s + k.amount, 0))}</b><em>${act.length}건</em></div><div><small>쌓인 이자 (예상)</small><b class="up">+${usd(act.reduce((s, k) => s + k.accrued, 0), 4)}</b></div><div><small>받은 이자 (누적)</small><b>${usd(st.stakes.filter((k) => k.status === 'matured').reduce((s, k) => s + k.interest, 0), 4)}</b></div>`;
      $('#skP').innerHTML = P.map((p) => `<div class="sk-card"><div class="sk-h"><b>${esc(p.name)}</b>${p.badge ? `<span class="tag tag-brand">${esc(p.badge)}</span>` : ''}</div><div class="sk-apr">${p.apr}%<small>연 수익률</small></div><p class="muted">${esc(p.descr || '')}</p><dl class="kv"><dt>기간</dt><dd>${p.days}일</dd><dt>최소</dt><dd>${usd(p.min, 0)} USDT</dd><dt>최대</dt><dd>${usd(p.max, 0)} USDT</dd><dt>100 USDT 예치 시</dt><dd class="up">+${usd((100 * p.apr / 100 * p.days) / 365, 4)}</dd></dl><button class="btn btn-brand btn-block" data-sk="${p.id}">스테이킹 시작</button></div>`).join('') || '<div class="empty">진행 중인 상품이 없습니다</div>';
      $$('[data-sk]').forEach((b) => (b.onclick = () => startDlg(P.find((x) => x.id === b.dataset.sk))));
      $('#skL').innerHTML = st.stakes.length ? `<div class="table-wrap"><table class="t"><thead><tr><th class="l">상품</th><th>예치</th><th>연 수익률</th><th>시작</th><th>만기</th><th>진행</th><th>이자</th><th>상태</th><th></th></tr></thead><tbody>${st.stakes.map((k) => { const pr = Math.min(100, ((Date.now() - new Date(k.startedAt)) / (new Date(k.endsAt) - new Date(k.startedAt))) * 100); return `<tr><td class="l">${esc(k.name)}</td><td>${usd(k.amount)}</td><td>${k.apr}%</td><td class="dim">${U.date(k.startedAt)}</td><td class="dim">${U.date(k.endsAt)}</td><td><div class="sk-prog"><i style="width:${k.status === 'active' ? pr : 100}%"></i></div></td><td class="up">+${usd(k.accrued, 4)}</td><td><span class="tag ${k.status === 'active' ? 'tag-wait' : k.status === 'matured' ? 'tag-ok' : 'tag-no'}">${({ active: '예치 중', matured: '만기 지급', redeemed: '중도 해지' })[k.status]}</span></td><td>${k.status === 'active' ? `<button class="btn btn-sm" data-rd="${k.id}">해지</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">스테이킹 내역이 없습니다</div>';
      $$('[data-rd]').forEach((b) => (b.onclick = async () => { if (!(await U.confirmBox('중도 해지', '<p>지금 해지하면 쌓인 이자 없이 원금만 USDT 지갑으로 돌려받습니다. 해지할까요?</p>', '해지', 'btn-danger'))) return; try { await Store.stakeRedeem(b.dataset.rd); U.toast('해지했습니다. 원금이 USDT 지갑으로 돌아왔습니다.'); draw(); } catch (e) { U.toast(e.message, true); } }));
    }
    function startDlg(p) {
      const st = W.st;
      U.modal({ title: p.name, body: `<div class="field"><label>예치 금액 (USDT) · 지갑 ${usd(st.usdt)}</label><input class="input" id="skA" inputmode="decimal" placeholder="${p.min} ~ ${p.max}"></div><div class="pct-row" id="skPc"><button data-r=".25">25%</button><button data-r=".5">50%</button><button data-r="1">최대</button></div><dl class="kv" style="margin-top:12px"><dt>기간</dt><dd>${p.days}일 (만기 ${U.date(new Date(Date.now() + p.days * 86400000).toISOString())})</dd><dt>연 수익률</dt><dd>${p.apr}%</dd><dt><b>만기 예상 이자</b></dt><dd id="skI" class="up">-</dd></dl><p class="dim" style="font-size:12px">중도 해지 시 이자 없이 원금만 반환됩니다.</p>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="skGo">예치</button>', onMount: (m, close) => {
        const calc = () => { const a = +$('#skA', m).value || 0; $('#skI', m).textContent = a ? '+' + usd((a * p.apr / 100 * p.days) / 365, 4) + ' USDT' : '-'; };
        $('#skA', m).oninput = calc; $$('#skPc button', m).forEach((b) => (b.onclick = () => { $('#skA', m).value = Math.floor(Math.min(p.max, st.usdt * +b.dataset.r) * 100) / 100; calc(); }));
        $('#skGo', m).onclick = async () => { try { await Store.stakeStart(p.id, +$('#skA', m).value); close(); U.toast('스테이킹을 시작했습니다.'); M().Voice.say('스테이킹을 시작했습니다.'); draw(); } catch (e) { U.toast(e.message, true); } };
      } });
    }
    draw();
    return { data: draw };
  }

  window.MLS_PAGES = Object.assign(window.MLS_PAGES || {}, { futures: Futures, staking: Staking });
  window.MLS_CF = { convertDlg, W, usd, cp };
})();
