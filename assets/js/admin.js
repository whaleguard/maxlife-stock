// MAX라이프 주식 — 관리자 / 강사 콘솔
(() => {
  const { $, $$, esc, won, n0, px, pct, signedWon, cls, compact, ICON } = U;
  const A = { me: null, st: null, bundles: [], users: [], flows: [], posts: [], notices: [], stats: null, page: null };
  const root = document.getElementById('app');
  document.documentElement.dataset.theme = localStorage.getItem('mls.theme') || 'dark';

  async function boot() {
    await Market.init({});
    await Store.init();
    A.st = await Store.settings();
    Market.setOverrides(A.st.overrides);
    A.me = await Store.current();
    if (!A.me) return login();
    if (A.me.role === 'user') { root.innerHTML = `<div class="empty" style="padding:100px 20px">관리자/강사 권한이 필요합니다.<br><a class="btn" style="margin-top:16px" href="index.html">사용자 화면으로</a></div>`; return; }
    await reload();
    shell();
    window.addEventListener('hashchange', route); route();
    Store.on('change', async () => { await reload(); A.page && A.page.data && A.page.data(); });
    let t = 0; Market.on('update', async () => { if (Date.now() - t < 3000) return; t = Date.now(); if (Store.mode === 'local') { const f = await Store.matchAll(); if (f.length) await reload(); } A.page && A.page.tick && A.page.tick(); });
  }
  async function reload() {
    A.st = await Store.settings();
    [A.posts, A.notices] = await Promise.all([Store.posts(), Store.notices()]);
    if (A.me.role === 'admin') { [A.users, A.bundles, A.flows, A.stats] = await Promise.all([Store.users(), Store.allBundles(), Store.cashflows(), Store.stats()]); }
  }
  function login() {
    root.innerHTML = `<div class="auth-form" style="min-height:100vh"><div class="auth-card"><div style="margin-bottom:28px">${U.logo()}</div><h1>관리자 로그인</h1><p class="sub">관리자·강사 계정으로 로그인하세요.</p>
      <form id="lf"><div class="field"><label>아이디</label><input class="input" name="u" required></div><div class="field"><label>비밀번호</label><input class="input" type="password" name="p" required></div><button class="btn btn-brand btn-block btn-lg">로그인</button></form>
      ${Store.mode === 'local' ? '<div class="demo-box">데모: <code>admin</code> / <code>admin1234</code> · 강사 <code>teacher</code> / <code>teacher1234</code></div>' : ''}
      <div class="auth-switch"><a class="brand" href="index.html">사용자 화면으로</a></div></div></div>`;
    $('#lf').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await Store.login(f.u, f.p); location.reload(); } catch (er) { U.toast(er.message, true); } };
  }
  const val = (b) => Engine.valuate(b, A.st);
  const ROLE = { user: '수강생', instructor: '강사', admin: '관리자' };

  const NAV_ADMIN = [['dash', '대시보드', ICON.chart], ['members', '회원관리', ICON.users], ['cash', '입출금 승인', ICON.bank], ['lead', '리딩·공지', ICON.lead], ['stocks', '종목·시세', ICON.list], ['settings', '수수료·설정', ICON.gear]];
  const NAV_INST = [['lead', '리딩·공지', ICON.lead]];
  function shell() {
    const nav = A.me.role === 'admin' ? NAV_ADMIN : NAV_INST;
    root.innerHTML = `<div class="app admin">
      <header class="topbar"><a href="#/${nav[0][0]}">${U.logo()}</a><span class="badge-mode">${A.me.role === 'admin' ? 'ADMIN' : '강사'}</span><div class="ticker" id="tk"></div>
        <div class="top-actions"><a class="btn btn-sm hide-m" href="index.html">사용자 화면</a><button class="icon-btn" id="th">${ICON.sun}</button><button class="user-chip" id="out" title="로그아웃"><span class="avatar">${esc(A.me.name.slice(0, 1))}</span><span class="nm">${esc(A.me.name)}</span></button></div></header>
      <aside class="sidebar"><nav class="nav"><div class="cap">${A.me.role === 'admin' ? 'ADMIN CONSOLE' : 'INSTRUCTOR'}</div>${nav.map(([r, l, i]) => `<a href="#/${r}" data-r="${r}">${i}<span>${l}</span>${r === 'cash' ? '<span class="tag tag-wait" id="pendBadge" style="margin-left:auto"></span>' : ''}</a>`).join('')}<div class="sep"></div><a href="index.html">${ICON.home}<span>사용자 화면</span></a></nav><div class="side-foot" id="sf"></div></aside>
      <main class="main" id="main"></main>
      <nav class="tabbar" style="grid-template-columns:repeat(${Math.min(5, nav.length + 1)},1fr)">${nav.slice(0, 4).map(([r, l, i]) => `<a href="#/${r}" data-r="${r}">${i}${l.split('·')[0]}</a>`).join('')}<a href="index.html">${ICON.home}사용자</a></nav>
    </div>`;
    $('#th').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('mls.theme', t); document.documentElement.dataset.theme = t; A.page && A.page.data && A.page.data(); };
    $('#out').onclick = async () => { if (await U.confirmBox('로그아웃', '로그아웃할까요?', '로그아웃')) { await Store.logout(); location.reload(); } };
    side();
  }
  function side() {
    const ix = Market.state.indices; const tk = $('#tk');
    if (tk) tk.innerHTML = ['KOSPI', 'KOSDAQ', 'NASDAQ', 'SPX'].filter((k) => ix[k]).map((k) => `<span class="ix"><b>${k === 'SPX' ? 'S&P500' : k}</b><span class="v ${cls(ix[k].change)}">${U.n2(ix[k].price)}</span><span class="${cls(ix[k].change)}">${pct(ix[k].changePct)}</span></span>`).join('');
    const s = Market.state; const sf = $('#sf');
    if (sf) sf.innerHTML = s.status === 'LIVE' ? `<span class="brand">●</span> 시세 연동<br>${U.dt(s.updatedAt)}` : `<span style="color:var(--warn)">●</span> 시세 불러오는 중`;
    const pb = $('#pendBadge'); if (pb) { const n = A.flows.filter((f) => f.status === 'pending').length; pb.textContent = n || ''; pb.style.display = n ? '' : 'none'; }
  }
  function route() {
    const r = location.hash.replace(/^#\/?/, '') || (A.me.role === 'admin' ? 'dash' : 'lead');
    const pages = A.me.role === 'admin' ? { dash: Dash, members: Members, cash: CashAdm, lead: LeadAdm, stocks: Stocks, settings: Settings } : { lead: LeadAdm };
    const P = pages[r] || Object.values(pages)[0];
    $$('.nav a, .tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.r === r));
    A.page && A.page.destroy && A.page.destroy();
    $('#main').innerHTML = ''; A.page = P($('#main')) || {}; side();
  }
  const head = (t, sub, right = '') => `<div class="page-head"><div><h1>${t}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;
  const stat = (k, v, s = '', c = '') => `<div class="panel panel-b stat"><div class="k">${k}</div><div class="v ${c}">${v}</div>${s ? `<div class="s muted">${s}</div>` : ''}</div>`;
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${U.two(d.getMonth() + 1)}-${U.two(d.getDate())}`; };

  // ═════ 대시보드 ═════
  function Dash(main) {
    main.innerHTML = `${head('대시보드', '전체 회원의 가상투자 현황을 실시간으로 집계합니다.', `<span class="dim" style="font-size:12px" id="dT"></span>`)}
      <div class="grid g-4" style="margin-bottom:16px" id="dS1"></div>
      <div class="grid g-4" style="margin-bottom:16px" id="dS2"></div>
      <div class="grid g-main" style="margin-bottom:16px">
        <section class="panel"><div class="panel-h"><h3>일별 매매 추이 (최근 14일)</h3><span class="dim" style="font-size:12px"><span class="up">■</span> 매수 <span class="down">■</span> 매도</span></div><div class="panel-b"><div class="bar-chart"><canvas id="dBar"></canvas></div></div></section>
        <section class="panel"><div class="panel-h"><h3>승인 대기</h3><a class="dim" href="#/cash" style="font-size:12px">전체</a></div><div class="panel-b flush" id="dPend"></div></section>
      </div>
      <div class="grid g-2 stack">
        <section class="panel"><div class="panel-h"><h3>회원 보유 상위 종목</h3></div><div class="panel-b flush" id="dTop"></div></section>
        <section class="panel"><div class="panel-h"><h3>최근 체결</h3></div><div class="panel-b flush" id="dFills"></div></section>
      </div>`;
    function data() {
      const members = A.users.filter((u) => u.role === 'user');
      const today = U.today();
      const mids = new Set(members.map((u) => u.id)); const todayLogin = new Set(A.stats.logins.filter((l) => dayKey(l.at) === today && mids.has(l.userId)).map((l) => l.userId)).size;
      const vals = A.bundles.filter((b) => b.user.role === 'user').map((b) => ({ b, v: val(b) }));
      const totalAsset = vals.reduce((s, x) => s + x.v.total, 0);
      const fills = A.bundles.flatMap((b) => b.fills);
      const tf = fills.filter((f) => dayKey(f.at) === today);
      const tb = tf.filter((f) => f.side === 'buy').reduce((s, f) => s + f.amount, 0), ts = tf.filter((f) => f.side === 'sell').reduce((s, f) => s + f.amount, 0);
      const allAmt = fills.reduce((s, f) => s + f.amount, 0);
      const avgRet = vals.length ? vals.reduce((s, x) => s + x.v.totalPct, 0) / vals.length : 0;
      const pend = A.flows.filter((f) => f.status === 'pending');
      const newToday = members.filter((u) => dayKey(u.createdAt) === today).length;
      $('#dS1').innerHTML = stat('전체 회원', n0(members.length) + '명', `오늘 신규 ${newToday}명 · 정지 ${members.filter((u) => u.status === 'suspended').length}명`) + stat('오늘 접속', n0(todayLogin) + '명', `활성률 ${members.length ? ((todayLogin / members.length) * 100).toFixed(0) : 0}%`) + stat('총 가상자산', compact(totalAsset) + '원', won(totalAsset)) + stat('평균 수익률', pct(avgRet), `수익 회원 ${vals.filter((x) => x.v.totalPct > 0).length}명 / 손실 ${vals.filter((x) => x.v.totalPct < 0).length}명`, cls(avgRet));
      $('#dS2').innerHTML = stat('오늘 매수 거래대금', compact(tb) + '원', `${tf.filter((f) => f.side === 'buy').length}건`, 'up') + stat('오늘 매도 거래대금', compact(ts) + '원', `${tf.filter((f) => f.side === 'sell').length}건`, 'down') + stat('누적 거래대금', compact(allAmt) + '원', `총 ${n0(fills.length)}건 체결`) + stat('입출금 승인 대기', pend.length + '건', pend.length ? `입금 ${pend.filter((f) => f.type === 'deposit').length} · 출금 ${pend.filter((f) => f.type === 'withdraw').length}` : '처리할 신청 없음', pend.length ? 'brand' : '');
      // 14일 추이
      const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(dayKey(d)); }
      const by = (side) => days.map((d) => fills.filter((f) => f.side === side && dayKey(f.at) === d).reduce((s, f) => s + f.amount, 0));
      Chart.bars($('#dBar'), { labels: days.map((d) => d.slice(5).replace('-', '.')), series: [{ values: by('buy'), color: Chart.css('--up') }, { values: by('sell'), color: Chart.css('--down') }] });
      $('#dPend').innerHTML = pend.length ? pend.slice(0, 6).map((c) => `<div class="slist"><div class="row" style="cursor:default"><div class="sname"><b>${esc(c.name || '')} <span class="dim" style="font-weight:500">${esc(c.username || '')}</span></b><small>${U.ago(c.at)} · ${c.type === 'deposit' ? '입금' : '출금'}</small></div><div class="p" style="display:flex;gap:6px;align-items:center"><b class="${c.type === 'deposit' ? 'up' : 'down'}" style="margin-right:6px">${won(c.amount)}</b><button class="btn btn-sm btn-brand" data-ap="${c.id}">승인</button><button class="btn btn-sm" data-rj="${c.id}">반려</button></div></div></div>`).join('') : '<div class="empty">승인 대기 중인 신청이 없습니다</div>';
      bindApprove(main);
      // 보유 상위
      const agg = {}; for (const { v } of vals) for (const h of v.holdings) { const a = (agg[h.code] = agg[h.code] || { name: h.name, code: h.code, ev: 0, n: 0, pnl: 0, cost: 0 }); a.ev += h.evalKrw; a.n++; a.pnl += h.pnl; a.cost += h.costKrw; }
      const top = Object.values(agg).sort((a, b) => b.ev - a.ev).slice(0, 8);
      $('#dTop').innerHTML = top.length ? `<table class="t"><thead><tr><th>종목</th><th>보유 회원</th><th>평가금액</th><th>평균 손익률</th></tr></thead><tbody>${top.map((a) => `<tr><td><div class="sname"><b>${esc(a.name)}</b><small>${a.code}</small></div></td><td>${a.n}명</td><td>${compact(a.ev)}원</td><td class="${cls(a.pnl)}">${pct(a.cost ? (a.pnl / a.cost) * 100 : 0)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">보유 종목이 없습니다</div>';
      const uname = (id) => (A.users.find((u) => u.id === id) || {}).name || '-';
      const rf = fills.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
      $('#dFills').innerHTML = rf.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>시각</th><th class="l">회원</th><th class="l">종목</th><th>구분</th><th>금액</th></tr></thead><tbody>${rf.map((f) => `<tr><td class="dim">${U.dt(f.at)}</td><td class="l">${esc(uname(f.userId))}</td><td class="l">${esc(f.name)}</td><td><span class="tag ${f.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${f.side === 'buy' ? '매수' : '매도'}</span></td><td>${won(f.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">체결 내역이 없습니다</div>';
      $('#dT').textContent = ('시세 ') + U.time(Date.now()) + ' 기준';
    }
    data();
    let t = 0;
    return { data, tick: () => { if (Date.now() - t > 5000) { t = Date.now(); data(); } } };
  }
  function bindApprove(el) {
    $$('[data-ap]', el).forEach((b) => (b.onclick = async () => { try { await Store.processCash(b.dataset.ap, true); U.toast('승인되었습니다.'); } catch (e) { U.toast(e.message, true); } }));
    $$('[data-rj]', el).forEach((b) => (b.onclick = () => {
      U.modal({ title: '신청 반려', body: '<div class="field"><label>반려 사유 (회원에게 표시)</label><input class="input" id="rjm" placeholder="예: 1회 한도 초과"></div>', foot: '<button class="btn" data-x>취소</button><button class="btn btn-danger" id="rjOk">반려</button>', onMount: (m, close) => { $('#rjOk', m).onclick = async () => { try { await Store.processCash(b.dataset.rj, false, $('#rjm', m).value); close(); U.toast('반려되었습니다.'); } catch (e) { U.toast(e.message, true); } }; } });
    }));
  }

  // ═════ 회원관리 ═════
  function Members(main) {
    const F = { q: '', status: 'all', role: 'all', sort: 'join' };
    main.innerHTML = `${head('회원관리', '회원별 보유종목, 매입·매출, 수익률, 입출금 내역을 조회하고 계정을 관리합니다.')}
      <section class="panel"><div class="panel-b"><div class="filters">
        <div class="search" style="flex:1;min-width:200px">${ICON.search}<input id="mq" placeholder="이름·아이디·연락처 검색" style="width:100%"></div>
        <select class="input" id="ms"><option value="all">전체 상태</option><option value="active">정상</option><option value="suspended">정지</option></select>
        <select class="input" id="mr"><option value="all">전체 권한</option><option value="user">수강생</option><option value="instructor">강사</option><option value="admin">관리자</option></select>
        <select class="input" id="mo"><option value="join">가입순</option><option value="ret">수익률순</option><option value="asset">자산순</option><option value="trade">거래순</option><option value="login">최근접속순</option></select>
        <button class="btn btn-sm" id="mcsv">CSV 내보내기</button>
      </div></div><div class="panel-b flush" id="mList"></div></section>`;
    $('#mq').oninput = (e) => { F.q = e.target.value.trim().toLowerCase(); data(); };
    $('#ms').onchange = (e) => { F.status = e.target.value; data(); };
    $('#mr').onchange = (e) => { F.role = e.target.value; data(); };
    $('#mo').onchange = (e) => { F.sort = e.target.value; data(); };
    let rows = [];
    function data() {
      rows = A.bundles.filter((b) => b.user.role !== 'admin' || F.role === 'admin').map((b) => ({ b, u: b.user, v: val(b) }));
      if (F.role === 'admin') rows.push(...A.users.filter((u) => u.role === 'admin').map((u) => ({ b: null, u, v: null })));
      rows = rows.filter(({ u }) => (F.status === 'all' || u.status === F.status) && (F.role === 'all' || u.role === F.role) && (!F.q || [u.name, u.username, u.phone, u.email].join(' ').toLowerCase().includes(F.q)));
      const s = { join: (a, b) => b.u.createdAt.localeCompare(a.u.createdAt), ret: (a, b) => (b.v ? b.v.totalPct : -1e9) - (a.v ? a.v.totalPct : -1e9), asset: (a, b) => (b.v ? b.v.total : 0) - (a.v ? a.v.total : 0), trade: (a, b) => (b.b ? b.b.fills.length : 0) - (a.b ? a.b.fills.length : 0), login: (a, b) => String(b.u.lastLogin || '').localeCompare(String(a.u.lastLogin || '')) };
      rows.sort(s[F.sort]);
      $('#mList').innerHTML = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>회원</th><th>권한</th><th>상태</th><th>총자산</th><th>수익률</th><th class="hide-m">예수금</th><th class="hide-m">보유</th><th class="hide-m">체결</th><th class="hide-m">가입일</th><th class="hide-m">최근접속</th></tr></thead><tbody>${rows.map(({ u, v, b }) => `<tr class="click" data-u="${u.id}"><td><div class="sname"><b>${esc(u.name)}</b><small>${esc(u.username)}${u.phone ? ' · ' + esc(u.phone) : ''}</small></div></td><td>${ROLE[u.role]}</td><td><span class="tag ${u.status === 'active' ? 'tag-ok' : 'tag-sell'}">${u.status === 'active' ? '정상' : '정지'}</span></td><td>${v ? won(v.total) : '-'}</td><td class="${v ? cls(v.totalPct) : ''}"><b>${v ? pct(v.totalPct) : '-'}</b></td><td class="hide-m">${v ? won(v.cash) : '-'}</td><td class="hide-m">${v ? v.holdings.length : '-'}</td><td class="hide-m">${b ? b.fills.length : '-'}</td><td class="hide-m dim">${U.date(u.createdAt)}</td><td class="hide-m dim">${u.lastLogin ? U.ago(u.lastLogin) : '-'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">조건에 맞는 회원이 없습니다</div>';
      $$('[data-u]', main).forEach((r) => (r.onclick = () => memberDetail(r.dataset.u)));
    }
    $('#mcsv').onclick = () => {
      const lines = [['이름', '아이디', '권한', '상태', '연락처', '총자산', '수익률(%)', '예수금', '보유종목수', '체결수', '가입일', '최근접속'].join(',')];
      for (const { u, v, b } of rows) lines.push([u.name, u.username, ROLE[u.role], u.status, u.phone || '', v ? Math.round(v.total) : '', v ? v.totalPct.toFixed(2) : '', v ? Math.round(v.cash) : '', v ? v.holdings.length : '', b ? b.fills.length : '', U.date(u.createdAt), u.lastLogin ? U.dt(u.lastLogin) : ''].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })); a.download = `회원목록_${U.today()}.csv`; a.click();
    };
    data();
    let t = 0;
    return { data, tick: () => { if (Date.now() - t > 8000) { t = Date.now(); data(); } } };
  }
  async function memberDetail(uid) {
    const b = await Store.userBundle(uid); const u = b.user; const v = val(b);
    let tab = 'hold';
    U.modal({
      title: `${u.name} (${u.username})`, size: 'lg', body: `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px"><span class="tag ${u.status === 'active' ? 'tag-ok' : 'tag-sell'}">${u.status === 'active' ? '정상' : '정지'}</span><span class="tag tag-no">${ROLE[u.role]}</span><span class="dim" style="font-size:12px">가입 ${U.dt(u.createdAt)} · 최근접속 ${u.lastLogin ? U.dt(u.lastLogin) : '-'}${u.phone ? ' · ' + esc(u.phone) : ''}</span></div>
        <div class="grid g-4" style="gap:10px;margin-bottom:16px">
          ${stat('총자산', won(v.total), `원금 ${won(v.principal)}`)}${stat('누적 수익률', pct(v.totalPct), signedWon(v.totalPnl), cls(v.totalPct))}${stat('평가손익', signedWon(v.pnl), `평가금액 ${won(v.evalKrw)}`, cls(v.pnl))}${stat('예수금', won(v.cash), `실현손익 ${signedWon(v.realized)}`)}
        </div>
        <div style="height:160px;margin-bottom:12px"><canvas id="mdLine" style="width:100%;height:100%"></canvas></div>
        <div class="tabs" id="mdTab" style="padding:0"><button data-v="hold" class="on">보유종목 ${v.holdings.length}</button><button data-v="fills">매입·매출 ${b.fills.length}</button><button data-v="orders">주문 ${b.orders.length}</button><button data-v="cash">입출금 ${b.cashflows.length}</button></div>
        <div id="mdBody" style="margin:0 -20px"></div>`,
      foot: `<button class="btn" id="mdCash">예수금 조정</button>${u.role !== 'admin' ? `<button class="btn" id="mdRole">권한: ${ROLE[u.role]}</button>` : ''}<button class="btn ${u.status === 'active' ? 'btn-danger' : 'btn-brand'}" id="mdStat">${u.status === 'active' ? '계정 정지' : '정지 해제'}</button>`,
      onMount: (m, close) => {
        const snaps = (b.snapshots || []).map((s) => [s[0], s[1]]); if (!snaps.length || snaps[snaps.length - 1][0] !== U.today()) snaps.push([U.today(), v.total]);
        setTimeout(() => Chart.line($('#mdLine', m), { points: snaps, color: v.totalPnl >= 0 ? Chart.css('--up') : Chart.css('--down'), labels: true, base: v.principal }), 30);
        const body = () => {
          const el = $('#mdBody', m);
          if (tab === 'hold') el.innerHTML = v.holdings.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>수량</th><th>평균단가</th><th>현재가</th><th>평가금액</th><th>손익</th><th>수익률</th></tr></thead><tbody>${v.holdings.map((h) => `<tr><td><div class="sname"><b>${esc(h.name)}</b><small>${h.code}</small></div></td><td>${n0(h.qty)}</td><td>${px(h.avg, h.currency)}</td><td>${px(h.price, h.currency)}</td><td>${won(h.evalKrw)}</td><td class="${cls(h.pnl)}">${signedWon(h.pnl)}</td><td class="${cls(h.pnl)}">${pct(h.pnlPct)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">보유종목 없음</div>';
          else if (tab === 'fills') { const fs = b.fills.slice().sort((x, y) => y.at.localeCompare(x.at)); const buy = fs.filter((f) => f.side === 'buy').reduce((s, f) => s + f.amount, 0), sell = fs.filter((f) => f.side === 'sell').reduce((s, f) => s + f.amount, 0);
            el.innerHTML = `<div style="padding:12px 20px;font-size:13px" class="muted">매입 합계 <b class="up">${won(buy)}</b> · 매출 합계 <b class="down">${won(sell)}</b> · 실현손익 <b class="${cls(v.realized)}">${signedWon(v.realized)}</b></div>` + (fs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>체결일시</th><th class="l">종목</th><th>구분</th><th>체결가</th><th>수량</th><th>금액</th><th>수수료+세금</th><th>실현손익</th></tr></thead><tbody>${fs.map((f) => `<tr><td class="dim">${U.dt(f.at)}</td><td class="l">${esc(f.name)}</td><td><span class="tag ${f.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${f.side === 'buy' ? '매입' : '매출'}</span></td><td>${px(f.price, f.currency)}</td><td>${n0(f.qty)}</td><td>${won(f.amount)}</td><td>${won(f.fee + f.tax)}</td><td class="${cls(f.pnl)}">${f.side === 'sell' ? signedWon(f.pnl) : '-'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">체결 내역 없음</div>'); }
          else if (tab === 'orders') { const os = b.orders.slice().sort((x, y) => y.createdAt.localeCompare(x.createdAt)); const st = { pending: '미체결', filled: '체결', cancelled: '취소', rejected: '거부' };
            el.innerHTML = os.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>주문일시</th><th class="l">종목</th><th>구분</th><th>유형</th><th>주문가</th><th>수량</th><th>상태</th></tr></thead><tbody>${os.map((o) => `<tr><td class="dim">${U.dt(o.createdAt)}</td><td class="l">${esc(o.name)}</td><td><span class="tag ${o.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${o.side === 'buy' ? '매수' : '매도'}</span></td><td>${o.type === 'market' ? '시장가' : '지정가'}</td><td>${o.type === 'market' ? '-' : px(o.price, o.currency)}</td><td>${n0(o.qty)}</td><td>${st[o.status] || o.status}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">주문 내역 없음</div>'; }
          else { const cs = b.cashflows.slice().sort((x, y) => y.at.localeCompare(x.at)); const st = { pending: ['대기', 'tag-wait'], approved: ['승인', 'tag-ok'], rejected: ['반려', 'tag-sell'], cancelled: ['취소', 'tag-no'] };
            el.innerHTML = cs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th>구분</th><th>금액</th><th class="l">메모</th><th>상태</th><th>처리자</th></tr></thead><tbody>${cs.map((c) => `<tr><td class="dim">${U.dt(c.at)}</td><td><span class="tag ${c.type === 'deposit' ? 'tag-buy' : 'tag-sell'}">${c.type === 'deposit' ? '입금' : '출금'}</span></td><td>${won(c.amount)}</td><td class="l muted">${esc(c.memo || '')}</td><td><span class="tag ${st[c.status][1]}">${st[c.status][0]}</span></td><td class="dim">${esc(c.processedBy || '-')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">입출금 내역 없음</div>'; }
        };
        $('#mdTab', m).onclick = (e) => { const bt = e.target.closest('button'); if (!bt) return; tab = bt.dataset.v; $$('#mdTab button', m).forEach((x) => x.classList.toggle('on', x === bt)); body(); };
        body();
        $('#mdStat', m).onclick = async () => { const to = u.status === 'active' ? 'suspended' : 'active'; if (await U.confirmBox(to === 'suspended' ? '계정 정지' : '정지 해제', `<p>${esc(u.name)} 회원을 ${to === 'suspended' ? '정지' : '정지 해제'}할까요?${to === 'suspended' ? '<br><span class="muted" style="font-size:13px">정지된 회원은 로그인 및 주문이 불가합니다.</span>' : ''}</p>`, '확인', to === 'suspended' ? 'btn-danger' : 'btn-brand')) { await Store.setUserStatus(uid, to); close(); U.toast('처리되었습니다.'); } };
        $('#mdCash', m).onclick = () => U.modal({ title: '예수금 조정', body: `<p class="muted" style="margin-bottom:12px">현재 예수금 ${won(v.cash)} · 양수는 지급, 음수는 차감</p><div class="field"><label>조정 금액</label><input class="input" id="adjA" inputmode="numeric" placeholder="예: 5000000 또는 -1000000"></div><div class="field"><label>사유</label><input class="input" id="adjM" placeholder="예: 우수 수강생 추가 지급"></div>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="adjOk">적용</button>', onMount: (m2, c2) => { $('#adjOk', m2).onclick = async () => { try { await Store.adjustCash(uid, parseInt($('#adjA', m2).value.replace(/[^0-9-]/g, ''), 10), $('#adjM', m2).value); c2(); close(); U.toast('예수금이 조정되었습니다.'); } catch (e) { U.toast(e.message, true); } }; } });
        const rb = $('#mdRole', m); if (rb) rb.onclick = () => U.modal({ title: '권한 변경', body: `<select class="input" id="rl"><option value="user" ${u.role === 'user' ? 'selected' : ''}>수강생</option><option value="instructor" ${u.role === 'instructor' ? 'selected' : ''}>강사 (리딩 작성 가능)</option><option value="admin">관리자</option></select>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="rlOk">변경</button>', onMount: (m2, c2) => { $('#rlOk', m2).onclick = async () => { try { await Store.setUserRole(uid, $('#rl', m2).value); c2(); close(); U.toast('권한이 변경되었습니다.'); } catch (e) { U.toast(e.message, true); } }; } });
      },
    });
  }

  // ═════ 입출금 승인 ═════
  function CashAdm(main) {
    let f = 'pending', ty = 'all';
    main.innerHTML = `${head('입출금 승인 관리', '회원의 가상 예수금 입금·출금 신청을 승인 또는 반려합니다. 실제 송금은 없습니다.')}
      <div class="grid g-4" style="margin-bottom:16px" id="caS"></div>
      <section class="panel"><div class="tabs" id="caT"><button data-v="pending" class="on">승인 대기</button><button data-v="approved">승인</button><button data-v="rejected">반려</button><button data-v="all">전체</button></div>
      <div class="panel-b" style="padding-bottom:0"><div class="seg" id="caTy"><button data-v="all" class="on">전체</button><button data-v="deposit">입금</button><button data-v="withdraw">출금</button></div>${''}</div>
      <div class="panel-b flush" style="margin-top:12px" id="caL"></div></section>`;
    $('#caT').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; f = b.dataset.v; $$('#caT button').forEach((x) => x.classList.toggle('on', x === b)); data(); };
    $('#caTy').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; ty = b.dataset.v; $$('#caTy button').forEach((x) => x.classList.toggle('on', x === b)); data(); };
    function data() {
      const all = A.flows; const p = all.filter((c) => c.status === 'pending'); const today = U.today();
      const ap = all.filter((c) => c.status === 'approved' && c.processedAt && dayKey(c.processedAt) === today);
      $('#caS').innerHTML = stat('승인 대기', p.length + '건', won(p.reduce((s, c) => s + c.amount, 0)), p.length ? 'brand' : '') + stat('오늘 입금 승인', won(ap.filter((c) => c.type === 'deposit').reduce((s, c) => s + c.amount, 0)), ap.filter((c) => c.type === 'deposit').length + '건', 'up') + stat('오늘 출금 승인', won(ap.filter((c) => c.type === 'withdraw').reduce((s, c) => s + c.amount, 0)), ap.filter((c) => c.type === 'withdraw').length + '건', 'down') + stat('자동 승인', A.st.autoApprove ? '사용 중' : '미사용', '<a class="brand" href="#/settings">설정 변경</a>');
      const st = { pending: ['대기', 'tag-wait'], approved: ['승인', 'tag-ok'], rejected: ['반려', 'tag-sell'], cancelled: ['회원취소', 'tag-no'] };
      const rows = all.filter((c) => (f === 'all' || c.status === f) && (ty === 'all' || c.type === ty));
      $('#caL').innerHTML = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th class="l">회원</th><th>구분</th><th>금액</th><th class="hide-m">현재 예수금</th><th class="l hide-m">메모</th><th>상태</th><th></th></tr></thead><tbody>${rows.map((c) => { const bd = A.bundles.find((b) => b.user.id === c.userId); return `<tr><td class="dim">${U.dt(c.at)}</td><td class="l"><div class="sname"><b>${esc(c.name || '')}</b><small>${esc(c.username || '')}</small></div></td><td><span class="tag ${c.type === 'deposit' ? 'tag-buy' : 'tag-sell'}">${c.type === 'deposit' ? '입금' : '출금'}</span></td><td><b>${won(c.amount)}</b></td><td class="hide-m">${bd ? won(bd.user.cash) : '-'}</td><td class="l hide-m muted">${esc(c.memo || '')}${c.adminMemo ? ` · <span class="dim">${esc(c.adminMemo)}</span>` : ''}</td><td><span class="tag ${st[c.status][1]}">${st[c.status][0]}</span>${c.processedBy ? `<div class="dim" style="font-size:11px">${esc(c.processedBy)} · ${U.dt(c.processedAt)}</div>` : ''}</td><td>${c.status === 'pending' ? `<button class="btn btn-sm btn-brand" data-ap="${c.id}">승인</button> <button class="btn btn-sm" data-rj="${c.id}">반려</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">해당 신청이 없습니다</div>';
      bindApprove(main);
    }
    data();
    return { data };
  }

  // ═════ 리딩·공지 ═════
  function LeadAdm(main) {
    main.innerHTML = `${head('리딩·공지 관리', '리딩룸 교육 콘텐츠와 공지를 작성·수정·삭제합니다.', '<div style="display:flex;gap:8px"><button class="btn" id="nN">공지 작성</button><button class="btn btn-brand" id="pN">리딩 작성</button></div>')}
      <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>리딩 게시물</h3></div><div class="panel-b flush" id="lpL"></div></section>
      <section class="panel"><div class="panel-h"><h3>공지</h3></div><div class="panel-b flush" id="lnL"></div></section>`;
    $('#pN').onclick = () => Editors.postEditor(); $('#nN').onclick = () => Editors.noticeEditor();
    function data() {
      const rt = { open: ['진행중', 'tag-wait'], target: ['목표 도달', 'tag-ok'], stop: ['손절', 'tag-sell'], closed: ['종료', 'tag-no'] };
      $('#lpL').innerHTML = A.posts.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>작성일</th><th class="l">제목</th><th>유형</th><th class="l">종목</th><th>결과</th><th>댓글</th><th>반응</th><th></th></tr></thead><tbody>${A.posts.map((p) => { const q = p.code && Market.quote(p.code); return `<tr><td class="dim">${U.dt(p.at)}</td><td class="l" style="white-space:normal;min-width:240px"><b>${esc(p.title)}</b><div class="dim" style="font-size:11px">${esc(p.authorName || '')}</div></td><td>${p.kind === 'trade' ? (p.side === 'sell' ? '매도 시연' : '매수 시연') : '강의'}</td><td class="l">${q ? esc(q.name) : '-'}</td><td>${p.kind === 'trade' ? `<span class="tag ${(rt[p.result] || rt.open)[1]}">${(rt[p.result] || rt.open)[0]}</span>${p.resultPct ? ` <span class="${cls(p.resultPct)}">${pct(p.resultPct)}</span>` : ''}` : '-'}</td><td>${p.comments.length}</td><td>${p.likes.length}</td><td><button class="btn btn-sm" data-e="${p.id}">수정</button> <button class="btn btn-sm btn-danger" data-d="${p.id}">삭제</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">게시물이 없습니다</div>';
      $('#lnL').innerHTML = A.notices.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>등록일</th><th class="l">제목</th><th>고정</th><th></th></tr></thead><tbody>${A.notices.map((n) => `<tr><td class="dim">${U.dt(n.at)}</td><td class="l" style="white-space:normal"><b>${esc(n.title)}</b><div class="muted" style="font-size:12px">${esc(n.body || '')}</div></td><td>${n.pinned ? '<span class="tag tag-brand">고정</span>' : '-'}</td><td><button class="btn btn-sm" data-ne="${n.id}">수정</button> <button class="btn btn-sm btn-danger" data-nd="${n.id}">삭제</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">공지가 없습니다</div>';
      $$('[data-e]', main).forEach((b) => (b.onclick = () => Editors.postEditor(A.posts.find((p) => p.id === b.dataset.e))));
      $$('[data-d]', main).forEach((b) => (b.onclick = async () => { if (await U.confirmBox('삭제', '게시물을 삭제할까요?', '삭제', 'btn-danger')) Store.deletePost(b.dataset.d); }));
      $$('[data-ne]', main).forEach((b) => (b.onclick = () => Editors.noticeEditor(A.notices.find((n) => n.id === b.dataset.ne))));
      $$('[data-nd]', main).forEach((b) => (b.onclick = async () => { if (await U.confirmBox('삭제', '공지를 삭제할까요?', '삭제', 'btn-danger')) Store.deleteNotice(b.dataset.nd); }));
    }
    data();
    return { data };
  }

  // ═════ 종목·시세 ═════
  function Stocks(main) {
    main.innerHTML = `${head('종목·시세 설정', '거래 가능 종목과 시세 연동 상태를 관리합니다.')}
      <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>시세 연동 상태</h3></div><div class="panel-b" id="stS"></div></section>
      <section class="panel"><div class="panel-h"><h3>거래 종목</h3><div class="seg" id="stF"><button data-v="all" class="on">전체</button><button data-v="KRW">국내</button><button data-v="USD">미국</button></div></div><div class="panel-b flush" id="stL"></div></section>`;
    let fl = 'all';
    $('#stF').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; fl = b.dataset.v; $$('#stF button').forEach((x) => x.classList.toggle('on', x === b)); data(); };
    let kw = '', limit = 100;
    function data() {
      const s = Market.state; const ov = A.st.overrides || { hidden: [], base: {} };
      const all = Market.allMeta(); const nKr = all.filter((m) => !Market.isUS(m)).length;
      $('#stS').innerHTML = `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="tag ${s.status === 'LIVE' ? 'tag-ok' : 'tag-wait'}">${s.status === 'LIVE' ? '시세 연동 중' : '시세 연결 중'}</span><span>${s.updatedAt ? U.dt(s.updatedAt) + ' 기준' : ''} · 국내 ${U.n0(nKr)}종목 · 미국 ${U.n0(all.length - nKr)}종목 · 적용 환율 ${U.n2(s.fx)}원</span></div><p class="muted" style="margin-top:10px;font-size:13px">코스피·코스닥 전 종목(ETF 포함)과 나스닥·뉴욕·아멕스 상장 종목 시세가 장중 5분마다 자동 갱신됩니다.</p>`;
      const k = kw.toLowerCase();
      const list = all.filter((m) => (fl === 'all' || (fl === 'USD') === Market.isUS(m)) && (!k || m.name.toLowerCase().includes(k) || m.code.toLowerCase().includes(k)));
      $('#stL').innerHTML = `<div style="padding:12px 16px;display:flex;gap:8px;align-items:center"><input class="input" id="stQ" placeholder="종목명·코드 검색" value="${esc(kw)}" style="max-width:280px"><span class="dim" style="font-size:12px">${U.n0(list.length)}종목 중 시가총액 상위 ${Math.min(limit, list.length)}개 표시</span></div><div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>시장</th><th>현재가</th><th>등락률</th><th>거래 노출</th></tr></thead><tbody>${list.slice(0, limit).map((m) => { const q = Market.quote(m.code) || {}; const hid = ov.hidden.includes(m.code); return `<tr><td><div class="sname"><b>${esc(m.name)}</b><small>${m.code}${m.sector ? ' · ' + esc(m.sector) : ''}</small></div></td><td>${m.market}</td><td class="${cls(q.change)}">${q.price ? px(q.price, q.currency) : '-'}</td><td class="${cls(q.change)}">${q.price ? pct(q.changePct) : '-'}</td><td><label class="switch" style="display:inline-block"><input type="checkbox" data-vis="${m.code}" ${hid ? '' : 'checked'}><span></span></label></td></tr>`; }).join('')}</tbody></table></div>${list.length > limit ? '<div style="padding:12px;text-align:center"><button class="btn" id="stMore">더 보기</button></div>' : ''}`;
      const qi = $('#stQ'); qi.oninput = () => { kw = qi.value; limit = 100; clearTimeout(qi._t); qi._t = setTimeout(() => { data(); const n = $('#stQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
      const mb = $('#stMore'); if (mb) mb.onclick = () => { limit += 200; data(); };
      $$('[data-vis]', main).forEach((c) => (c.onchange = async () => { const o = { hidden: [...(ov.hidden || [])], base: { ...(ov.base || {}) } }; o.hidden = c.checked ? o.hidden.filter((x) => x !== c.dataset.vis) : [...o.hidden, c.dataset.vis]; await Store.saveSettings({ overrides: o }); Market.setOverrides(o); U.toast(c.checked ? '노출되었습니다.' : '거래 목록에서 숨겼습니다.'); }));
    }
    data();
    return { data };
  }

  // ═════ 수수료·설정 ═════
  function Settings(main) {
    main.innerHTML = `${head('수수료·세금 및 운영 설정', '모든 회원의 가상 거래에 즉시 적용됩니다.')}<div class="grid g-2 stack" id="sg"></div>`;
    function data() {
      const s = A.st;
      $('#sg').innerHTML = `
        <section class="panel"><div class="panel-h"><h3>수수료 · 세금</h3></div><div class="panel-b">
          <div class="setting-row"><div><b>국내주식 수수료 (%)</b><small>매수·매도 각각 적용 · 실제 증권사 평균 0.015%</small></div><input class="input" data-k="feeKr" value="${s.feeKr}" inputmode="decimal" style="text-align:right"></div>
          <div class="setting-row"><div><b>국내주식 매도 세금 (%)</b><small>증권거래세+농특세 · 매도 시에만</small></div><input class="input" data-k="taxKr" value="${s.taxKr}" inputmode="decimal" style="text-align:right"></div>
          <div class="setting-row"><div><b>미국주식 수수료 (%)</b><small>매수·매도 각각 적용 · 실제 평균 0.25%</small></div><input class="input" data-k="feeUs" value="${s.feeUs}" inputmode="decimal" style="text-align:right"></div>
        </div></section>
        <section class="panel"><div class="panel-h"><h3>계좌 · 입출금</h3></div><div class="panel-b">
          <div class="setting-row"><div><b>신규 가입 지급액 (원)</b><small>가입 시·계좌 초기화 시 지급되는 가상 예수금</small></div><input class="input" data-k="initialCash" value="${s.initialCash}" inputmode="numeric" style="text-align:right"></div>
          <div class="setting-row"><div><b>1회 최대 입금 신청 (원)</b><small>회원 입금 신청 한도</small></div><input class="input" data-k="maxDeposit" value="${s.maxDeposit}" inputmode="numeric" style="text-align:right"></div>
          <div class="setting-row"><div><b>입출금 자동 승인</b><small>켜면 관리자 승인 없이 즉시 반영</small></div><label class="switch" style="justify-self:end"><input type="checkbox" data-b="autoApprove" ${s.autoApprove ? 'checked' : ''}><span></span></label></div>
        </div></section>
        <section class="panel"><div class="panel-h"><h3>거래 운영</h3></div><div class="panel-b">
          <div class="setting-row"><div><b>실제 장 운영시간만 체결</b><small>끄면 장외시간에도 마지막 시세로 교육용 체결 허용 (국내 09:00~15:30 / 미국 22:30~06:00 KST)</small></div><label class="switch" style="justify-self:end"><input type="checkbox" data-b="enforceHours" ${s.enforceHours ? 'checked' : ''}><span></span></label></div>
          <div class="setting-row"><div><b>신규 회원가입 허용</b><small>끄면 관리자가 만든 계정만 사용</small></div><label class="switch" style="justify-self:end"><input type="checkbox" data-b="allowSignup" ${s.allowSignup ? 'checked' : ''}><span></span></label></div>
        </div></section>
        <section class="panel"><div class="panel-h"><h3>데이터</h3></div><div class="panel-b">
          <p class="muted" style="font-size:13px;margin-bottom:12px">현재 모드: <b style="color:var(--text)">${Store.mode === 'local' ? '데모 모드 (브라우저 저장)' : '운영 모드 (서버 DB)'}</b>${Store.mode === 'local' ? '<br>여러 기기에서 회원 데이터를 공유하려면 server/ 폴더를 PHP 서버에 올리고 config.js 의 API_BASE 를 설정하세요.' : ''}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="exp">전체 데이터 백업 (JSON)</button>${Store.mode === 'local' ? '<button class="btn btn-danger" id="rst">데모 데이터 초기화</button>' : ''}</div>
          ${A.stats && A.stats.audit && A.stats.audit.length ? `<div class="divider"></div><b style="font-size:13px">최근 관리자 작업</b><div style="max-height:180px;overflow:auto;margin-top:8px;font-size:12px" class="muted">${A.stats.audit.slice().reverse().slice(0, 30).map((a) => `<div>${U.dt(a.at)} · ${esc(a.by)} · ${esc(a.action)} ${esc(a.detail || '').slice(0, 80)}</div>`).join('')}</div>` : ''}
        </div></section>`;
      $$('[data-k]', main).forEach((i) => (i.onchange = async () => { const v = parseFloat(i.value.replace(/,/g, '')); if (!(v >= 0)) return U.toast('값을 확인하세요.', true); await Store.saveSettings({ [i.dataset.k]: v }); U.toast('저장되었습니다.'); }));
      $$('[data-b]', main).forEach((c) => (c.onchange = async () => { await Store.saveSettings({ [c.dataset.b]: c.checked }); U.toast('저장되었습니다.'); }));
      $('#exp').onclick = async () => { const j = await Store.exportDB(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([typeof j === 'string' ? j : JSON.stringify(j)], { type: 'application/json' })); a.download = `maxlife-backup-${U.today()}.json`; a.click(); };
      const r = $('#rst'); if (r) r.onclick = async () => { if (await U.confirmBox('데모 초기화', '<p>모든 회원·거래 데이터를 지우고 데모 데이터로 다시 시작합니다.</p>', '초기화', 'btn-danger')) { await Store.resetDemo(); location.href = 'admin.html'; } };
    }
    data();
    return { data };
  }

  boot().catch((e) => { console.error(e); root.innerHTML = `<div class="empty" style="padding:80px 20px">관리자 화면을 시작하지 못했습니다: ${esc(e.message)}</div>`; });
})();
