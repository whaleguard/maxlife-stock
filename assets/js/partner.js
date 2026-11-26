// MAX라이프 주식 — 파트너(지사) 포털: 대시보드 · 회원 · 통계 · 수수료 · 정산 · 하부 파트너 · 문의
(() => {
  const { $, $$, esc, won, n0, ICON } = U;
  const root = document.getElementById('app'); const C = window.MLS_CONFIG;
  let token = localStorage.getItem('mls.ptoken') || ''; let ME = null;
  async function call(action, body) {
    const r = await fetch(C.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/mls_api', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: C.SUPABASE_KEY, ...(C.SUPABASE_KEY.startsWith('eyJ') ? { Authorization: 'Bearer ' + C.SUPABASE_KEY } : {}) }, body: JSON.stringify({ p_action: action, p_body: body || {}, p_token: token || null }) });
    let j; try { j = await r.json(); } catch { throw new Error('서버 응답 오류 (' + r.status + ')'); }
    if (!r.ok) throw new Error((j && (j.message || j.error)) || '서버 응답 오류');
    if (!j.ok) { if (/파트너 로그인/.test(j.error || '') && action !== 'p_login') { token = ''; localStorage.removeItem('mls.ptoken'); setTimeout(login, 50); } throw new Error(j.error || '요청 실패'); }
    return j.data;
  }
  const head = (t, sub, right = '') => `<div class="page-head"><div><h1>${t}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;
  const stat = (k, v, s = '') => `<div class="panel panel-b stat"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s muted">${s}</div>` : ''}</div>`;
  const tbl = (h, rows, empty = '내역이 없습니다') => (rows.length ? `<div class="table-wrap"><table class="t"><thead><tr>${h.map((x) => `<th class="${Array.isArray(x) ? x[1] || '' : ''}">${Array.isArray(x) ? x[0] : x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="empty">${empty}</div>`);
  const signupLink = () => location.origin + location.pathname.replace(/partner\.html.*$/, '') + 'index.html?ref=' + ME.code;

  function login() {
    root.innerHTML = `<div class="auth-form" style="min-height:100vh"><div class="auth-card"><div style="margin-bottom:28px">${U.logo()}</div><h1>파트너 포털</h1><p class="sub">지사·파트너 계정으로 로그인하세요. 계정은 본사 관리자가 발급합니다.</p>
      <form id="lf"><div class="field"><label>파트너 아이디</label><input class="input" name="u" autocomplete="username" required></div><div class="field"><label>비밀번호</label><input class="input" type="password" name="p" autocomplete="current-password" required></div><button class="btn btn-brand btn-block btn-lg">로그인</button></form>
      <div class="auth-switch"><a class="brand" href="index.html">MAX라이프 주식 바로가기</a></div></div></div>`;
    $('#lf').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const b = e.target.querySelector('button'); b.disabled = true; try { const r = await call('p_login', { username: f.u, pw: f.p }); token = r.token; localStorage.setItem('mls.ptoken', token); boot(); } catch (er) { U.toast(er.message, true); b.disabled = false; } };
  }
  const NAV = [['dash', '대시보드', ICON.chart], ['users', '내 회원', ICON.users], ['trades', '거래 내역', ICON.chart], ['cash', '입출금 내역', ICON.bank], ['stats', '통계', ICON.list], ['comm', '수수료 내역', ICON.coin], ['wd', '정산 신청', ICON.bank], ['subs', '하부 파트너', ICON.users], ['inq', '본사 문의', ICON.doc], ['acct', '내 계정', ICON.gear]];
  function shell() {
    root.innerHTML = `<div class="app admin"><header class="topbar"><a href="#/dash">${U.logo()}</a><span class="badge-mode">PARTNER</span><div style="flex:1"></div><div class="top-actions"><span class="dim hide-m" style="font-size:13px">${esc(ME.name)} · ${ME.level}단계</span><button class="icon-btn" id="th" title="다크·화이트 전환">${ICON.moon}</button><button class="btn btn-sm" id="out">로그아웃</button></div></header>
      <aside class="sidebar"><nav class="nav"><div class="cap">PARTNER PORTAL</div>${NAV.map(([r, l, i]) => `<a href="#/${r}" data-r="${r}">${i}<span>${l}</span></a>`).join('')}</nav><div class="side-foot">추천 코드 <b class="brand">${esc(ME.code)}</b></div></aside>
      <main class="main" id="main"></main>
      <nav class="tabbar" style="grid-template-columns:repeat(5,1fr)">${NAV.slice(0, 5).map(([r, l, i]) => `<a href="#/${r}" data-r="${r}">${i}${l}</a>`).join('')}</nav></div>`;
    $('#th').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('mls.theme', t); document.documentElement.dataset.theme = t; route(); };
    $('#out').onclick = async () => { try { await call('p_logout'); } catch {} token = ''; localStorage.removeItem('mls.ptoken'); login(); };
  }
  async function boot() {
    if (!token) return login();
    let d; try { d = await call('p_me'); } catch { return login(); }
    ME = d.partner; shell(); window.onhashchange = route; route(); if (window.MLSGuard) MLSGuard.mark(`파트너 ${ME.name} · ${ME.username}`);
  }
  function route() {
    const r = (location.hash.replace(/^#\/?/, '') || 'dash').split('/')[0];
    $$('.nav a, .tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.r === r));
    const P = { dash: Dash, users: Users, trades: Trades, cash: Cash, stats: Stats, comm: Comm, wd: Wd, subs: Subs, inq: Inq, acct: Acct }[r] || Dash;
    const m = $('#main'); m.innerHTML = '<div class="empty">불러오는 중…</div>'; window.scrollTo(0, 0);
    P(m).catch((e) => { m.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
  }

  async function Dash(m) {
    const d = await call('p_me'); ME = d.partner; const S = await call('p_stats', { days: 14 });
    m.innerHTML = `${head(`${esc(ME.name)} 대시보드`, `AI 구독 수수료 ${ME.rateSub}% · 충전 수수료 ${ME.rateCharge}%`)}
      <section class="panel" style="margin-bottom:16px"><div class="panel-b" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><div style="flex:1;min-width:220px"><small class="dim">내 회원 가입 링크 (추천 코드 ${esc(ME.code)} 자동 입력)</small><div style="font-weight:700;word-break:break-all">${esc(signupLink())}</div></div><button class="btn btn-brand btn-sm" id="cpL">링크 복사</button><button class="btn btn-sm" id="cpC">코드 복사</button></div></section>
      <div class="grid g-4" style="margin-bottom:16px">${stat('정산 가능 잔액', won(ME.balance), `정산 완료 ${won(ME.withdrawn)}`)}${stat('이번 달 수수료', won(d.commMonth), `누적 ${won(d.commTotal)}`)}${stat('회원 수', n0(d.all) + '명', `직접 ${n0(d.direct)}명 · 7일 활동 ${n0(d.active7)}명`)}${stat('회원 매출', won(d.charge + d.subs), `충전 ${won(d.charge)} · AI 구독 ${won(d.subs)}`)}</div>
      <div class="grid g-2"><section class="panel"><div class="panel-h"><h3>최근 14일 수수료</h3></div><div class="panel-b"><canvas id="pc1" style="width:100%;height:200px"></canvas></div></section>
      <section class="panel"><div class="panel-h"><h3>최근 가입 회원</h3><a class="dim" href="#/users" style="font-size:12px">전체</a></div>${tbl([['닉네임', 'l'], '가입일', '최근 접속', '충전'], d.top.slice(0, 8).map((u) => `<tr><td class="l">${esc(u.name)} <small class="dim">${esc(u.username)}</small></td><td class="dim">${U.date(u.joined)}</td><td class="dim">${u.lastSeen ? U.ago(u.lastSeen) : '-'}</td><td>${won(u.charge)}</td></tr>`), '아직 가입한 회원이 없습니다')}</section></div>`;
    const asc = S.slice().reverse();
    setTimeout(() => Chart.bars($('#pc1'), { labels: asc.map((r) => r.d.slice(5).replace('-', '.')), series: [{ values: asc.map((r) => r.comm), color: Chart.css('--brand') }] }), 30);
    $('#cpL').onclick = () => navigator.clipboard.writeText(signupLink()).then(() => U.toast('가입 링크를 복사했습니다.'));
    $('#cpC').onclick = () => navigator.clipboard.writeText(ME.code).then(() => U.toast('추천 코드를 복사했습니다.'));
  }
  async function Users(m) {
    const L = await call('p_users'); let q = '';
    m.innerHTML = `${head('내 회원', `하부 파트너 회원 포함 ${n0(L.length)}명 · 아이디 일부는 가려서 표시합니다.`)}<section class="panel"><div class="panel-h"><div class="search" style="flex:1;max-width:280px">${ICON.search}<input id="uq" placeholder="닉네임·파트너 검색" style="width:100%"></div></div><div id="ul"></div></section>`;
    const d = () => { const R = L.filter((u) => !q || [u.name, u.partner].join(' ').toLowerCase().includes(q)); $('#ul').innerHTML = tbl([['닉네임', 'l'], ['소속', 'l'], '가입일', '최근 접속', '체결', '충전', 'AI 구독', '상태'], R.map((u) => `<tr><td class="l">${esc(u.name)} <small class="dim">${esc(u.username)}</small></td><td class="l">${esc(u.partner)}${u.direct ? ' <span class="tag tag-brand">직접</span>' : ''}</td><td class="dim">${U.date(u.joined)}</td><td class="dim">${u.lastSeen ? U.ago(u.lastSeen) : '-'}</td><td>${n0(u.fills)}</td><td>${won(u.charge)}</td><td>${u.ai ? esc(u.ai) : '-'}</td><td><span class="tag ${u.status === 'active' ? 'tag-ok' : 'tag-sell'}">${u.status === 'active' ? '정상' : '정지'}</span></td></tr>`), '회원이 없습니다'); };
    $('#uq').oninput = (e) => { q = e.target.value.trim().toLowerCase(); d(); }; d();
  }
  async function Trades(m) {
    const L = await call('p_fills'); let f = 'all', q = '';
    const A = { open: '진입', close: '청산', tp: '익절', sl: '손절', liq: '강제 청산' };
    m.innerHTML = `${head('거래 내역', '소속 회원의 주식·코인 선물 체결 (최근 500건)')}<section class="panel"><div class="panel-h" style="gap:8px;flex-wrap:wrap"><div class="seg" id="tf"><button data-v="all" class="on">전체</button><button data-v="stock">주식</button><button data-v="coin">코인 선물</button></div><div class="search" style="flex:1;max-width:260px">${ICON.search}<input id="tq" placeholder="회원·종목 검색" style="width:100%"></div></div><div id="tl"></div></section>`;
    const d = () => { const R = L.filter((x) => (f === 'all' || x.kind === f) && (!q || [x.name, x.item].join(' ').toLowerCase().includes(q)));
      $('#tl').innerHTML = `<div class="panel-b" style="padding-bottom:0;font-size:13px">${n0(R.length)}건 · 거래대금 <b>${R.filter((x) => x.kind === 'stock').length ? won(R.filter((x) => x.kind === 'stock').reduce((s, x) => s + x.amount, 0)) : '-'}</b></div>` + tbl(['일시', ['회원', 'l'], ['종목', 'l'], '구분', '수량', '체결가', '금액', '실현손익'], R.map((x) => { const coin = x.kind === 'coin'; const sd = coin ? (x.side === 'long' ? '롱' : '숏') + ' ' + (A[x.action] || '') : x.side === 'buy' ? '매수' : '매도'; const up = coin ? x.side === 'long' : x.side === 'buy';
        return `<tr><td class="dim">${U.dt(x.at)}</td><td class="l">${esc(x.name)}</td><td class="l">${esc(x.item)}${coin ? ' <span class="tag tag-no">선물</span>' : ''}</td><td><span class="tag ${up ? 'tag-buy' : 'tag-sell'}">${sd}</span></td><td>${coin ? (+x.qty.toPrecision(5)) : n0(x.qty)}</td><td>${coin ? x.price.toLocaleString('en-US') : n0(x.price)}</td><td>${coin ? x.amount.toFixed(2) + ' USDT' : won(x.amount)}</td><td class="${x.pnl > 0 ? 'up' : x.pnl < 0 ? 'down' : ''}">${(!coin && x.side === 'buy') || (coin && x.action === 'open') ? '-' : coin ? x.pnl.toFixed(2) + ' USDT' : won(x.pnl)}</td></tr>`; }), '체결 내역이 없습니다'); };
    $('#tf').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; f = b.dataset.v; $$('#tf button').forEach((x) => x.classList.toggle('on', x === b)); d(); };
    $('#tq').oninput = (e) => { q = e.target.value.trim().toLowerCase(); d(); }; d();
  }
  async function Cash(m) {
    const L = await call('p_cash'); let f = 'all';
    const PAY = { cash: '계좌이체', card: '카드', moa: 'MOA 토큰', usdt: 'USDT', usdc: 'USDC', usd1: 'USD1', maxp: 'MAX 포인트' }; const ST = { pending: ['대기', 'tag-wait'], approved: ['완료', 'tag-ok'], rejected: ['반려', 'tag-sell'], cancelled: ['취소', 'tag-no'] };
    m.innerHTML = `${head('입출금 내역', '소속 회원의 충전·출금 신청 (최근 500건)')}<div class="grid g-3" style="margin-bottom:16px" id="ck"></div><section class="panel"><div class="panel-h"><div class="seg" id="cf"><button data-v="all" class="on">전체</button><button data-v="deposit">입금</button><button data-v="withdraw">출금</button></div></div><div id="cl"></div></section>`;
    const ok = (t) => L.filter((c) => c.type === t && c.status === 'approved').reduce((s, c) => s + c.amount, 0);
    $('#ck').innerHTML = stat('입금 완료', won(ok('deposit'))) + stat('출금 완료', won(ok('withdraw'))) + stat('처리 대기', n0(L.filter((c) => c.status === 'pending').length) + '건');
    const d = () => { const R = L.filter((c) => f === 'all' || c.type === f); $('#cl').innerHTML = tbl(['신청일시', ['회원', 'l'], '구분', '금액', '수단', '상태', '처리일시'], R.map((c) => `<tr><td class="dim">${U.dt(c.at)}</td><td class="l">${esc(c.name)}</td><td><span class="tag ${c.type === 'deposit' ? 'tag-buy' : 'tag-sell'}">${c.type === 'deposit' ? '입금' : '출금'}</span></td><td><b>${won(c.amount)}</b></td><td>${PAY[c.method] || c.method || '-'}</td><td><span class="tag ${(ST[c.status] || ST.pending)[1]}">${(ST[c.status] || ST.pending)[0]}</span></td><td class="dim">${c.processedAt ? U.dt(c.processedAt) : '-'}</td></tr>`), '입출금 내역이 없습니다'); };
    $('#cf').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; f = b.dataset.v; $$('#cf button').forEach((x) => x.classList.toggle('on', x === b)); d(); }; d();
  }
  async function Stats(m) {
    const [L, X] = await Promise.all([call('p_stats', { days: 30 }), call('p_summary')]); const asc = L.slice().reverse();
    const tot = X.active + X.inactive; const pc = (v) => (tot ? ((v / tot) * 100).toFixed(1) : '0.0') + '%';
    const mxP = Math.max(1, ...X.popular.map((p) => p.n)); const mxC = Math.max(1, ...X.popularCoin.map((p) => p.n));
    const bar = (nm, sub, n, mx) => `<div class="pv-r"><span>${nm}${sub ? ` <small class="dim">${sub}</small>` : ''}</span><div><i style="width:${(n / mx) * 100}%"></i></div><b>${n0(n)}건</b></div>`;
    m.innerHTML = `${head('통계', '하부 파트너 회원 포함')}
      <div class="grid g-4" style="margin-bottom:16px">${stat('30일 가입', n0(L.reduce((s, r) => s + r.signups, 0)) + '명')}${stat('30일 충전', won(L.reduce((s, r) => s + r.charge, 0)))}${stat('30일 수수료', won(L.reduce((s, r) => s + r.comm, 0)))}${stat('전체 회원', n0(tot) + '명', `활성 ${n0(X.active)} · 비활성 ${n0(X.inactive)}`)}</div>
      <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>최근 30일 가입 · 접속</h3><span class="dim" style="font-size:12px"><span class="brand">■</span> 가입 <span style="color:var(--down)">■</span> 접속</span></div><div class="panel-b"><canvas id="ps1" style="width:100%;height:220px"></canvas></div></section>
      <div class="grid g-3" style="margin-bottom:16px">
        <section class="panel"><div class="panel-h"><h3>회원 분포</h3><span class="dim" style="font-size:12px">최근 7일 접속 기준</span></div><div class="panel-b"><div class="dist"><canvas id="psD" width="140" height="140"></canvas><div><div class="dist-r"><i style="background:var(--ok)"></i>활성<b>${n0(X.active)}</b><small>${pc(X.active)}</small></div><div class="dist-r"><i style="background:var(--text-3)"></i>비활성<b>${n0(X.inactive)}</b><small>${pc(X.inactive)}</small></div></div></div></div></section>
        <section class="panel"><div class="panel-h"><h3>인기 거래 종목</h3><span class="dim" style="font-size:12px">최근 30일 체결</span></div><div class="panel-b">${X.popular.map((p) => bar(esc(p.name), p.code, p.n, mxP)).join('') || '<div class="empty">거래 내역이 없습니다</div>'}</div></section>
        <section class="panel"><div class="panel-h"><h3>인기 코인 선물</h3><span class="dim" style="font-size:12px">최근 30일 체결</span></div><div class="panel-b">${X.popularCoin.map((p) => bar(p.sym + 'USDT', '', p.n, mxC)).join('') || '<div class="empty">거래 내역이 없습니다</div>'}</div></section>
      </div>
      <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>월별 요약</h3><span class="dim" style="font-size:12px">최근 6개월</span></div>${tbl(['월', '가입', '거래 회원', '체결', '거래대금', '충전', '내 수수료'], X.monthly.map((r) => `<tr><td>${r.m}</td><td>${n0(r.signups)}</td><td>${n0(r.traders)}</td><td>${n0(r.fills)}</td><td>${won(r.volume)}</td><td>${won(r.charge)}</td><td class="brand">${won(r.comm)}</td></tr>`))}</section>
      <section class="panel"><div class="panel-h"><h3>일별 상세</h3></div>${tbl(['일자', '가입', '접속 회원', '충전', '내 수수료'], L.map((r) => `<tr><td>${r.d}</td><td>${n0(r.signups)}</td><td>${n0(r.active)}</td><td>${won(r.charge)}</td><td class="brand">${won(r.comm)}</td></tr>`))}</section>`;
    setTimeout(() => {
      Chart.bars($('#ps1'), { labels: asc.map((r) => r.d.slice(5).replace('-', '.')), series: [{ values: asc.map((r) => r.signups), color: Chart.css('--brand') }, { values: asc.map((r) => r.active), color: Chart.css('--down') }] });
      const cv = $('#psD'); const x = cv.getContext('2d'); const dpr = devicePixelRatio || 1; cv.width = 140 * dpr; cv.height = 140 * dpr; cv.style.width = cv.style.height = '140px'; x.scale(dpr, dpr);
      const seg = (a0, a1, c) => { x.beginPath(); x.arc(70, 70, 56, a0, a1); x.strokeStyle = c; x.lineWidth = 16; x.stroke(); };
      const st = -Math.PI / 2; if (!tot) seg(0, Math.PI * 2, Chart.css('--surface-2')); else { const a = (X.active / tot) * Math.PI * 2; seg(st, st + a, Chart.css('--ok')); seg(st + a, st + Math.PI * 2, Chart.css('--text-3')); }
      x.fillStyle = Chart.css('--text'); x.font = "800 20px 'Pretendard Variable', sans-serif"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(n0(tot), 70, 66); x.fillStyle = Chart.css('--text-3'); x.font = "500 11px 'Pretendard Variable', sans-serif"; x.fillText('전체 회원', 70, 88);
    }, 30);
  }
  async function Comm(m) {
    const L = await call('p_comm'); const K = { sub: 'AI 구독', charge: '충전' };
    m.innerHTML = `${head('수수료 내역', `최근 500건 · 합계 ${won(L.reduce((s, c) => s + c.amount, 0))}`)}<section class="panel">${tbl(['일시', ['회원', 'l'], '구분', '기준 금액', '비율', '수수료'], L.map((c) => `<tr><td class="dim">${U.dt(c.at)}</td><td class="l">${esc(c.user || '-')}</td><td>${K[c.kind] || c.kind}</td><td>${won(c.base)}</td><td>${c.rate}%</td><td class="brand">${won(c.amount)}</td></tr>`), '적립된 수수료가 없습니다')}</section>`;
  }
  async function Wd(m) {
    const [d, L] = await Promise.all([call('p_me'), call('p_wds')]); ME = d.partner;
    const pend = L.filter((w) => w.status === 'pending').reduce((s, w) => s + w.amount, 0); const avail = Math.max(0, ME.balance - pend);
    m.innerHTML = `${head('정산 신청', '적립된 수수료를 정산 신청하면 본사가 확인 후 송금합니다.')}
      <div class="grid g-main" style="margin-bottom:16px"><section class="panel"><div class="panel-b"><div class="grid g-3" style="margin-bottom:14px">${stat('적립 잔액', won(ME.balance))}${stat('처리 대기', won(pend))}${stat('신청 가능', won(avail))}</div>
        <div class="field"><label>신청 금액 (최소 10,000원)</label><input class="input" id="wa" inputmode="numeric" placeholder="${n0(avail)}"></div><div class="field"><label>정산 받을 계좌 (은행 · 계좌번호 · 예금주)</label><input class="input" id="wb" placeholder="예: 국민은행 · 예금주 홍길동"></div><div class="field"><label>메모</label><input class="input" id="wm"></div><button class="btn btn-brand btn-block btn-lg" id="wgo">정산 신청</button></div></section>
      <section class="panel"><div class="panel-h"><h3>안내</h3></div><div class="panel-b muted" style="font-size:13px;line-height:1.8">· 수수료는 회원의 충전 승인·AI 구독 승인 시 자동 적립됩니다.<br>· 정산은 본사 확인 후 영업일 기준으로 송금됩니다.<br>· 반려되면 사유가 아래 내역에 표시되고 금액은 다시 신청할 수 있습니다.</div></section></div>
      <section class="panel"><div class="panel-h"><h3>신청 내역</h3></div>${tbl(['신청일', '금액', ['계좌', 'l'], '상태', ['본사 메모', 'l'], '처리일'], L.map((w) => `<tr><td class="dim">${U.dt(w.at)}</td><td><b>${won(w.amount)}</b></td><td class="l">${esc(w.bank || '')}</td><td><span class="tag ${w.status === 'pending' ? 'tag-wait' : w.status === 'approved' ? 'tag-ok' : 'tag-sell'}">${({ pending: '대기', approved: '지급 완료', rejected: '반려' })[w.status]}</span></td><td class="l muted">${esc(w.adminMemo || '')}</td><td class="dim">${w.processedAt ? U.dt(w.processedAt) : '-'}</td></tr>`), '신청 내역이 없습니다')}</section>`;
    $('#wa').oninput = (e) => { const v = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0; e.target.value = v ? n0(v) : ''; };
    $('#wgo').onclick = async () => { const a = parseInt($('#wa').value.replace(/[^0-9]/g, ''), 10) || 0; try { await call('p_wdReq', { amount: a, bank: $('#wb').value, memo: $('#wm').value }); U.toast('정산을 신청했습니다.'); route(); } catch (e) { U.toast(e.message, true); } };
  }
  async function Subs(m) {
    const L = await call('p_subs');
    m.innerHTML = `${head('하부 파트너', `내 비율(구독 ${ME.rateSub}% · 충전 ${ME.rateCharge}%) 이하로 하부 파트너를 만들 수 있습니다. 하부 실적에서는 비율 차이만큼 내 수수료가 적립됩니다.`, '<button class="btn btn-sm btn-brand" id="sNew">하부 파트너 만들기</button>')}
      <section class="panel">${tbl([['파트너', 'l'], '추천 코드', '아이디', '구독 %', '충전 %', '회원', '하부', '상태', '등록일'], L.map((p) => `<tr><td class="l"><span style="padding-left:${(p.level - ME.level - 1) * 16}px">${p.level - ME.level > 1 ? '└ ' : ''}${esc(p.name)}</span></td><td><code>${esc(p.code)}</code></td><td>${esc(p.username)}</td><td>${p.rateSub}%</td><td>${p.rateCharge}%</td><td>${n0(p.users)}</td><td>${n0(p.subs)}</td><td><span class="tag ${p.status === 'active' ? 'tag-ok' : 'tag-sell'}">${p.status === 'active' ? '정상' : '정지'}</span></td><td class="dim">${U.date(p.createdAt)}</td></tr>`), '하부 파트너가 없습니다')}</section>`;
    $('#sNew').onclick = () => U.modal({ title: '하부 파트너 만들기', body: `<div class="grid g-2"><div class="field"><label>이름</label><input class="input" id="nN" placeholder="예: 해운대점"></div><div class="field"><label>추천 코드 (영문·숫자)</label><input class="input" id="nC" style="text-transform:uppercase"></div><div class="field"><label>아이디</label><input class="input" id="nU" autocomplete="off"></div><div class="field"><label>비밀번호 (6자 이상)</label><input class="input" type="password" id="nP" autocomplete="new-password"></div><div class="field"><label>AI 구독 % (최대 ${ME.rateSub})</label><input class="input" id="nS" value="${Math.floor(ME.rateSub / 2)}"></div><div class="field"><label>충전 % (최대 ${ME.rateCharge})</label><input class="input" id="nR" value="${Math.floor(ME.rateCharge / 2)}"></div></div>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="nOk">만들기</button>', onMount: (md, close) => { $('#nOk', md).onclick = async () => { try { await call('p_createSub', { name: $('#nN', md).value, code: $('#nC', md).value, username: $('#nU', md).value, pw: $('#nP', md).value, rateSub: +$('#nS', md).value, rateCharge: +$('#nR', md).value }); close(); U.toast('하부 파트너를 만들었습니다.'); route(); } catch (e) { U.toast(e.message, true); } }; } });
  }
  async function Inq(m) {
    const L = await call('p_inqs');
    m.innerHTML = `${head('본사 문의', '정산·회원·운영 관련 문의를 남기면 본사가 답변합니다.')}<div class="grid g-main"><section class="panel"><div class="panel-b"><div class="field"><label>제목</label><input class="input" id="qT" maxlength="100"></div><div class="field"><label>내용</label><textarea class="input" id="qB" rows="6" maxlength="3000"></textarea></div><button class="btn btn-brand btn-block" id="qGo">문의 등록</button></div></section>
      <section class="panel"><div class="panel-h"><h3>내 문의</h3></div>${L.length ? L.map((q) => `<div class="inq"><div class="inq-h"><b>${esc(q.title)}</b><span class="tag ${q.status === 'open' ? 'tag-wait' : 'tag-ok'}">${q.status === 'open' ? '답변 대기' : '답변 완료'}</span><span class="dim" style="margin-left:auto;font-size:12px">${U.dt(q.at)}</span></div><p class="muted" style="white-space:pre-wrap">${esc(q.body || '')}</p>${q.answer ? `<div class="inq-a"><b>본사 답변</b><p style="white-space:pre-wrap">${esc(q.answer)}</p></div>` : ''}</div>`).join('') : '<div class="empty">문의 내역이 없습니다</div>'}</section></div>`;
    $('#qGo').onclick = async () => { try { await call('p_ask', { title: $('#qT').value, body: $('#qB').value }); U.toast('문의를 등록했습니다.'); route(); } catch (e) { U.toast(e.message, true); } };
  }
  async function Acct(m) {
    m.innerHTML = `${head('내 계정')}<div class="grid g-2"><section class="panel"><div class="panel-b"><dl class="kv"><dt>파트너 이름</dt><dd>${esc(ME.name)}</dd><dt>아이디</dt><dd>${esc(ME.username)}</dd><dt>추천 코드</dt><dd class="brand">${esc(ME.code)}</dd><dt>단계</dt><dd>${ME.level}단계</dd><dt>AI 구독 수수료</dt><dd>${ME.rateSub}%</dd><dt>충전 수수료</dt><dd>${ME.rateCharge}%</dd><dt>등록일</dt><dd>${U.date(ME.createdAt)}</dd></dl></div></section>
      <section class="panel"><div class="panel-h"><h3>비밀번호 변경</h3></div><div class="panel-b"><div class="field"><label>현재 비밀번호</label><input class="input" type="password" id="o1" autocomplete="current-password"></div><div class="field"><label>새 비밀번호 (6자 이상)</label><input class="input" type="password" id="o2" autocomplete="new-password"></div><button class="btn btn-brand" id="oGo">변경</button></div></section></div>`;
    $('#oGo').onclick = async () => { try { await call('p_password', { oldPw: $('#o1').value, newPw: $('#o2').value }); U.toast('비밀번호를 변경했습니다.'); $('#o1').value = $('#o2').value = ''; } catch (e) { U.toast(e.message, true); } };
  }
  boot();
})();
