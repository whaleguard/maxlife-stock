// MAX라이프 주식 — 사용자 앱 (HTS/MTS 반응형 SPA)
(() => {
  const { $, $$, esc, won, n0, px, pxu, pct, signed, signedWon, cls, compact, ICON } = U;
  const S = { user: null, d: null, st: null, v: null, page: null, route: '', posts: [], notices: [] };
  const root = document.getElementById('app');

  // ── 테마 ──
  const theme = { get: () => localStorage.getItem('mls.theme') || 'dark', set(t) { localStorage.setItem('mls.theme', t); document.documentElement.dataset.theme = t; } };
  theme.set(theme.get());

  // ── 가격 알림 (회원별 · 이 기기) ──
  const Alerts = {
    key: () => 'mls.alerts.' + (S.user ? S.user.id : ''),
    list() { try { return JSON.parse(localStorage.getItem(this.key()) || '[]'); } catch { return []; } },
    save(a) { try { localStorage.setItem(this.key(), JSON.stringify(a)); } catch {} },
    add(code, cond, price) { const a = this.list(); a.push({ id: U.uid('al'), code, cond, price, at: new Date().toISOString(), hit: null }); this.save(a); if (window.Notification && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); },
    remove(id) { this.save(this.list().filter((x) => x.id !== id)); },
    check() {
      const a = this.list(); let changed = false;
      for (const x of a) {
        if (x.hit) continue; const q = Market.quote(x.code); if (!q) continue;
        if ((x.cond === 'ge' && q.price >= x.price) || (x.cond === 'le' && q.price <= x.price)) {
          x.hit = new Date().toISOString(); changed = true;
          const msg = `${q.name} ${px(q.price, q.currency)} — 설정가 ${px(x.price, q.currency)} ${x.cond === 'ge' ? '이상' : '이하'} 도달`;
          U.toast('가격 알림 · ' + msg);
          try { if (window.Notification && Notification.permission === 'granted') new Notification('MAX라이프 주식 가격 알림', { body: msg }); } catch {}
        }
      }
      if (changed) this.save(a);
    },
  };

  // ── 부트 ──
  async function boot() {
    root.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center">${U.logo()}</div>`;
    await Market.init({});
    await Store.init();
    S.st = await Store.settings();
    Market.setOverrides(S.st.overrides);
    S.user = await Store.current();
    if (!S.user) return renderAuth();
    if (S.user.status === 'suspended') { await Store.logout(); U.toast('정지된 계정입니다.', true); return renderAuth(); }
    await reload();
    renderShell();
    window.addEventListener('hashchange', route);
    route();
    Market.on('update', onMarket);
    Store.on('change', async () => { await reload(); S.page && S.page.data && S.page.data(); });
  }
  async function reload() {
    S.d = await Store.me(); S.user = S.d.user; S.st = await Store.settings();
    S.v = Engine.valuate(S.d, S.st);
    [S.posts, S.notices] = await Promise.all([Store.posts(), Store.notices()]);
  }
  let lastMatch = 0, snapDone = false;
  async function onMarket() {
    if (!S.d) return;
    S.v = Engine.valuate(S.d, S.st);
    renderTicker();
    Alerts.check();
    S.page && S.page.tick && S.page.tick();
    if (Date.now() - lastMatch > 1500) {
      lastMatch = Date.now();
      const fills = await Store.matchAll();
      const mine = fills.filter((f) => f.userId === S.user.id);
      for (const f of mine) U.toast(`[체결] ${f.name} ${f.side === 'buy' ? '매수' : '매도'} ${n0(f.qty)}주 @ ${px(f.price, f.currency)}`);
      if (mine.length) { await reload(); S.page && S.page.data && S.page.data(); }
    }
    if (!snapDone) { snapDone = true; Store.recordSnapshot(S.v.total); }
  }

  // ── 인증 ──
  function renderAuth(mode = 'login') {
    root.innerHTML = `
    <div class="auth">
      <div class="auth-art">
        <canvas id="authArt"></canvas>
        <div>${U.logo()}</div>
        <div>
          <h2>실전과 똑같이.<br>돈은 걸지 않고.</h2>
          <p>실제 국내·미국 주식 시세로 매수·매도하고, 강사의 실전 리딩을 가상계좌로 따라하며 투자를 배웁니다.</p>
        </div>
        <div class="auth-stats"><div><b>${Market.list().length}+</b><small>국내·미국 종목</small></div><div><b>1,000만원</b><small>가입 즉시 가상 예수금</small></div><div><b>0원</b><small>실제 투자 위험</small></div></div>
      </div>
      <div class="auth-form"><div class="auth-card">
        <div class="show-m" style="margin-bottom:28px">${U.logo()}</div>
        ${mode === 'login' ? `
          <h1>로그인</h1><p class="sub">MAX라이프 주식 계좌에 접속합니다.</p>
          <form id="authF">
            <div class="field"><label>아이디</label><input class="input" name="username" autocomplete="username" required></div>
            <div class="field"><label>비밀번호</label><input class="input" type="password" name="pw" autocomplete="current-password" required></div>
            <button class="btn btn-brand btn-block btn-lg" style="margin-top:8px">로그인</button>
          </form>
          <div class="auth-switch">아직 계정이 없으신가요? <button data-sw="signup">회원가입</button></div>
          ${Store.mode === 'local' ? `<div class="demo-box"><b style="color:var(--text)">데모 계정</b><br>수강생 <code>demo</code> / <code>demo1234</code><br>강사 <code>teacher</code> / <code>teacher1234</code><br>관리자 <code>admin</code> / <code>admin1234</code></div>` : ''}
        ` : `
          <h1>회원가입</h1><p class="sub">가입 즉시 가상 예수금 ${won(S.st.initialCash)}이 지급됩니다.</p>
          <form id="authF">
            <div class="field"><label>이름</label><input class="input" name="name" required maxlength="20"></div>
            <div class="field"><label>아이디 (영문/숫자 4~20자)</label><input class="input" name="username" autocomplete="username" required pattern="[A-Za-z0-9_]{4,20}"></div>
            <div class="field"><label>비밀번호 (6자 이상)</label><input class="input" type="password" name="pw" autocomplete="new-password" required minlength="6"></div>
            <div class="field"><label>휴대폰 (선택)</label><input class="input" name="phone" inputmode="tel"></div>
            <label class="check" style="margin:6px 0 14px"><input type="checkbox" required> 본 서비스는 가상투자 교육용이며 실제 금전 거래가 없음을 확인합니다.</label>
            <button class="btn btn-brand btn-block btn-lg">가입하고 시작하기</button>
          </form>
          <div class="auth-switch">이미 계정이 있으신가요? <button data-sw="login">로그인</button></div>
        `}
      </div></div>
    </div>`;
    $('[data-sw]').onclick = (e) => renderAuth(e.target.dataset.sw);
    $('#authF').onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('button.btn-brand'); btn.disabled = true;
      try { mode === 'login' ? await Store.login(f.username, f.pw) : await Store.signup(f); location.hash = '#/home'; location.reload(); }
      catch (err) { U.toast(err.message, true); btn.disabled = false; }
    };
    drawAuthArt();
  }
  function drawAuthArt() {
    const c = $('#authArt'); if (!c) return;
    const r = U.rng('art'); const lines = [0, 1, 2].map((k) => { let v = 50; return Array.from({ length: 120 }, () => (v += (r() - 0.47 + k * 0.01) * 4)); });
    const draw = () => {
      if (!document.body.contains(c)) return;
      const dpr = devicePixelRatio || 1; c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr; const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
      const w = c.clientWidth, h = c.clientHeight;
      ctx.strokeStyle = 'rgba(255,255,255,.04)'; for (let x = 0; x < w; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      const cols = ['rgba(183,231,122,.9)', 'rgba(255,98,107,.35)', 'rgba(97,154,255,.35)'];
      lines.forEach((L, k) => { const hi = Math.max(...L), lo = Math.min(...L); ctx.beginPath(); L.forEach((v, i) => { const x = (i / (L.length - 1)) * w; const y = h * 0.35 + (1 - (v - lo) / (hi - lo)) * h * 0.4 + k * 30; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.strokeStyle = cols[k]; ctx.lineWidth = k ? 1.2 : 2.2; ctx.stroke(); });
      // 캔들 장식
      let v = 60; for (let i = 0; i < 40; i++) { const o = v; v += (r() - 0.45) * 6; const x = w * 0.55 + i * ((w * 0.42) / 40); const y0 = h * 0.62; const up = v > o; ctx.fillStyle = up ? 'rgba(255,98,107,.55)' : 'rgba(97,154,255,.55)'; ctx.fillRect(x, y0 - Math.max(o, v) * 1.2 + 60, 5, Math.max(2, Math.abs(v - o) * 1.2)); }
    };
    draw(); window.addEventListener('resize', draw, { once: true });
  }

  // ── 셸 ──
  const NAV = [
    ['home', '홈', ICON.home], ['market', '시세·순위', ICON.grid], ['watch', '관심종목', ICON.star], ['stock/005930', '종목·주문', ICON.chart], ['balance', '잔고', ICON.wallet], ['history', '거래내역', ICON.list],
    ['cash', '입출금', ICON.bank], ['lead', '리딩룸', ICON.lead], ['rank', '랭킹', ICON.trophy], ['my', '마이페이지', ICON.user],
  ];
  function renderShell() {
    const staff = S.user.role === 'admin' || S.user.role === 'instructor';
    root.innerHTML = `
    <div class="app">
      <header class="topbar">
        <a href="#/home">${U.logo()}</a>
        <div class="ticker" id="ticker"></div>
        <div class="top-actions">
          <div class="search">${ICON.search}<input id="q" placeholder="종목명·코드 검색" autocomplete="off"><div class="search-results hidden" id="qr"></div></div>
          <button class="icon-btn hide-m" id="themeBtn" title="테마 전환">${theme.get() === 'dark' ? ICON.sun : ICON.moon}</button>
          <button class="user-chip" id="userBtn"><span class="avatar">${esc(S.user.name.slice(0, 1))}</span><span class="nm">${esc(S.user.name)}</span></button>
        </div>
      </header>
      <aside class="sidebar">
        <nav class="nav">
          <div class="cap">TRADING</div>
          ${NAV.slice(0, 7).map(([r, l, i]) => `<a href="#/${r}" data-r="${r.split('/')[0]}">${i}<span>${l}</span></a>`).join('')}
          <div class="sep"></div><div class="cap">EDUCATION</div>
          ${NAV.slice(7).map(([r, l, i]) => `<a href="#/${r}" data-r="${r.split('/')[0]}">${i}<span>${l}</span></a>`).join('')}
          ${staff ? `<div class="sep"></div><a href="admin.html">${ICON.shield}<span>${S.user.role === 'admin' ? '관리자' : '강사 관리'}</span></a>` : ''}
        </nav>
        <div class="side-foot" id="sideFoot"></div>
      </aside>
      <main class="main" id="main"></main>
      <nav class="tabbar">
        <a href="#/home" data-r="home">${ICON.home}홈</a>
        <a href="#/stock/005930" data-r="stock">${ICON.chart}주문</a>
        <a href="#/watch" data-r="watch">${ICON.star}관심</a>
        <a href="#/balance" data-r="balance">${ICON.wallet}잔고</a>
        <a href="#/menu" data-r="menu">${ICON.grid}전체</a>
      </nav>
    </div>`;
    $('#themeBtn').onclick = () => { theme.set(theme.get() === 'dark' ? 'light' : 'dark'); $('#themeBtn').innerHTML = theme.get() === 'dark' ? ICON.sun : ICON.moon; S.page && S.page.redraw && S.page.redraw(); };
    $('#userBtn').onclick = userMenu;
    bindSearch($('#q'), $('#qr'), (code) => (location.hash = '#/stock/' + code));
    renderTicker();
  }
  function userMenu() {
    const staff = S.user.role !== 'user';
    U.modal({
      title: S.user.name + ' 님', body: `
      <div class="kv" style="margin-bottom:16px"><dt>아이디</dt><dd>${esc(S.user.username)}</dd><dt>권한</dt><dd>${{ user: '수강생', instructor: '강사', admin: '관리자' }[S.user.role]}</dd><dt>총자산</dt><dd>${won(S.v.total)}</dd></div>
      <div class="grid" style="gap:8px">
        <a class="btn btn-block" href="#/my" data-x>마이페이지</a>
        <button class="btn btn-block" id="mTheme" data-x>${theme.get() === 'dark' ? '라이트 모드' : '다크 모드'}로 전환</button>
        ${staff ? `<a class="btn btn-block" href="admin.html">${S.user.role === 'admin' ? '관리자 페이지' : '강사 관리'}</a>` : ''}
        <button class="btn btn-block btn-danger" id="mOut">로그아웃</button>
      </div>`,
      onMount: (m, close) => {
        $('#mTheme', m).onclick = () => { theme.set(theme.get() === 'dark' ? 'light' : 'dark'); const tb = $('#themeBtn'); if (tb) tb.innerHTML = theme.get() === 'dark' ? ICON.sun : ICON.moon; S.page && S.page.redraw && S.page.redraw(); };
        $('#mOut', m).onclick = async () => { await Store.logout(); location.hash = ''; location.reload(); };
      },
    });
  }
  function bindSearch(input, box, onPick) {
    const show = () => {
      const k = input.value.trim().toLowerCase();
      if (!k) { box.classList.add('hidden'); return; }
      const res = Market.list((q) => q.name.toLowerCase().includes(k) || q.code.toLowerCase().includes(k)).slice(0, 12);
      box.innerHTML = res.length ? res.map((q) => `<button data-c="${q.code}"><span><b>${esc(q.name)}</b> <small class="dim">${q.code} · ${q.market}</small></span><span class="${cls(q.change)}">${px(q.price, q.currency)} <small>${pct(q.changePct)}</small></span></button>`).join('') : '<div class="empty">검색 결과가 없습니다</div>';
      box.classList.remove('hidden');
    };
    input.addEventListener('input', show); input.addEventListener('focus', show);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = box.querySelector('[data-c]'); if (b) { onPick(b.dataset.c); input.value = ''; box.classList.add('hidden'); input.blur(); } } });
    box.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-c]'); if (b) { e.preventDefault(); onPick(b.dataset.c); input.value = ''; box.classList.add('hidden'); input.blur(); } });
    input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 150));
  }
  function renderTicker() {
    const t = $('#ticker'); if (!t) return;
    const ix = Market.state.indices;
    t.innerHTML = ['KOSPI', 'KOSDAQ', 'NASDAQ', 'SPX'].filter((k) => ix[k]).map((k) => `<span class="ix"><b>${k === 'SPX' ? 'S&P500' : k}</b><span class="v ${cls(ix[k].change)}">${U.n2(ix[k].price)}</span><span class="${cls(ix[k].change)}">${pct(ix[k].changePct)}</span></span>`).join('');
    const sf = $('#sideFoot'); if (sf) sf.innerHTML = statusLine(true);
  }
  function statusLine(short) {
    const s = Market.state;
    if (s.status === 'LIVE') { const kr = Market.session('KR'), us = Market.session('US'); return `<span class="brand">●</span> 시세 연동<br>${U.dt(s.updatedAt)} 기준<br>국내 ${kr.label} · 미국 ${us.label}`; }
    return `<span style="color:var(--warn)">●</span> 시세 불러오는 중`;
  }

  // ── 라우팅 ──
  function route() {
    const h = location.hash.replace(/^#\/?/, '') || 'home';
    const [name, arg] = h.split('/');
    const pages = { home: Home, market: MarketPage, watch: Watch, stock: Stock, balance: Balance, history: History, cash: Cash, lead: Lead, rank: Rank, my: My, menu: Menu };
    const P = pages[name] || Home;
    S.page && S.page.destroy && S.page.destroy();
    $$('.nav a, .tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.r === name));
    const main = $('#main'); main.innerHTML = ''; window.scrollTo(0, 0);
    S.page = P(main, arg) || {};
  }
  const head = (t, sub, right = '') => `<div class="page-head"><div><h1>${t}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;
  const marketBanner = () => '';
  const stockRow = (q, extra = '') => `<div class="row" data-go="${q.code}"><div class="sname">${extra}<b>${esc(q.name)}</b><small>${q.code} · ${q.market}</small></div><div class="p ${cls(q.change)}"><b>${px(q.price, q.currency)}</b><small>${pct(q.changePct)}</small></div></div>`;
  const bindGo = (el) => el.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g && !e.target.closest('[data-stop]')) location.hash = '#/stock/' + g.dataset.go; });

  // ═════════ 홈 ═════════
  function Home(main) {
    let mk = 'ALL', rk = 'value';
    main.innerHTML = `
      <div id="hNotice"></div>${marketBanner()}
      <div class="grid g-main" style="margin-bottom:16px">
        <section class="panel"><div class="panel-b hero-asset" id="hAsset"></div></section>
        <section class="panel"><div class="panel-h"><h3>시장 지수</h3><span class="dim" style="font-size:12px" id="hTime"></span></div><div class="panel-b flush slist" id="hIdx"></div></section>
      </div>
      <div class="grid g-3" style="margin-bottom:16px">
        <section class="panel"><div class="panel-h"><h3>관심종목</h3><a class="dim" href="#/stock/005930" style="font-size:12px">종목 검색</a></div><div class="panel-b flush slist" id="hWatch"></div></section>
        <section class="panel span2"><div class="panel-h"><h3>실시간 랭킹</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><div class="seg" id="hMk"><button data-v="ALL" class="on">전체</button><button data-v="KR">국내</button><button data-v="US">미국</button></div><div class="seg" id="hRk"><button data-v="value" class="on">거래대금</button><button data-v="up">급등</button><button data-v="down">급락</button></div></div></div><div class="panel-b flush"><div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>현재가</th><th>등락률</th><th class="hide-m">거래량</th><th class="hide-m">거래대금</th></tr></thead><tbody id="hRank"></tbody></table></div></div></section>
      </div>
      <div class="grid g-2 stack">
        <section class="panel"><div class="panel-h"><h3>내 보유종목</h3><a class="dim" href="#/balance" style="font-size:12px">잔고 전체</a></div><div class="panel-b flush slist" id="hHold"></div></section>
        <section class="panel"><div class="panel-h"><h3>최신 리딩</h3><a class="dim" href="#/lead" style="font-size:12px">리딩룸</a></div><div class="panel-b flush" id="hLead"></div></section>
      </div>`;
    $('#hMk').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; mk = b.dataset.v; $$('#hMk button').forEach((x) => x.classList.toggle('on', x === b)); tick(); };
    $('#hRk').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; rk = b.dataset.v; $$('#hRk button').forEach((x) => x.classList.toggle('on', x === b)); tick(); };
    ['#hWatch', '#hRank', '#hHold'].forEach((s) => bindGo($(s)));
    $('#hIdx').onclick = null;
    $('#hWatch').addEventListener('click', async (e) => { const s = e.target.closest('[data-star]'); if (s) { e.stopPropagation(); await Store.toggleWatch(s.dataset.star); } });
    function data() {
      const pin = S.notices.find((n) => n.pinned) || S.notices[0];
      $('#hNotice').innerHTML = pin ? `<a class="notice-bar" href="#/lead"><b>공지</b><span>${esc(pin.title)}</span><span class="dim" style="margin-left:auto;font-size:12px">${U.ago(pin.at)}</span></a>` : '';
      $('#hLead').innerHTML = S.posts.slice(0, 3).map((p) => `<a href="#/lead" class="feed-card" style="display:block;padding:14px 18px"><div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">${p.kind === 'trade' ? `<span class="tag ${p.side === 'sell' ? 'tag-sell' : 'tag-buy'}">${p.side === 'sell' ? '매도 시연' : '매수 시연'}</span>` : '<span class="tag tag-brand">강의</span>'}${resultTag(p)}<span class="dim" style="font-size:12px;margin-left:auto">${U.ago(p.at)}</span></div><b style="font-weight:700">${esc(p.title)}</b></a>`).join('') || '<div class="empty">등록된 리딩이 없습니다</div>';
      tick();
    }
    function tick() {
      const v = S.v;
      $('#hAsset').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div><div class="stat"><div class="k">총 가상자산</div></div><div class="v num">${won(v.total)}</div><div class="${cls(v.totalPnl)}" style="font-weight:600;margin-top:2px">${signedWon(v.totalPnl)} (${pct(v.totalPct)})<span class="dim" style="font-weight:500;margin-left:6px">누적 수익</span></div></div>
          <div style="display:flex;gap:8px"><a class="btn btn-sm" href="#/cash">입출금</a><a class="btn btn-sm btn-brand" href="#/stock/005930">주문하기</a></div>
        </div>
        <div style="height:110px;margin:14px 0 6px"><canvas id="hSpark" style="width:100%;height:100%"></canvas></div>
        <div class="grid g-4" style="gap:12px">
          <div class="stat"><div class="k">평가금액</div><div class="v" style="font-size:17px">${won(v.evalKrw)}</div></div>
          <div class="stat"><div class="k">평가손익</div><div class="v ${cls(v.pnl)}" style="font-size:17px">${signedWon(v.pnl)}</div><div class="s ${cls(v.pnl)}">${pct(v.pnlPct)}</div></div>
          <div class="stat"><div class="k">예수금</div><div class="v" style="font-size:17px">${won(v.cash)}</div></div>
          <div class="stat"><div class="k">주문가능</div><div class="v" style="font-size:17px">${won(v.orderable)}</div></div>
        </div>`;
      const snaps = (S.d.snapshots || []).slice(-60).map((s) => [s[0], s[1]]);
      if (!snaps.length || snaps[snaps.length - 1][0] !== U.today()) snaps.push([U.today(), v.total]); else snaps[snaps.length - 1][1] = v.total;
      Chart.line($('#hSpark'), { points: snaps, color: v.totalPnl >= 0 ? Chart.css('--up') : Chart.css('--down'), labels: false, base: v.principal, fmt: compact });
      const ix = Market.state.indices;
      $('#hIdx').innerHTML = ['KOSPI', 'KOSDAQ', 'NASDAQ', 'SPX'].filter((k) => ix[k]).map((k) => `<div class="row" style="cursor:default"><div class="sname"><b>${k === 'SPX' ? 'S&P 500' : ix[k].name || k}</b><small>${k === 'KOSPI' || k === 'KOSDAQ' ? '국내 · ' + Market.session('KR').label : '미국 · ' + Market.session('US').label}</small></div><div class="p ${cls(ix[k].change)}"><b>${U.n2(ix[k].price)}</b><small>${signed(ix[k].change, 'USD').replace('$', '')} ${pct(ix[k].changePct)}</small></div></div>`).join('');
      $('#hTime').textContent = Market.state.updatedAt ? U.dt(Market.state.updatedAt) + ' 기준' : '';
      const w = (S.user.watch || []).map(Market.quote).filter(Boolean);
      $('#hWatch').innerHTML = w.length ? w.map((q) => stockRow(q, `<button class="star on" data-star="${q.code}" data-stop title="관심 해제" style="float:left;margin:4px 6px 0 -6px">${ICON.star}</button>`)).join('') : '<div class="empty">종목 화면에서 ☆를 눌러 관심종목을 추가하세요</div>';
      let list = Market.list((q) => mk === 'ALL' || (mk === 'KR' ? q.currency === 'KRW' : q.currency === 'USD'));
      const val = (q) => Market.toKrw(q.value || q.price * q.volume, q.currency);
      list.sort(rk === 'value' ? (a, b) => val(b) - val(a) : rk === 'up' ? (a, b) => b.changePct - a.changePct : (a, b) => a.changePct - b.changePct);
      $('#hRank').innerHTML = list.slice(0, 10).map((q, i) => `<tr class="click" data-go="${q.code}"><td><div class="sname" style="display:flex;align-items:center;gap:8px"><span class="rank-n">${i + 1}</span><div><b>${esc(q.name)}</b><small>${q.code}</small></div></div></td><td class="${cls(q.change)}"><b>${px(q.price, q.currency)}</b></td><td class="${cls(q.change)}">${pct(q.changePct)}</td><td class="hide-m">${compact(q.volume)}</td><td class="hide-m">${compact(val(q))}</td></tr>`).join('');
      $('#hHold').innerHTML = v.holdings.length ? v.holdings.slice(0, 6).map((h) => `<div class="row" data-go="${h.code}"><div class="sname"><b>${esc(h.name)}</b><small>${n0(h.qty)}주 · 평균 ${px(h.avg, h.currency)}</small></div><div class="p ${cls(h.pnl)}"><b>${won(h.evalKrw)}</b><small>${signedWon(h.pnl)} (${pct(h.pnlPct)})</small></div></div>`).join('') : '<div class="empty">보유종목이 없습니다. 첫 주문을 넣어보세요.</div>';
    }
    data();
    return { data, tick, redraw: tick };
  }
  const resultTag = (p) => p.kind !== 'trade' ? '' : p.result === 'target' ? `<span class="tag tag-ok">목표가 도달 ${p.resultPct ? pct(p.resultPct) : ''}</span>` : p.result === 'stop' ? `<span class="tag tag-sell">손절 ${p.resultPct ? pct(p.resultPct) : ''}</span>` : p.result === 'closed' ? `<span class="tag tag-no">종료 ${p.resultPct ? pct(p.resultPct) : ''}</span>` : '<span class="tag tag-wait">진행중</span>';

  // ═════════ 종목·주문 ═════════
  function Stock(main, code) {
    code = code || '005930';
    if (!Market.quote(code)) code = '005930';
    const q0 = Market.quote(code); const ccy = q0.currency;
    const pre = JSON.parse(sessionStorage.getItem('mls.prefill') || 'null'); sessionStorage.removeItem('mls.prefill');
    const O = { side: pre && pre.code === code ? pre.side : 'buy', type: 'limit', price: pre && pre.code === code && pre.price ? pre.price : q0.price, qty: 1, tf: 'D' };
    main.innerHTML = `
      ${marketBanner()}
      <div class="trade">
        <div class="col-chart">
          <section class="panel">
            <div class="quote-head" id="sHead"></div>
            <div class="chart-tools"><div class="seg" id="sTf"><button data-v="m">분</button><button data-v="D" class="on">일</button><button data-v="W">주</button><button data-v="M">월</button></div><div class="seg" id="sMa" title="이동평균선"><button data-v="5" class="on">5</button><button data-v="20" class="on">20</button><button data-v="60" class="on">60</button><button data-v="120" class="on">120</button></div><div class="seg" id="sInd"><button data-v="bb">볼린저</button></div><div class="seg" id="sSub"><button data-v="vol" class="on">거래량</button><button data-v="rsi">RSI</button><button data-v="macd">MACD</button></div><span class="dim" style="font-size:11px" id="sCSrc"></span></div>
            <div class="chart-box"><div class="chart-tip" id="sTip"></div><canvas id="sChart"></canvas></div>
          </section>
          <section class="panel" style="margin-top:16px">
            <div class="tabs" id="sTabs"><button data-v="open" class="on">미체결</button><button data-v="pos">보유현황</button><button data-v="fills">체결내역</button><button data-v="daily">일별시세</button><button data-v="info">종목정보</button><button data-v="alert">가격알림</button></div>
            <div id="sBottom"></div>
          </section>
        </div>
        <section class="panel book-panel">
          <div class="panel-h"><h3>호가</h3><span class="dim" style="font-size:11px" id="sBookSrc"></span></div>
          <div class="book" id="sBook"></div>
          <div class="panel-h" style="border-top:1px solid var(--border)"><h3>체결</h3></div>
          <div class="ticks" id="sTicks"></div>
        </section>
        <section class="panel" id="orderPanel">
          <div class="order-side"><button class="buy" data-side="buy">매수</button><button class="sell" data-side="sell">매도</button></div>
          <div class="panel-b">
            <div class="field"><label>주문 유형</label><div class="seg" id="oType" style="width:100%"><button data-v="limit" style="flex:1">지정가</button><button data-v="market" style="flex:1">시장가</button></div></div>
            <div class="field"><label>주문 가격 <span class="dim" id="oTickInfo"></span></label><div class="stepper"><button data-p="-1">−</button><input class="input" id="oPrice" inputmode="decimal"><button data-p="1">+</button></div></div>
            <div class="field"><label>수량 <span class="dim" id="oMaxInfo"></span></label><div class="stepper"><button data-q="-1">−</button><input class="input" id="oQty" inputmode="numeric"><button data-q="1">+</button></div><div class="pct-row" id="oPct"><button data-r=".1">10%</button><button data-r=".25">25%</button><button data-r=".5">50%</button><button data-r="1">최대</button></div></div>
            <div class="order-sum" id="oSum"></div>
            <button class="btn btn-block btn-lg" id="oSubmit"></button>
            <p class="dim" style="font-size:11px;margin-top:10px;line-height:1.6">가상투자 주문입니다. 실제 시세 기준으로 체결되며 실제 돈은 오가지 않습니다.</p>
          </div>
        </section>
      </div>`;
    const chart = Chart.candle($('#sChart'), { ccy, tip: $('#sTip'), view: window.innerWidth < 760 ? 50 : 90 });
    let bottomTab = 'open';
    async function loadChart() {
      const r = await Market.candles(code, O.tf);
      chart.set({ data: r.data, tf: O.tf, offset: 0, lines: avgLine() });
      $('#sCSrc').textContent = r.unit || '';
    }
    const avgLine = () => { const h = S.v.holdings.find((x) => x.code === code); return h ? [{ price: h.avg, label: '평균', color: '#8A94A6' }] : []; };
    $('#sTf').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; O.tf = b.dataset.v; $$('#sTf button').forEach((x) => x.classList.toggle('on', x === b)); loadChart(); };
    const IND = (() => { try { return JSON.parse(localStorage.getItem('mls.ind') || 'null') || { ma: [5, 20, 60, 120], bb: false, sub: 'vol' }; } catch { return { ma: [5, 20, 60, 120], bb: false, sub: 'vol' }; } })();
    const syncInd = () => {
      $$('#sMa button').forEach((b) => b.classList.toggle('on', IND.ma.includes(+b.dataset.v)));
      $$('#sInd button').forEach((b) => b.classList.toggle('on', !!IND[b.dataset.v]));
      $$('#sSub button').forEach((b) => b.classList.toggle('on', IND.sub === b.dataset.v));
      try { localStorage.setItem('mls.ind', JSON.stringify(IND)); } catch {}
      chart.set({ ma: IND.ma.slice().sort((a, b) => a - b), bb: IND.bb, sub: IND.sub });
    };
    $('#sMa').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const v = +b.dataset.v; IND.ma = IND.ma.includes(v) ? IND.ma.filter((x) => x !== v) : [...IND.ma, v]; syncInd(); };
    $('#sInd').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; IND[b.dataset.v] = !IND[b.dataset.v]; syncInd(); };
    $('#sSub').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; IND.sub = b.dataset.v; syncInd(); };
    syncInd();
    $('#sTabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; bottomTab = b.dataset.v; $$('#sTabs button').forEach((x) => x.classList.toggle('on', x === b)); renderBottom(); };
    // 주문 패널 이벤트
    $$('.order-side button').forEach((b) => (b.onclick = () => { O.side = b.dataset.side; syncForm(); }));
    $('#oType').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; O.type = b.dataset.v; syncForm(); };
    $$('[data-p]').forEach((b) => (b.onclick = () => { O.price = U.stepPrice(O.price || Market.quote(code).price, ccy, +b.dataset.p); syncForm(); }));
    $$('[data-q]').forEach((b) => (b.onclick = () => { O.qty = Math.max(1, (O.qty || 0) + +b.dataset.q); syncForm(); }));
    $('#oPrice').addEventListener('change', (e) => { const v = parseFloat(e.target.value.replace(/,/g, '')); O.price = v > 0 ? U.roundTick(v, ccy) : Market.quote(code).price; syncForm(); });
    $('#oQty').addEventListener('input', (e) => { O.qty = Math.max(0, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0); updSum(); });
    $('#oQty').addEventListener('change', () => syncForm());
    $('#oPct').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; O.qty = Math.max(1, Math.floor(maxQty() * +b.dataset.r)); syncForm(); };
    $('#sBook').onclick = (e) => { const r = e.target.closest('[data-px]'); if (!r) return; O.price = +r.dataset.px; O.type = 'limit'; syncForm(); };
    $('#oSubmit').onclick = submit;
    function unitPrice() { const q = Market.quote(code); return O.type === 'market' ? (O.side === 'buy' ? Market.bestAsk(code) : Market.bestBid(code)) : O.price || q.price; }
    function maxQty() {
      if (O.side === 'sell') { const h = S.v.holdings.find((x) => x.code === code); return h ? h.sellable : 0; }
      const p = Market.toKrw(unitPrice(), ccy) * (1 + Engine.feeRate(S.st, ccy)); return p ? Math.floor(S.v.orderable / p) : 0;
    }
    function syncForm() {
      $$('.order-side button').forEach((b) => b.classList.toggle('on', b.dataset.side === O.side));
      $$('#oType button').forEach((b) => b.classList.toggle('on', b.dataset.v === O.type));
      const pi = $('#oPrice'); pi.disabled = O.type === 'market'; $$('[data-p]').forEach((b) => (b.disabled = O.type === 'market'));
      pi.value = O.type === 'market' ? '시장가' : ccy === 'USD' ? (+O.price).toFixed(2) : n0(O.price);
      if (document.activeElement !== $('#oQty')) $('#oQty').value = O.qty;
      $('#oTickInfo').textContent = ccy === 'USD' ? 'USD' : `· 호가단위 ${n0(U.tickKR(O.price || q0.price))}원`;
      const sb = $('#oSubmit'); sb.className = 'btn btn-block btn-lg ' + (O.side === 'buy' ? 'btn-buy' : 'btn-sell'); sb.textContent = (O.side === 'buy' ? '매수' : '매도') + (O.type === 'market' ? ' (시장가)' : '');
      updSum();
    }
    function updSum() {
      const q = Market.quote(code); const p = unitPrice(); const gross = Market.toKrw(p * (O.qty || 0), ccy);
      const fee = gross * Engine.feeRate(S.st, ccy); const tax = O.side === 'sell' ? gross * Engine.taxRate(S.st, ccy) : 0;
      const h = S.v.holdings.find((x) => x.code === code);
      $('#oMaxInfo').textContent = O.side === 'buy' ? `· 최대 ${n0(maxQty())}주` : `· 매도가능 ${n0(h ? h.sellable : 0)}주`;
      $('#oSum').innerHTML = `<dl class="kv">
        <dt>${O.side === 'buy' ? '주문가능금액' : '보유수량'}</dt><dd>${O.side === 'buy' ? won(S.v.orderable) : n0(h ? h.qty : 0) + '주'}</dd>
        <dt>주문금액${ccy === 'USD' ? ` <span class="dim">(${U.usd(p * (O.qty || 0))})</span>` : ''}</dt><dd>${won(gross)}</dd>
        <dt>수수료 <span class="dim">${O.side === 'buy' ? (ccy === 'USD' ? S.st.feeUs : S.st.feeKr) : (ccy === 'USD' ? S.st.feeUs : S.st.feeKr)}%</span></dt><dd>${won(fee)}</dd>
        ${O.side === 'sell' && ccy === 'KRW' ? `<dt>세금 <span class="dim">${S.st.taxKr}%</span></dt><dd>${won(tax)}</dd>` : ''}
        <dt><b style="color:var(--text)">${O.side === 'buy' ? '총 결제금액' : '예상 정산금액'}</b></dt><dd style="font-size:15px" class="${O.side === 'buy' ? 'up' : 'down'}">${won(O.side === 'buy' ? gross + fee : gross - fee - tax)}</dd>
        ${ccy === 'USD' ? `<dt>적용 환율</dt><dd>${U.n2(Market.fx())}원</dd>` : ''}
      </dl>`;
    }
    async function submit() {
      const q = Market.quote(code);
      if (!O.qty) return U.toast('수량을 입력해 주세요.', true);
      const input = { code, side: O.side, type: O.type, price: O.type === 'market' ? 0 : +O.price, qty: O.qty };
      const err = Engine.validate(S.d, S.st, input); if (err) return U.toast(err, true);
      const p = unitPrice(); const gross = Market.toKrw(p * O.qty, ccy);
      const ok = await U.confirmBox(`${O.side === 'buy' ? '매수' : '매도'} 주문 확인`, `<dl class="kv" style="font-size:14px"><dt>종목</dt><dd>${esc(q.name)} <span class="dim">${code}</span></dd><dt>구분</dt><dd class="${O.side === 'buy' ? 'up' : 'down'}">${O.side === 'buy' ? '매수' : '매도'} · ${O.type === 'market' ? '시장가' : '지정가'}</dd><dt>가격</dt><dd>${O.type === 'market' ? '시장가 (약 ' + px(p, ccy) + ')' : pxu(O.price, ccy)}</dd><dt>수량</dt><dd>${n0(O.qty)}주</dd><dt>주문금액</dt><dd>${won(gross)}</dd></dl>`, O.side === 'buy' ? '매수 주문' : '매도 주문', O.side === 'buy' ? 'btn-buy' : 'btn-sell');
      if (!ok) return;
      try {
        const r = await Store.placeOrder(input);
        if (r.fill) U.toast(`체결 완료 · ${q.name} ${n0(r.fill.qty)}주 @ ${px(r.fill.price, ccy)}`);
        else U.toast(`주문 접수 · 지정가 ${px(input.price, ccy)} 미체결 대기`);
        if (bottomTab !== 'open' && !r.fill) { bottomTab = 'open'; $$('#sTabs button').forEach((x) => x.classList.toggle('on', x.dataset.v === 'open')); }
      } catch (e) { U.toast(e.message, true); }
    }
    function renderHead() {
      const q = Market.quote(code); const ses = Market.session(q.market); const watched = (S.user.watch || []).includes(code);
      $('#sHead').innerHTML = `
        <div style="min-width:0"><div style="display:flex;align-items:center;gap:6px"><button class="star ${watched ? 'on' : ''}" id="sStar" title="관심종목">${ICON.star}</button><span class="nm">${esc(q.name)}</span><span class="cd">${code} · ${q.market}</span><span class="tag ${ses.open ? 'tag-ok' : 'tag-no'}" style="margin-left:4px">${ses.label}</span></div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px"><span class="px ${cls(q.change)}">${pxu(q.price, q.currency)}</span><span class="chg ${cls(q.change)}">${signed(q.change, q.currency)} (${pct(q.changePct)})</span></div></div>
        <div class="quote-meta">
          <span>시가<b>${px(q.open, q.currency)}</b></span><span>고가<b class="up">${px(q.high, q.currency)}</b></span><span>저가<b class="down">${px(q.low, q.currency)}</b></span>
          <span>거래량<b>${compact(q.volume)}</b></span>${q.currency === 'KRW' && q.upper ? `<span>상한<b class="up">${n0(q.upper)}</b></span><span>하한<b class="down">${n0(q.lower)}</b></span>` : ''}
        </div>`;
      $('#sStar').onclick = () => Store.toggleWatch(code);
    }
    function renderBook() {
      const q = Market.quote(code); const b = Market.book(code);
      const maxv = Math.max(1, ...b.asks.map((x) => x[1]), ...b.bids.map((x) => x[1]));
      const asks = b.asks.slice().reverse(); const sumA = b.asks.reduce((s, x) => s + x[1], 0), sumB = b.bids.reduce((s, x) => s + x[1], 0);
      const pc = (p) => { const c = ((p - q.prevClose) / q.prevClose) * 100; return `<span class="${cls(c)}" style="font-size:10px;font-weight:500;opacity:.85">${pct(c)}</span>`; };
      $('#sBook').innerHTML = asks.map(([p, v]) => `<div class="r ask ${p === q.price ? 'cur' : ''}" data-px="${p}"><span class="bar" style="width:calc((50% - 44px) * ${(v / maxv).toFixed(3)})"></span><span class="q l">${n0(v)}</span><span class="pc ${cls(p - q.prevClose)}"><span>${px(p, q.currency)}<br>${pc(p)}</span></span><span></span></div>`).join('') +
        b.bids.map(([p, v]) => `<div class="r bid ${p === q.price ? 'cur' : ''}" data-px="${p}"><span></span><span class="pc ${cls(p - q.prevClose)}"><span>${px(p, q.currency)}<br>${pc(p)}</span></span><span class="bar" style="width:calc((50% - 44px) * ${(v / maxv).toFixed(3)})"></span><span class="q r2">${n0(v)}</span></div>`).join('') +
        `<div class="sum"><span class="down">${n0(sumA)}</span><span style="text-align:center;font-size:11px">총잔량</span><span class="up">${n0(sumB)}</span></div>`;
      $('#sBookSrc').textContent = '호가 · ' + U.time(Market.state.updatedAt);
      const tk = Market.ticks(code);
      $('#sTicks').innerHTML = tk.slice(0, 30).map((t) => `<div class="r"><span class="dim">${t.t}</span><span class="${t.side > 0 ? 'up' : t.side < 0 ? 'down' : ''}">${px(t.p, q.currency)}</span><span>${n0(t.v)}</span></div>`).join('') || '<div class="empty">체결 내역 없음</div>';
    }
    function renderBottom() {
      const el = $('#sBottom'); const q = Market.quote(code);
      if (bottomTab === 'open') {
        const os = S.d.orders.filter((o) => o.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        el.innerHTML = os.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>구분</th><th>주문가</th><th>수량</th><th class="hide-m">주문시각</th><th></th></tr></thead><tbody>${os.map((o) => `<tr><td><div class="sname"><b>${esc(o.name)}</b><small>${o.code}</small></div></td><td><span class="tag ${o.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${o.side === 'buy' ? '매수' : '매도'}</span></td><td>${px(o.price, o.currency)}</td><td>${n0(o.qty)}</td><td class="hide-m dim">${U.dt(o.createdAt)}</td><td><button class="btn btn-sm" data-amend="${o.id}">정정</button> <button class="btn btn-sm btn-danger" data-cancel="${o.id}">취소</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">미체결 주문이 없습니다</div>';
      } else if (bottomTab === 'pos') {
        const h = S.v.holdings.find((x) => x.code === code);
        el.innerHTML = h ? `<div class="panel-b"><div class="grid g-4"><div class="stat"><div class="k">보유수량</div><div class="v" style="font-size:18px">${n0(h.qty)}주</div><div class="s dim">매도가능 ${n0(h.sellable)}주</div></div><div class="stat"><div class="k">평균단가</div><div class="v" style="font-size:18px">${pxu(h.avg, h.currency)}</div></div><div class="stat"><div class="k">평가금액</div><div class="v" style="font-size:18px">${won(h.evalKrw)}</div></div><div class="stat"><div class="k">평가손익</div><div class="v ${cls(h.pnl)}" style="font-size:18px">${signedWon(h.pnl)}</div><div class="s ${cls(h.pnl)}">${pct(h.pnlPct)}</div></div></div></div>` : '<div class="empty">이 종목을 보유하고 있지 않습니다</div>';
      } else if (bottomTab === 'fills') {
        const fs = S.d.fills.filter((f) => f.code === code).sort((a, b) => b.at.localeCompare(a.at));
        el.innerHTML = fs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>체결시각</th><th>구분</th><th>체결가</th><th>수량</th><th>금액</th><th>실현손익</th></tr></thead><tbody>${fs.map((f) => `<tr><td class="dim">${U.dt(f.at)}</td><td><span class="tag ${f.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${f.side === 'buy' ? '매수' : '매도'}</span></td><td>${px(f.price, f.currency)}</td><td>${n0(f.qty)}</td><td>${won(f.amount)}</td><td class="${cls(f.pnl)}">${f.side === 'sell' ? signedWon(f.pnl) : '-'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">이 종목의 체결 내역이 없습니다</div>';
      } else if (bottomTab === 'daily') {
        el.innerHTML = '<div class="empty">불러오는 중…</div>';
        Market.candles(code, 'D').then((r) => {
          if (bottomTab !== 'daily') return;
          const d = r.data.slice(-40).reverse();
          el.innerHTML = d.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>일자</th><th>종가</th><th>전일비</th><th>등락률</th><th>시가</th><th>고가</th><th>저가</th><th>거래량</th></tr></thead><tbody>${d.map((k, i) => { const pv = d[i + 1]; const today = i === 0 && U.date(k.t) === U.date(Date.now()) && q.prevClose; const ch = today ? q.change : pv ? k.c - pv.c : 0; const cp = today ? q.changePct : pv ? (ch / pv.c) * 100 : 0; return `<tr><td class="dim">${U.date(k.t)}</td><td class="${cls(ch)}"><b>${pxu(k.c, q.currency)}</b></td><td class="${cls(ch)}">${pv || today ? (ch > 0 ? '▲' : ch < 0 ? '▼' : '') + ' ' + pxu(Math.abs(ch), q.currency) : '-'}</td><td class="${cls(ch)}">${pv || today ? pct(cp) : '-'}</td><td>${pxu(k.o, q.currency)}</td><td class="up">${pxu(k.h, q.currency)}</td><td class="down">${pxu(k.l, q.currency)}</td><td>${n0(k.v)}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">일별 시세가 없습니다.</div>';
        });
      } else if (bottomTab === 'alert') {
        const list = Alerts.list().filter((a) => a.code === code);
        el.innerHTML = `<div class="panel-b"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><div class="field" style="margin:0"><label>조건</label><select class="input" id="alC"><option value="ge">이상 도달 시</option><option value="le">이하 도달 시</option></select></div><div class="field" style="margin:0"><label>가격</label><input class="input" id="alP" inputmode="decimal" style="width:140px;text-align:right" value="${q.currency === 'USD' ? q.price.toFixed(2) : n0(q.price)}"></div><button class="btn btn-brand" id="alAdd">알림 등록</button></div>
          <p class="dim" style="font-size:12px;margin-top:8px">현재가가 조건에 닿으면 화면 알림과 휴대폰·PC 알림으로 알려드립니다.</p>
          ${list.length ? `<div class="table-wrap" style="margin-top:12px"><table class="t"><thead><tr><th>조건</th><th>가격</th><th>상태</th><th></th></tr></thead><tbody>${list.map((a) => `<tr><td>${a.cond === 'ge' ? '이상' : '이하'}</td><td>${pxu(a.price, q.currency)}</td><td>${a.hit ? '<span class="tag tag-ok">도달 ' + U.dt(a.hit) + '</span>' : '<span class="tag tag-wait">대기</span>'}</td><td><button class="btn btn-sm" data-aldel="${a.id}">삭제</button></td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
        $('#alAdd', el).onclick = () => { const v = parseFloat($('#alP', el).value.replace(/,/g, '')); if (!(v > 0)) return U.toast('가격을 입력해 주세요.', true); Alerts.add(code, $('#alC', el).value, v); U.toast('가격 알림이 등록되었습니다.'); renderBottom(); };
        $$('[data-aldel]', el).forEach((b) => (b.onclick = () => { Alerts.remove(b.dataset.aldel); renderBottom(); }));
      } else {
        const m = Market.meta(code);
        el.innerHTML = `<div class="panel-b"><dl class="kv" style="max-width:520px"><dt>시장</dt><dd>${q.market}</dd><dt>업종</dt><dd>${esc(m.sector || '-')}</dd><dt>통화</dt><dd>${q.currency}</dd><dt>전일 종가</dt><dd>${pxu(q.prevClose, q.currency)}</dd><dt>52주 최고</dt><dd class="up">${q.high52 ? px(q.high52, q.currency) : '-'}</dd><dt>52주 최저</dt><dd class="down">${q.low52 ? px(q.low52, q.currency) : '-'}</dd><dt>PER</dt><dd>${q.per ? q.per.toFixed(2) : '-'}</dd><dt>PBR</dt><dd>${q.pbr ? q.pbr.toFixed(2) : '-'}</dd>${q.marketCap ? `<dt>시가총액</dt><dd>${compact(q.marketCap)}${q.currency === 'USD' ? ' USD' : '원'}</dd>` : ''}<dt>장 운영시간 (KST)</dt><dd>${Market.session(q.market).hours}</dd></dl></div>`;
      }
      $$('[data-cancel]', el).forEach((b) => (b.onclick = async () => { try { await Store.cancelOrder(b.dataset.cancel); U.toast('주문이 취소되었습니다.'); } catch (e) { U.toast(e.message, true); } }));
      $$('[data-amend]', el).forEach((b) => (b.onclick = () => amendModal(S.d.orders.find((o) => o.id === b.dataset.amend))));
    }
    function tick() { renderHead(); renderBook(); updSum(); }
    function data() { renderBottom(); updSum(); chart.set({ lines: avgLine() }); renderHead(); }
    syncForm(); tick(); renderBottom(); loadChart();
    const ci = setInterval(() => { if (Market.state.status === 'SAMPLE') chart.draw(); }, 2000);
    return { tick, data, redraw: () => { chart.draw(); }, destroy: () => { clearInterval(ci); chart.destroy(); } };
  }
  function amendModal(o) {
    if (!o) return;
    let price = o.price, qty = o.qty - (o.filled || 0);
    U.modal({
      title: '주문 정정', body: `<p class="muted" style="margin-bottom:14px">${esc(o.name)} · ${o.side === 'buy' ? '매수' : '매도'} 지정가</p>
        <div class="field"><label>정정 가격</label><div class="stepper"><button data-p="-1">−</button><input class="input" id="aP"><button data-p="1">+</button></div></div>
        <div class="field"><label>정정 수량</label><input class="input" id="aQ" inputmode="numeric" style="text-align:right"></div>`,
      foot: '<button class="btn" data-x>닫기</button><button class="btn btn-brand" id="aOk">정정 주문</button>',
      onMount: (m, close) => {
        const sync = () => { $('#aP', m).value = o.currency === 'USD' ? (+price).toFixed(2) : n0(price); $('#aQ', m).value = qty; };
        $$('[data-p]', m).forEach((b) => (b.onclick = () => { price = U.stepPrice(price, o.currency, +b.dataset.p); sync(); }));
        $('#aP', m).onchange = (e) => { price = U.roundTick(parseFloat(e.target.value.replace(/,/g, '')) || price, o.currency); sync(); };
        $('#aQ', m).oninput = (e) => { qty = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0; };
        $('#aOk', m).onclick = async () => { try { const r = await Store.amendOrder(o.id, price, qty); close(); U.toast(r.fill ? '정정 후 즉시 체결되었습니다.' : '주문이 정정되었습니다.'); } catch (e) { U.toast(e.message, true); } };
        sync();
      },
    });
  }

  // ═════════ 시세·순위 (전 종목) ═════════
  function MarketPage(main) {
    const F = (() => { try { return { mk: 'KR', sub: 'all', sort: 'value', page: 0, kw: '', ...JSON.parse(sessionStorage.getItem('mls.mkt') || '{}') }; } catch { return { mk: 'KR', sub: 'all', sort: 'value', page: 0, kw: '' }; } })();
    const SUBS = { KR: [['all', '전체'], ['KOSPI', '코스피'], ['KOSDAQ', '코스닥'], ['ETF', 'ETF']], US: [['all', '전체'], ['NASDAQ', '나스닥'], ['NYSE', '뉴욕'], ['AMEX', '아멕스']] };
    const SORTS = [['value', '거래대금'], ['volume', '거래량'], ['up', '상승률'], ['down', '하락률'], ['cap', '시가총액'], ['high', '52주 신고가 근접'], ['name', '종목명']];
    const PER = 50;
    main.innerHTML = `${head('시세·순위', '국내·미국 전 종목 시세를 시장·조건별로 조회합니다.', `<span class="dim" style="font-size:12px" id="mkT"></span>`)}
      <section class="panel"><div class="panel-h" style="flex-wrap:wrap;gap:8px"><div class="seg" id="mkM"><button data-v="KR">국내</button><button data-v="US">미국</button></div><div class="seg" id="mkS"></div><div class="seg" id="mkO" style="flex-wrap:wrap">${SORTS.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div><input class="input" id="mkQ" placeholder="종목명·코드" style="max-width:180px;height:34px"></div>
      <div id="mkL"></div></section>`;
    const save = () => { try { sessionStorage.setItem('mls.mkt', JSON.stringify(F)); } catch {} };
    const segOn = (id, v) => $$(id + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    $('#mkM').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; F.mk = b.dataset.v; F.sub = 'all'; F.page = 0; draw(); };
    $('#mkS').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; F.sub = b.dataset.v; F.page = 0; draw(); };
    $('#mkO').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; F.sort = b.dataset.v; F.page = 0; draw(); };
    $('#mkQ').value = F.kw; $('#mkQ').oninput = (e) => { F.kw = e.target.value.trim(); F.page = 0; clearTimeout(e.target._t); e.target._t = setTimeout(draw, 200); };
    bindGo($('#mkL'));
    $('#mkL').addEventListener('click', async (e) => { const st = e.target.closest('[data-star]'); if (st) { e.stopPropagation(); await Store.toggleWatch(st.dataset.star); } const pg = e.target.closest('[data-pg]'); if (pg) { F.page = +pg.dataset.pg; draw(); window.scrollTo(0, 0); } });
    function rows() {
      const k = F.kw.toLowerCase();
      let L = Market.list((q) => (F.mk === 'KR' ? q.currency === 'KRW' : q.currency === 'USD') && (F.sub === 'all' || (F.sub === 'ETF' ? q.type === 'etf' : q.market === F.sub && q.type !== 'etf')) && (!k || q.name.toLowerCase().includes(k) || q.code.toLowerCase().includes(k)));
      const val = (q) => q.value || q.price * q.volume;
      const near = (q) => (q.high52 ? q.price / q.high52 : 0);
      const S_ = { value: (a, b) => val(b) - val(a), volume: (a, b) => b.volume - a.volume, up: (a, b) => b.changePct - a.changePct, down: (a, b) => a.changePct - b.changePct, cap: (a, b) => (b.marketCap || 0) - (a.marketCap || 0), high: (a, b) => near(b) - near(a), name: (a, b) => a.name.localeCompare(b.name, 'ko') };
      if (F.sort === 'up' || F.sort === 'down') L = L.filter((q) => q.volume > 0);
      return L.sort(S_[F.sort]);
    }
    function draw() {
      save(); segOn('#mkM', F.mk); $('#mkS').innerHTML = SUBS[F.mk].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join(''); segOn('#mkS', F.sub); segOn('#mkO', F.sort);
      const L = rows(); const pages = Math.max(1, Math.ceil(L.length / PER)); F.page = Math.min(F.page, pages - 1);
      const w = S.user.watch || [];
      const cap = (q) => (q.marketCap ? compact(Market.toKrw(q.marketCap, q.currency)) + '원' : '-');
      $('#mkT').textContent = Market.state.updatedAt ? U.dt(Market.state.updatedAt) + ' 기준' : '';
      $('#mkL').innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th class="l">종목</th><th>현재가</th><th>전일비</th><th>등락률</th><th class="hide-m">거래량</th><th class="hide-m">거래대금</th><th class="hide-m">시가총액</th><th></th></tr></thead><tbody>${L.slice(F.page * PER, F.page * PER + PER).map((q, i) => `<tr class="click" data-go="${q.code}"><td class="dim">${F.page * PER + i + 1}</td><td class="l"><div class="sname"><b>${esc(q.name)}</b><small>${q.code} · ${q.type === 'etf' ? 'ETF' : q.market}</small></div></td><td class="${cls(q.change)}"><b>${px(q.price, q.currency)}</b></td><td class="${cls(q.change)}">${q.change > 0 ? '▲' : q.change < 0 ? '▼' : ''} ${pxu(Math.abs(q.change), q.currency)}</td><td class="${cls(q.change)}">${pct(q.changePct)}</td><td class="hide-m">${n0(q.volume)}</td><td class="hide-m">${compact(Market.toKrw(q.value || q.price * q.volume, q.currency))}원</td><td class="hide-m">${cap(q)}</td><td><button class="star ${w.includes(q.code) ? 'on' : ''}" data-star="${q.code}" data-stop title="관심종목">${ICON.star}</button></td></tr>`).join('') || '<tr><td colspan="9"><div class="empty">조건에 맞는 종목이 없습니다.</div></td></tr>'}</tbody></table></div>
        <div style="display:flex;gap:6px;justify-content:center;align-items:center;padding:14px;flex-wrap:wrap"><span class="dim" style="font-size:12px;margin-right:8px">${n0(L.length)}종목</span>${F.page > 0 ? `<button class="btn btn-sm" data-pg="0">처음</button><button class="btn btn-sm" data-pg="${F.page - 1}">이전</button>` : ''}<span style="font-size:13px">${F.page + 1} / ${pages}</span>${F.page < pages - 1 ? `<button class="btn btn-sm" data-pg="${F.page + 1}">다음</button><button class="btn btn-sm" data-pg="${pages - 1}">끝</button>` : ''}</div>`;
    }
    draw();
    let t = 0;
    return { data: draw, tick: () => { if (Date.now() - t > 5000) { t = Date.now(); draw(); } } };
  }

  // ═════════ 관심종목 (그룹) ═════════
  function Watch(main) {
    let G = [], cur = 0;
    main.innerHTML = `${head('관심종목', '그룹별로 관심종목을 모아 실시간 시세를 확인합니다.', '<button class="btn btn-sm" id="wgNew">그룹 추가</button>')}
      <section class="panel"><div class="panel-h" style="flex-wrap:wrap;gap:8px"><div class="tabs" id="wgT" style="border:0;flex-wrap:wrap"></div><div style="display:flex;gap:6px;margin-left:auto"><button class="btn btn-sm" id="wgRen">이름 변경</button><button class="btn btn-sm" id="wgDel">그룹 삭제</button></div></div>
      <div class="panel-b" style="position:relative;border-bottom:1px solid var(--border)"><div class="search" style="max-width:420px">${ICON.search}<input id="wgQ" style="width:100%" placeholder="종목명·코드로 검색해서 추가" autocomplete="off"><div class="search-results hidden" id="wgR"></div></div></div>
      <div id="wgL"></div></section>`;
    const norm = () => {
      const w = S.user.watch || []; const inG = new Set(G.flatMap((g) => g.codes));
      G.forEach((g) => (g.codes = g.codes.filter((c) => w.includes(c))));
      const extra = w.filter((c) => !inG.has(c)); if (extra.length) { if (!G.length) G.push({ id: 'g1', name: '관심종목', codes: [] }); G[0].codes.push(...extra); }
      if (!G.length) G.push({ id: 'g1', name: '관심종목', codes: [] });
      cur = Math.min(cur, G.length - 1);
    };
    const persist = async () => { G = await Store.saveWatchGroups(G); };
    async function load() { G = await Store.watchGroups(); norm(); draw(); }
    function draw() {
      $('#wgT').innerHTML = G.map((g, i) => `<button data-g="${i}" class="${i === cur ? 'on' : ''}">${esc(g.name)} <span class="dim">${g.codes.length}</span></button>`).join('');
      const g = G[cur]; const qs = g.codes.map(Market.quote).filter(Boolean);
      $('#wgL').innerHTML = qs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th class="l">종목</th><th>현재가</th><th>등락률</th><th class="hide-m">거래량</th><th class="hide-m">보유</th><th>순서</th><th></th></tr></thead><tbody>${qs.map((q, i) => { const h = S.v.holdings.find((x) => x.code === q.code); return `<tr class="click" data-go="${q.code}"><td class="l"><div class="sname"><b>${esc(q.name)}</b><small>${q.code} · ${q.type === 'etf' ? 'ETF' : q.market}</small></div></td><td class="${cls(q.change)}"><b>${px(q.price, q.currency)}</b></td><td class="${cls(q.change)}">${pct(q.changePct)}</td><td class="hide-m">${n0(q.volume)}</td><td class="hide-m">${h ? n0(h.qty) + '주 · <span class="' + cls(h.pnl) + '">' + pct(h.pnlPct) + '</span>' : '-'}</td><td data-stop><button class="btn btn-sm" data-mv="${i},-1" ${i === 0 ? 'disabled' : ''}>▲</button> <button class="btn btn-sm" data-mv="${i},1" ${i === qs.length - 1 ? 'disabled' : ''}>▼</button></td><td data-stop><select class="input" data-mvg="${q.code}" style="height:30px;width:auto">${G.map((x, j) => `<option value="${j}" ${j === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select> <button class="btn btn-sm" data-rm="${q.code}">삭제</button></td></tr>`; }).join('')}</tbody></table></div>`
        : '<div class="empty">이 그룹에 종목이 없습니다. 위 검색창에서 종목을 추가하세요.</div>';
    }
    bindGo($('#wgL'));
    $('#wgT').onclick = (e) => { const b = e.target.closest('[data-g]'); if (!b) return; cur = +b.dataset.g; draw(); };
    $('#wgNew').onclick = async () => { const n = prompt('새 그룹 이름', '그룹 ' + (G.length + 1)); if (!n) return; if (G.length >= 20) return U.toast('그룹은 20개까지 만들 수 있습니다.', true); G.push({ id: U.uid('g'), name: n.slice(0, 20), codes: [] }); cur = G.length - 1; await persist(); norm(); draw(); };
    $('#wgRen').onclick = async () => { const n = prompt('그룹 이름', G[cur].name); if (!n) return; G[cur].name = n.slice(0, 20); await persist(); norm(); draw(); };
    $('#wgDel').onclick = async () => { if (G.length <= 1) return U.toast('그룹이 하나뿐이라 삭제할 수 없습니다.', true); if (!(await U.confirmBox('그룹 삭제', `<p>'${esc(G[cur].name)}' 그룹과 그 안의 관심종목을 삭제할까요?</p>`))) return; G.splice(cur, 1); cur = 0; await persist(); norm(); draw(); };
    $('#wgL').addEventListener('click', async (e) => {
      const mv = e.target.closest('[data-mv]'); if (mv) { e.stopPropagation(); const [i, d] = mv.dataset.mv.split(',').map(Number); const c = G[cur].codes; [c[i], c[i + d]] = [c[i + d], c[i]]; await persist(); norm(); draw(); return; }
      const rm = e.target.closest('[data-rm]'); if (rm) { e.stopPropagation(); G[cur].codes = G[cur].codes.filter((x) => x !== rm.dataset.rm); await persist(); norm(); draw(); return; }
      if (e.target.closest('[data-stop]')) e.stopPropagation();
    }, true);
    $('#wgL').addEventListener('change', async (e) => { const s = e.target.closest('[data-mvg]'); if (!s) return; const to = +s.value; if (to === cur) return; const c = s.dataset.mvg; G[cur].codes = G[cur].codes.filter((x) => x !== c); if (!G[to].codes.includes(c)) G[to].codes.push(c); await persist(); norm(); draw(); });
    const qi = $('#wgQ'), qr = $('#wgR');
    qi.oninput = () => { const k = qi.value.trim().toLowerCase(); if (!k) { qr.classList.add('hidden'); return; } const res = Market.list((q) => q.name.toLowerCase().includes(k) || q.code.toLowerCase().includes(k)).slice(0, 12); qr.innerHTML = res.map((q) => `<button data-add="${q.code}"><span><b>${esc(q.name)}</b> <small class="dim">${q.code} · ${q.market}</small></span><span class="${cls(q.change)}">${px(q.price, q.currency)} <small>+ 추가</small></span></button>`).join('') || '<div class="empty">검색 결과가 없습니다</div>'; qr.classList.remove('hidden'); };
    qr.onclick = async (e) => { const a = e.target.closest('[data-add]'); if (!a) return; const c = a.dataset.add; if (!G[cur].codes.includes(c)) { if (G[cur].codes.length >= 100) return U.toast('그룹당 100종목까지 담을 수 있습니다.', true); G[cur].codes.push(c); await persist(); norm(); draw(); U.toast('관심종목에 추가되었습니다.'); } qi.value = ''; qr.classList.add('hidden'); };
    document.addEventListener('click', (e) => { if (!e.target.closest('#wgQ, #wgR')) qr.classList.add('hidden'); });
    load();
    let t = 0;
    return { data: () => { G.length ? (norm(), draw()) : load(); }, tick: () => { if (Date.now() - t > 3000) { t = Date.now(); if (G.length) draw(); } } };
  }

  // ═════════ 잔고 ═════════
  function Balance(main) {
    let range = 30;
    main.innerHTML = `${head('잔고', '보유종목과 계좌 수익률을 확인합니다.')}
      <div class="grid g-4" style="margin-bottom:16px" id="bStats"></div>
      <div class="grid g-main" style="margin-bottom:16px">
        <section class="panel"><div class="panel-h"><h3>계좌 수익률 추이</h3><div class="seg" id="bRange"><button data-v="7">1주</button><button data-v="30" class="on">1개월</button><button data-v="90">3개월</button><button data-v="9999">전체</button></div></div><div class="panel-b"><div style="height:240px"><canvas id="bLine" style="width:100%;height:100%"></canvas></div></div></section>
        <section class="panel"><div class="panel-h"><h3>자산 구성</h3></div><div class="panel-b" id="bAlloc"></div></section>
      </div>
      <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>보유종목</h3><span class="dim" style="font-size:12px" id="bCnt"></span></div><div class="panel-b flush"><div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>보유수량</th><th>평균단가</th><th>현재가</th><th>평가금액</th><th>평가손익</th><th>수익률</th><th class="hide-m"></th></tr></thead><tbody id="bHold"></tbody></table></div></div></section>
      <section class="panel"><div class="panel-h"><h3>미체결 주문</h3></div><div class="panel-b flush" id="bOpen"></div></section>`;
    $('#bRange').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; range = +b.dataset.v; $$('#bRange button').forEach((x) => x.classList.toggle('on', x === b)); drawLine(); };
    bindGo($('#bHold'));
    function drawLine() {
      const snaps = (S.d.snapshots || []).map((s) => [s[0], s[1]]);
      if (!snaps.length || snaps[snaps.length - 1][0] !== U.today()) snaps.push([U.today(), S.v.total]); else snaps[snaps.length - 1][1] = S.v.total;
      const pts = snaps.slice(-range).map(([d, v]) => [d, S.v.principal ? ((v - S.v.principal) / S.v.principal) * 100 : 0]);
      Chart.line($('#bLine'), { points: pts, color: (pts[pts.length - 1] || [0, 0])[1] >= 0 ? Chart.css('--up') : Chart.css('--down'), labels: true, base: 0, fmt: (v) => v.toFixed(1) + '%' });
    }
    function tick() {
      const v = S.v;
      $('#bStats').innerHTML = `
        <div class="panel panel-b stat"><div class="k">총 평가자산</div><div class="v">${won(v.total)}</div><div class="s ${cls(v.totalPnl)}">${signedWon(v.totalPnl)} (${pct(v.totalPct)})</div></div>
        <div class="panel panel-b stat"><div class="k">평가손익</div><div class="v ${cls(v.pnl)}">${signedWon(v.pnl)}</div><div class="s ${cls(v.pnl)}">${pct(v.pnlPct)}</div></div>
        <div class="panel panel-b stat"><div class="k">예수금 · 주문가능</div><div class="v">${won(v.cash)}</div><div class="s muted">주문가능 ${won(v.orderable)}</div></div>
        <div class="panel panel-b stat"><div class="k">실현손익 (누적)</div><div class="v ${cls(v.realized)}">${signedWon(v.realized)}</div><div class="s muted">투자원금 ${won(v.principal)}</div></div>`;
      $('#bCnt').textContent = v.holdings.length + '종목';
      $('#bHold').innerHTML = v.holdings.length ? v.holdings.map((h) => `<tr class="click" data-go="${h.code}"><td><div class="sname"><b>${esc(h.name)}</b><small>${h.code} · ${h.market}</small></div></td><td>${n0(h.qty)}</td><td>${px(h.avg, h.currency)}</td><td class="${cls(h.changePct)}">${px(h.price, h.currency)}</td><td>${won(h.evalKrw)}</td><td class="${cls(h.pnl)}">${signedWon(h.pnl)}</td><td class="${cls(h.pnl)}"><b>${pct(h.pnlPct)}</b></td><td class="hide-m"><button class="btn btn-sm btn-sell" data-stop data-sell="${h.code}">매도</button></td></tr>`).join('') : '<tr><td colspan="8"><div class="empty">보유종목이 없습니다</div></td></tr>';
      $$('[data-sell]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); sessionStorage.setItem('mls.prefill', JSON.stringify({ code: b.dataset.sell, side: 'sell' })); location.hash = '#/stock/' + b.dataset.sell; }));
      const tot = v.total || 1; const items = v.holdings.slice(0, 5).map((h) => [h.name, h.evalKrw]); const rest = v.holdings.slice(5).reduce((s, h) => s + h.evalKrw, 0); if (rest) items.push(['기타', rest]); items.push(['예수금', v.cash]);
      const cols = ['#B7E77A', '#619AFF', '#FF626B', '#F5B94A', '#B48CFF', '#56C7C7', '#8A94A6'];
      $('#bAlloc').innerHTML = `<div style="display:flex;height:12px;border-radius:6px;overflow:hidden;margin-bottom:16px">${items.map(([, val], i) => `<span style="width:${(val / tot) * 100}%;background:${i === items.length - 1 ? 'var(--border-strong)' : cols[i]}"></span>`).join('')}</div>` +
        items.map(([nm, val], i) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px"><span style="width:8px;height:8px;border-radius:2px;background:${i === items.length - 1 ? 'var(--border-strong)' : cols[i]}"></span><span>${esc(nm)}</span><span class="dim" style="margin-left:auto">${((val / tot) * 100).toFixed(1)}%</span><b style="width:120px;text-align:right">${won(val)}</b></div>`).join('');
    }
    function data() {
      tick(); drawLine();
      const os = S.d.orders.filter((o) => o.status === 'pending');
      $('#bOpen').innerHTML = os.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>구분</th><th>주문가</th><th>수량</th><th>현재가</th><th class="hide-m">주문시각</th><th></th></tr></thead><tbody>${os.map((o) => { const q = Market.quote(o.code); return `<tr><td><div class="sname"><b>${esc(o.name)}</b><small>${o.code}</small></div></td><td><span class="tag ${o.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${o.side === 'buy' ? '매수' : '매도'}</span></td><td>${px(o.price, o.currency)}</td><td>${n0(o.qty)}</td><td class="${cls(q.change)}">${px(q.price, q.currency)}</td><td class="hide-m dim">${U.dt(o.createdAt)}</td><td><button class="btn btn-sm" data-amend="${o.id}">정정</button> <button class="btn btn-sm btn-danger" data-cancel="${o.id}">취소</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">미체결 주문이 없습니다</div>';
      $$('#bOpen [data-cancel]').forEach((b) => (b.onclick = async () => { try { await Store.cancelOrder(b.dataset.cancel); U.toast('주문이 취소되었습니다.'); } catch (e) { U.toast(e.message, true); } }));
      $$('#bOpen [data-amend]').forEach((b) => (b.onclick = () => amendModal(S.d.orders.find((o) => o.id === b.dataset.amend))));
    }
    data();
    return { data, tick, redraw: data };
  }

  // ═════════ 거래내역 ═════════
  function History(main) {
    const F = { tab: 'fills', side: 'all', period: 30, mk: 'all' };
    main.innerHTML = `${head('거래내역', '매수·매도 체결 내역과 실현손익을 확인합니다.')}
      <div class="grid g-4" style="margin-bottom:16px" id="hsSum"></div>
      <section class="panel">
        <div class="tabs" id="hsTab"><button data-v="fills" class="on">체결내역</button><button data-v="orders">주문내역</button></div>
        <div class="panel-b" style="padding-bottom:0"><div class="filters">
          <div class="seg" id="hsSide"><button data-v="all" class="on">전체</button><button data-v="buy">매수</button><button data-v="sell">매도</button></div>
          <div class="seg" id="hsMk"><button data-v="all" class="on">전체</button><button data-v="KRW">국내</button><button data-v="USD">미국</button></div>
          <select class="input" id="hsPer"><option value="1">오늘</option><option value="7">1주일</option><option value="30" selected>1개월</option><option value="90">3개월</option><option value="99999">전체</option></select>
        </div></div>
        <div class="panel-b flush" style="margin-top:12px" id="hsList"></div>
      </section>`;
    const seg = (id, key) => ($(id).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; F[key] = b.dataset.v; $$(id + ' button').forEach((x) => x.classList.toggle('on', x === b)); data(); });
    seg('#hsTab', 'tab'); seg('#hsSide', 'side'); seg('#hsMk', 'mk');
    $('#hsPer').onchange = (e) => { F.period = +e.target.value; data(); };
    function inRange(t) { const s = new Date(); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - (F.period - 1)); return new Date(t) >= s; }
    function data() {
      const fs = S.d.fills.filter((f) => inRange(f.at) && (F.side === 'all' || f.side === F.side) && (F.mk === 'all' || f.currency === F.mk)).sort((a, b) => b.at.localeCompare(a.at));
      const buy = fs.filter((f) => f.side === 'buy').reduce((s, f) => s + f.amount, 0), sell = fs.filter((f) => f.side === 'sell').reduce((s, f) => s + f.amount, 0);
      const pnl = fs.reduce((s, f) => s + (f.pnl || 0), 0), cost = fs.reduce((s, f) => s + f.fee + f.tax, 0);
      $('#hsSum').innerHTML = `<div class="panel panel-b stat"><div class="k">매수 합계</div><div class="v up">${won(buy)}</div></div><div class="panel panel-b stat"><div class="k">매도 합계</div><div class="v down">${won(sell)}</div></div><div class="panel panel-b stat"><div class="k">실현손익</div><div class="v ${cls(pnl)}">${signedWon(pnl)}</div></div><div class="panel panel-b stat"><div class="k">수수료 + 세금</div><div class="v">${won(cost)}</div></div>`;
      if (F.tab === 'fills') {
        $('#hsList').innerHTML = fs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>체결일시</th><th class="l">종목</th><th>구분</th><th>체결가</th><th>수량</th><th>체결금액</th><th class="hide-m">수수료</th><th class="hide-m">세금</th><th>실현손익</th></tr></thead><tbody>${fs.map((f) => `<tr><td class="dim">${U.dt(f.at)}</td><td class="l"><div class="sname"><b>${esc(f.name)}</b><small>${f.code}</small></div></td><td><span class="tag ${f.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${f.side === 'buy' ? '매수' : '매도'}</span></td><td>${px(f.price, f.currency)}</td><td>${n0(f.qty)}</td><td>${won(f.amount)}</td><td class="hide-m">${won(f.fee)}</td><td class="hide-m">${won(f.tax)}</td><td class="${cls(f.pnl)}">${f.side === 'sell' ? signedWon(f.pnl) : '-'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">조회 기간에 체결 내역이 없습니다</div>';
      } else {
        const os = S.d.orders.filter((o) => inRange(o.createdAt) && (F.side === 'all' || o.side === F.side) && (F.mk === 'all' || o.currency === F.mk)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const stt = { pending: ['미체결', 'tag-wait'], filled: ['체결', 'tag-ok'], cancelled: ['취소', 'tag-no'], rejected: ['거부', 'tag-no'] };
        $('#hsList').innerHTML = os.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>주문일시</th><th class="l">종목</th><th>구분</th><th>유형</th><th>주문가</th><th>수량</th><th>체결가</th><th>상태</th></tr></thead><tbody>${os.map((o) => `<tr><td class="dim">${U.dt(o.createdAt)}</td><td class="l"><div class="sname"><b>${esc(o.name)}</b><small>${o.code}</small></div></td><td><span class="tag ${o.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${o.side === 'buy' ? '매수' : '매도'}</span></td><td>${o.type === 'market' ? '시장가' : '지정가'}${o.amended ? ' <span class="dim">(정정)</span>' : ''}</td><td>${o.type === 'market' ? '-' : px(o.price, o.currency)}</td><td>${n0(o.qty)}</td><td>${o.avgFill ? px(o.avgFill, o.currency) : '-'}</td><td><span class="tag ${(stt[o.status] || stt.rejected)[1]}">${(stt[o.status] || stt.rejected)[0]}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">조회 기간에 주문 내역이 없습니다</div>';
      }
    }
    data();
    return { data };
  }

  // ═════════ 입출금 ═════════
  function Cash(main) {
    let type = 'deposit';
    main.innerHTML = `${head('입출금', '가상 예수금 입금·출금을 신청합니다. 관리자 승인 후 반영됩니다.')}
      <div class="notice-bar"><b>안내</b><span>모든 입출금 신청은 관리자 승인 후 계좌에 반영됩니다.${S.st.autoApprove ? ' (현재 자동 승인 운영 중)' : ''}</span></div>
      <div class="grid g-main" style="margin-bottom:16px">
        <section class="panel">
          <div class="order-side" id="cType"><button class="buy on" data-v="deposit">입금 신청</button><button class="sell" data-v="withdraw">출금 신청</button></div>
          <div class="panel-b">
            <div class="field"><label id="cLbl">입금 신청 금액</label><div class="input-unit"><input class="input" id="cAmt" inputmode="numeric" placeholder="0" style="height:52px;font-size:20px"><span style="top:16px">원</span></div>
              <div class="chips" style="margin-top:8px" id="cQuick"><button class="chip" data-a="1000000">+100만</button><button class="chip" data-a="5000000">+500만</button><button class="chip" data-a="10000000">+1,000만</button><button class="chip" data-a="50000000">+5,000만</button><button class="chip" data-a="max" id="cMax" hidden>전액</button><button class="chip" data-a="0">초기화</button></div></div>
            <div class="field"><label>메모 (선택)</label><input class="input" id="cMemo" maxlength="60" placeholder="예: 추가 연습자금 요청"></div>
            <div class="order-sum" id="cSum"></div>
            <button class="btn btn-brand btn-block btn-lg" id="cGo">신청하기</button>
          </div>
        </section>
        <section class="panel"><div class="panel-h"><h3>가상 계좌</h3></div><div class="panel-b" id="cAcct"></div></section>
      </div>
      <section class="panel"><div class="panel-h"><h3>입출금 내역</h3></div><div class="panel-b flush" id="cList"></div></section>`;
    const amt = () => parseInt(($('#cAmt').value || '').replace(/[^0-9]/g, ''), 10) || 0;
    const fmtAmt = () => { const a = amt(); $('#cAmt').value = a ? n0(a) : ''; sum(); };
    $('#cAmt').addEventListener('input', fmtAmt);
    $('#cType').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.v; $$('#cType button').forEach((x) => x.classList.toggle('on', x === b)); $('#cLbl').textContent = type === 'deposit' ? '입금 신청 금액' : '출금 신청 금액'; $('#cMax').hidden = type !== 'withdraw'; sum(); };
    $('#cQuick').onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; $('#cAmt').value = a === 'max' ? n0(S.v.withdrawable) : a === '0' ? '' : n0(amt() + +a); fmtAmt(); };
    $('#cGo').onclick = async () => {
      const a = amt(); if (a < 10000) return U.toast('최소 10,000원 이상 입력해 주세요.', true);
      const ok = await U.confirmBox(type === 'deposit' ? '입금 신청' : '출금 신청', `<p style="font-size:15px"><b>${won(a)}</b> ${type === 'deposit' ? '입금' : '출금'}을 신청합니다.</p><p class="muted" style="margin-top:8px;font-size:13px">관리자 승인 후 가상 예수금에 반영됩니다. 실제 송금은 없습니다.</p>`, '신청');
      if (!ok) return;
      try { const c = await Store.requestCash(type, a, $('#cMemo').value); $('#cAmt').value = ''; $('#cMemo').value = ''; U.toast(c.status === 'approved' ? '승인되어 즉시 반영되었습니다.' : '신청이 접수되었습니다. 승인 대기 중입니다.'); } catch (e) { U.toast(e.message, true); }
    };
    function sum() {
      const a = amt(); const after = type === 'deposit' ? S.v.cash + a : S.v.cash - a;
      $('#cSum').innerHTML = `<dl class="kv"><dt>현재 예수금</dt><dd>${won(S.v.cash)}</dd>${type === 'withdraw' ? `<dt>출금가능금액</dt><dd>${won(S.v.withdrawable)}</dd>` : `<dt>1회 최대</dt><dd>${won(S.st.maxDeposit)}</dd>`}<dt>승인 후 예수금</dt><dd class="${type === 'deposit' ? 'up' : 'down'}">${won(Math.max(0, after))}</dd></dl>`;
    }
    function data() {
      const v = S.v; sum();
      $('#cAcct').innerHTML = `<div class="stat"><div class="k">예수금</div><div class="v" style="font-size:28px">${won(v.cash)}</div></div><div class="divider"></div><dl class="kv"><dt>주문 대기 금액</dt><dd>${won(v.reserved)}</dd><dt>출금가능금액</dt><dd>${won(v.withdrawable)}</dd><dt>최초 지급액</dt><dd>${won(S.user.initial)}</dd><dt>누적 입금</dt><dd class="up">${won(v.deposits)}</dd><dt>누적 출금</dt><dd class="down">${won(v.withdrawals)}</dd><dt>투자원금</dt><dd>${won(v.principal)}</dd></dl><div class="divider"></div><p class="dim" style="font-size:12px;line-height:1.7">가상계좌번호 ${S.user.id.slice(-8).toUpperCase().replace(/(.{4})/, '$1-')}-01<br>MAX라이프 주식 · 종합계좌</p>`;
      const cs = S.d.cashflows.slice().sort((a, b) => b.at.localeCompare(a.at));
      const stt = { pending: ['승인 대기', 'tag-wait'], approved: ['승인 완료', 'tag-ok'], rejected: ['반려', 'tag-sell'], cancelled: ['취소', 'tag-no'] };
      $('#cList').innerHTML = cs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th>구분</th><th>금액</th><th class="l hide-m">메모</th><th>상태</th><th class="hide-m">처리일시</th><th></th></tr></thead><tbody>${cs.map((c) => `<tr><td class="dim">${U.dt(c.at)}</td><td><span class="tag ${c.type === 'deposit' ? 'tag-buy' : 'tag-sell'}">${c.type === 'deposit' ? '입금' : '출금'}</span></td><td><b>${won(c.amount)}</b></td><td class="l hide-m muted">${esc(c.memo || '')}${c.adminMemo ? ` <span class="dim">· ${esc(c.adminMemo)}</span>` : ''}</td><td><span class="tag ${stt[c.status][1]}">${stt[c.status][0]}</span></td><td class="hide-m dim">${c.processedAt ? U.dt(c.processedAt) : '-'}</td><td>${c.status === 'pending' ? `<button class="btn btn-sm" data-cc="${c.id}">취소</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">입출금 내역이 없습니다</div>';
      $$('[data-cc]').forEach((b) => (b.onclick = async () => { try { await Store.cancelCash(b.dataset.cc); U.toast('신청이 취소되었습니다.'); } catch (e) { U.toast(e.message, true); } }));
    }
    data();
    return { data, tick: () => { $('#cAcct') && data(); } };
  }

  // ═════════ 리딩룸 ═════════
  function Lead(main) {
    const staff = S.user.role !== 'user';
    let filter = 'all';
    main.innerHTML = `${head('리딩룸', '강사가 가상계좌로 직접 시연하는 실전 매매 교육입니다.', staff ? '<button class="btn btn-brand" id="lNew">리딩 작성</button>' : '')}
      <div class="grid g-main">
        <section class="panel"><div class="tabs" id="lTab"><button data-v="all" class="on">전체</button><button data-v="trade">매매 시연</button><button data-v="lesson">강의</button><button data-v="open">진행중</button></div><div id="lFeed"></div></section>
        <div>
          <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>실시간 공지</h3>${staff ? '<button class="btn btn-sm" id="nNew">공지 작성</button>' : ''}</div><div id="lNotice"></div></section>
          <section class="panel"><div class="panel-h"><h3>리딩 성과</h3></div><div class="panel-b" id="lPerf"></div></section>
          <p class="dim" style="font-size:11px;margin-top:12px;line-height:1.7;padding:0 4px">리딩룸의 모든 매매는 가상계좌 기반 교육용 시연이며, 특정 종목의 매수·매도를 권유하는 투자자문이 아닙니다. 투자 판단과 책임은 본인에게 있습니다.</p>
        </div>
      </div>`;
    if (staff) { $('#lNew').onclick = () => postEditor(); $('#nNew').onclick = () => noticeEditor(); }
    $('#lTab').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.v; $$('#lTab button').forEach((x) => x.classList.toggle('on', x === b)); data(); };
    const charts = [];
    function data() {
      charts.splice(0).forEach((c) => c.destroy());
      const ps = S.posts.filter((p) => filter === 'all' || (filter === 'open' ? p.kind === 'trade' && p.result === 'open' : p.kind === filter));
      $('#lFeed').innerHTML = ps.length ? ps.map(card).join('') : '<div class="empty">게시물이 없습니다</div>';
      ps.forEach(async (p) => {
        if (p.kind !== 'trade' || !p.code || !Market.quote(p.code)) return;
        const cv = $(`[data-mc="${p.id}"]`); if (!cv) return;
        const q = Market.quote(p.code);
        const ch = Chart.candle(cv, { ccy: q.currency, view: 60, lines: [{ price: p.entry, label: '진입', color: '#8A94A6' }, { price: p.target, label: '목표', color: Chart.css('--up') }, { price: p.stop, label: '손절', color: Chart.css('--down') }] });
        charts.push(ch); const r = await Market.candles(p.code, 'D'); ch.set({ data: r.data });
      });
      $$('[data-like]').forEach((b) => (b.onclick = () => Store.like(b.dataset.like)));
      $$('[data-follow]').forEach((b) => (b.onclick = () => { const p = S.posts.find((x) => x.id === b.dataset.follow); sessionStorage.setItem('mls.prefill', JSON.stringify({ code: p.code, side: p.side || 'buy', price: p.entry })); location.hash = '#/stock/' + p.code; }));
      $$('[data-cform]').forEach((f) => (f.onsubmit = async (e) => { e.preventDefault(); const i = f.querySelector('input'); try { await Store.comment(f.dataset.cform, i.value); } catch (er) { U.toast(er.message, true); } }));
      $$('[data-delc]').forEach((b) => (b.onclick = async () => { const [pid, cid] = b.dataset.delc.split('|'); try { await Store.deleteComment(pid, cid); } catch (e) { U.toast(e.message, true); } }));
      $$('[data-edit]').forEach((b) => (b.onclick = () => postEditor(S.posts.find((x) => x.id === b.dataset.edit))));
      $$('[data-del]').forEach((b) => (b.onclick = async () => { if (await U.confirmBox('삭제', '이 게시물을 삭제할까요?', '삭제', 'btn-danger')) Store.deletePost(b.dataset.del); }));
      $('#lNotice').innerHTML = S.notices.length ? S.notices.map((n) => `<div class="feed-card" style="padding:14px 18px"><div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">${n.pinned ? '<span class="tag tag-brand">고정</span>' : ''}<span class="dim" style="font-size:12px">${U.ago(n.at)}</span>${staff ? `<button class="btn btn-sm btn-ghost" data-ndel="${n.id}" style="margin-left:auto">삭제</button>` : ''}</div><b>${esc(n.title)}</b>${n.body ? `<p class="muted" style="font-size:13px;margin-top:4px;white-space:pre-wrap">${esc(n.body)}</p>` : ''}</div>`).join('') : '<div class="empty">공지가 없습니다</div>';
      $$('[data-ndel]').forEach((b) => (b.onclick = () => Store.deleteNotice(b.dataset.ndel)));
      const done = S.posts.filter((p) => p.kind === 'trade' && p.result && p.result !== 'open');
      const win = done.filter((p) => p.resultPct > 0).length; const avg = done.length ? done.reduce((s, p) => s + (+p.resultPct || 0), 0) / done.length : 0;
      $('#lPerf').innerHTML = `<dl class="kv"><dt>종료된 시연</dt><dd>${done.length}건</dd><dt>진행중</dt><dd>${S.posts.filter((p) => p.kind === 'trade' && p.result === 'open').length}건</dd><dt>승률</dt><dd>${done.length ? ((win / done.length) * 100).toFixed(0) + '%' : '-'}</dd><dt>평균 수익률</dt><dd class="${cls(avg)}">${done.length ? pct(avg) : '-'}</dd></dl>`;
    }
    function card(p) {
      const q = p.code && Market.quote(p.code);
      const live = q && p.kind === 'trade' && p.entry ? ((q.price - p.entry) / p.entry) * 100 * (p.side === 'sell' ? -1 : 1) : null;
      const yt = (p.video || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
      const can = staff;
      return `<article class="feed-card">
        <div class="feed-meta"><span class="avatar">${esc((p.authorName || '강').slice(0, 1))}</span><div class="who"><b>${esc(p.authorName || '강사')}</b><small>${U.ago(p.at)}${p.updatedAt ? ' · 수정됨' : ''}</small></div><div style="margin-left:auto;display:flex;gap:6px;align-items:center">${p.kind === 'trade' ? `<span class="tag ${p.side === 'sell' ? 'tag-sell' : 'tag-buy'}">${p.side === 'sell' ? '매도 시연' : '매수 시연'}</span>` : '<span class="tag tag-brand">강의</span>'}${resultTag(p)}</div></div>
        <h3>${esc(p.title)}</h3>
        ${q && p.kind === 'trade' ? `<a href="#/stock/${p.code}" style="display:inline-flex;gap:8px;align-items:baseline;font-size:13px;margin-bottom:4px"><b>${esc(q.name)}</b><span class="dim">${p.code}</span><span class="${cls(q.change)}">${px(q.price, q.currency)} ${pct(q.changePct)}</span></a>
          <div class="plan"><div><small>진입가</small><b>${px(p.entry, q.currency)}</b></div><div><small>목표가</small><b class="up">${px(p.target, q.currency)}</b></div><div><small>손절가</small><b class="down">${px(p.stop, q.currency)}</b></div><div><small>${p.result === 'open' ? '현재 수익률' : '결과'}</small><b class="${cls(p.result === 'open' ? live : p.resultPct)}">${p.result === 'open' ? pct(live) : pct(+p.resultPct || 0)}</b></div></div>
          <div class="mini-chart"><canvas data-mc="${p.id}"></canvas></div>` : ''}
        ${p.image ? `<img src="${esc(p.image)}" alt="" style="border-radius:6px;border:1px solid var(--border);margin:12px 0" loading="lazy">` : ''}
        <div class="body">${esc(p.body)}</div>
        ${yt ? `<div class="video-wrap"><iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen loading="lazy" title="강의 영상"></iframe></div>` : p.video ? `<p style="margin-top:10px"><a class="brand" href="${esc(p.video)}" target="_blank" rel="noopener">강의 영상 보기 →</a></p>` : ''}
        <div class="feed-actions"><button class="btn btn-sm ${p.likes.includes(S.user.id) ? 'btn-brand' : ''}" data-like="${p.id}">도움돼요 ${p.likes.length}</button>${q && p.kind === 'trade' && p.result === 'open' ? `<button class="btn btn-sm" data-follow="${p.id}">가상계좌로 따라하기</button>` : ''}${can ? `<button class="btn btn-sm btn-ghost" data-edit="${p.id}" style="margin-left:auto">수정</button><button class="btn btn-sm btn-ghost" data-del="${p.id}">삭제</button>` : ''}</div>
        <div class="comments">${p.comments.map((c) => `<div class="comment"><span class="avatar" style="width:24px;height:24px;font-size:11px">${esc(c.name.slice(0, 1))}</span><div style="flex:1"><b>${esc(c.name)}</b>${esc(c.text)}<small>${U.ago(c.at)}</small>${c.userId === S.user.id || staff ? ` <button class="dim" style="font-size:11px" data-delc="${p.id}|${c.id}">삭제</button>` : ''}</div></div>`).join('')}
          <form class="comment-form" data-cform="${p.id}"><input class="input" placeholder="질문이나 의견을 남겨주세요" maxlength="500" style="height:36px"><button class="btn btn-sm" style="height:36px">등록</button></form></div>
      </article>`;
    }
    data();
    return { data, tick: () => {}, destroy: () => charts.forEach((c) => c.destroy()) };
  }
  const { postEditor, noticeEditor } = Editors;


  // ═════════ 랭킹 ═════════
  function Rank(main) {
    main.innerHTML = `${head('수익률 랭킹', '전체 수강생의 누적 수익률 순위입니다. (입출금 반영 원금 기준)')}<div id="rk"></div>`;
    async function data() {
      const rows = (await Store.ranking()).map((b) => { const v = Engine.valuate(b, S.st); return { id: b.user.id, name: b.user.name, total: v.total, pct: v.totalPct, n: v.holdings.length, trades: (b.fills || []).length }; }).sort((a, b) => b.pct - a.pct);
      const me = rows.findIndex((r) => r.id === S.user.id);
      const nm = (r) => (r.id === S.user.id ? esc(r.name) + ' (나)' : esc(U.mask(r.name)));
      $('#rk').innerHTML = `
        ${me >= 0 ? `<div class="notice-bar"><b>내 순위</b><span>${me + 1}위 / ${rows.length}명 · 누적 수익률 <b class="${cls(rows[me].pct)}" style="color:inherit">${pct(rows[me].pct)}</b></span></div>` : ''}
        <div class="podium">${rows.slice(0, 3).map((r, i) => `<div class="panel ${i === 0 ? 'first' : ''}"><div class="medal">${i + 1}ST</div><span class="avatar">${esc(r.name.slice(0, 1))}</span><div><b>${nm(r)}</b><div class="dim" style="font-size:12px">${won(r.total)}</div></div><div class="rt ${cls(r.pct)}">${pct(r.pct)}</div></div>`).join('')}</div>
        <section class="panel"><div class="table-wrap"><table class="t"><thead><tr><th>순위</th><th class="l">회원</th><th>누적 수익률</th><th>총자산</th><th class="hide-m">보유종목</th><th class="hide-m">체결 수</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.id === S.user.id ? 'me' : ''}"><td><b>${i + 1}</b></td><td class="l">${nm(r)}</td><td class="${cls(r.pct)}"><b>${pct(r.pct)}</b></td><td>${won(r.total)}</td><td class="hide-m">${r.n}</td><td class="hide-m">${r.trades}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">참여자가 없습니다</div></td></tr>'}</tbody></table></div></section>`;
    }
    data();
    let t = 0;
    return { data, tick: () => { if (Date.now() - t > 10000) { t = Date.now(); data(); } } };
  }

  // ═════════ 마이페이지 ═════════
  function My(main) {
    main.innerHTML = `${head('마이페이지', '계정 정보와 서비스 설정을 관리합니다.')}<div class="grid g-2 stack" id="my"></div>`;
    function data() {
      const u = S.user;
      $('#my').innerHTML = `
        <section class="panel"><div class="panel-h"><h3>계정 정보</h3></div><div class="panel-b">
          <div style="display:flex;gap:14px;align-items:center;margin-bottom:18px"><span class="avatar" style="width:52px;height:52px;font-size:20px">${esc(u.name.slice(0, 1))}</span><div><b style="font-size:17px">${esc(u.name)}</b><div class="dim">${esc(u.username)} · ${{ user: '수강생', instructor: '강사', admin: '관리자' }[u.role]} · 가입 ${U.date(u.createdAt)}</div></div></div>
          <form id="pfF"><div class="field"><label>이름</label><input class="input" name="name" value="${esc(u.name)}" maxlength="20"></div><div class="field"><label>휴대폰</label><input class="input" name="phone" value="${esc(u.phone || '')}"></div><div class="field"><label>이메일</label><input class="input" name="email" value="${esc(u.email || '')}" type="email"></div><button class="btn btn-brand">저장</button></form>
        </div></section>
        <section class="panel"><div class="panel-h"><h3>비밀번호 변경</h3></div><div class="panel-b">
          <form id="pwF"><div class="field"><label>현재 비밀번호</label><input class="input" type="password" name="o" autocomplete="current-password"></div><div class="field"><label>새 비밀번호 (6자 이상)</label><input class="input" type="password" name="n" autocomplete="new-password"></div><div class="field"><label>새 비밀번호 확인</label><input class="input" type="password" name="n2" autocomplete="new-password"></div><button class="btn">변경</button></form>
        </div></section>
        <section class="panel"><div class="panel-h"><h3>화면 설정</h3></div><div class="panel-b">
          <div class="setting-row"><div><b>다크 모드</b><small>트레이딩 화면 기본 테마</small></div><label class="switch" style="justify-self:end"><input type="checkbox" id="thSw" ${theme.get() === 'dark' ? 'checked' : ''}><span></span></label></div>
          <div class="setting-row"><div><b>시세 상태</b><small>${statusLine()}</small></div><span></span></div>
        </div></section>
        <section class="panel"><div class="panel-h"><h3>거래 조건 · 계좌</h3></div><div class="panel-b">
          <dl class="kv"><dt>국내 수수료</dt><dd>${S.st.feeKr}%</dd><dt>국내 매도 세금</dt><dd>${S.st.taxKr}%</dd><dt>미국 수수료</dt><dd>${S.st.feeUs}%</dd><dt>적용 환율</dt><dd>${U.n2(Market.fx())}원</dd><dt>장외시간 체결</dt><dd>${S.st.enforceHours ? '불가 (실제 장시간만)' : '교육용 허용'}</dd></dl>
          <div class="divider"></div>
          <p class="muted" style="font-size:13px;margin-bottom:10px">계좌를 초기화하면 보유종목·주문·거래내역이 모두 삭제되고 예수금이 ${won(S.st.initialCash)}으로 재지급됩니다.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-danger" id="rstBtn">계좌 초기화</button><button class="btn" id="outBtn">로그아웃</button>${u.role !== 'user' ? '<a class="btn" href="admin.html">관리자 페이지</a>' : ''}</div>
        </div></section>`;
      $('#pfF').onsubmit = async (e) => { e.preventDefault(); try { await Store.updateProfile(Object.fromEntries(new FormData(e.target))); U.toast('저장되었습니다.'); } catch (er) { U.toast(er.message, true); } };
      $('#pwF').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (f.n !== f.n2) return U.toast('새 비밀번호가 일치하지 않습니다.', true); try { await Store.changePassword(f.o, f.n); e.target.reset(); U.toast('비밀번호가 변경되었습니다.'); } catch (er) { U.toast(er.message, true); } };
      $('#thSw').onchange = (e) => { theme.set(e.target.checked ? 'dark' : 'light'); const tb = $('#themeBtn'); if (tb) tb.innerHTML = theme.get() === 'dark' ? ICON.sun : ICON.moon; };
      $('#rstBtn').onclick = async () => { if (await U.confirmBox('계좌 초기화', '<p>정말 초기화할까요? 되돌릴 수 없습니다.</p>', '초기화', 'btn-danger')) { await Store.resetAccount(); U.toast('계좌가 초기화되었습니다.'); } };
      $('#outBtn').onclick = async () => { await Store.logout(); location.hash = ''; location.reload(); };
    }
    data();
    return { data };
  }
  // 모바일 전체 메뉴
  function Menu(main) {
    main.innerHTML = `${head('전체 메뉴')}<section class="panel"><nav class="nav" style="padding:8px">${NAV.map(([r, l, i]) => `<a href="#/${r}">${i}<span>${l}</span></a>`).join('')}${S.user.role !== 'user' ? `<a href="admin.html">${ICON.shield}<span>관리자</span></a>` : ''}</nav></section>
      <section class="panel panel-b" style="margin-top:12px;font-size:12px" class="muted">${statusLine()}</section>`;
    return {};
  }

  boot().catch((e) => { console.error(e); root.innerHTML = `<div class="empty" style="padding:80px 20px">앱을 시작하지 못했습니다: ${esc(e.message)}<br><button class="btn" style="margin-top:16px" onclick="location.reload()">다시 시도</button></div>`; });
})();
