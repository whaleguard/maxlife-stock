// MAX라이프 주식 — 관리자 콘솔
(() => {
  const { $, $$, esc, won, n0, px, pct, signedWon, cls, compact, ICON } = U;
  const A = { me: null, st: null, bundles: [], users: [], flows: [], buffs: [], posts: [], notices: [], stats: null, page: null };
  const GRADE = (id) => ((A.st && A.st.grades) || []).find((g) => g.id === (id || 'basic')) || { id: id || 'basic', name: id || '일반', maxMult: 1, rate: 9, maintain: 130 };
  const CARD = { '': '없음', white: '화이트', blue: '블루', red: '레드', black: '블랙' };
  const PAYN = (k) => ({ cash: '계좌이체', card: '카드 결제', moa: 'MOA 토큰', usdt: 'USDT', usdc: 'USDC', usd1: 'USD1', maxp: 'MAX 포인트' })[k || 'cash'] || k;
  const root = document.getElementById('app');
  document.documentElement.dataset.theme = localStorage.getItem('mls.theme') || 'dark';

  async function boot() {
    await Market.init({});
    await Store.init();
    A.st = await Store.settings();
    Market.setOverrides(A.st.overrides); Market.setHolidays(A.st.krHolidays);
    A.me = await Store.current();
    if (!A.me) return login();
    if (A.me.role === 'user') { root.innerHTML = `<div class="empty" style="padding:100px 20px">관리자 권한이 필요합니다.<br><a class="btn" style="margin-top:16px" href="index.html">사용자 화면으로</a></div>`; return; }
    await reload();
    shell(); Poll.start();
    window.addEventListener('hashchange', route); route();
    Store.on('change', async () => { await reload(); A.page && A.page.data && A.page.data(); });
    let t = 0; Market.on('update', async () => { if (Date.now() - t < 3000) return; t = Date.now(); if (Store.mode === 'local') { const f = await Store.matchAll(); if (f.length) await reload(); } A.page && A.page.tick && A.page.tick(); });
  }
  async function reload() {
    A.st = await Store.settings();
    [A.posts, A.notices] = await Promise.all([Store.posts(), Store.notices()]);
    if (A.me.role === 'admin') { [A.users, A.bundles, A.flows, A.stats, A.buffs, A.sum] = await Promise.all([Store.users(), Store.allBundles(), Store.cashflows(), Store.stats(), Store.buffs(), Store.memberSummary().catch(() => ({}))]); }
  }
  function login() {
    root.innerHTML = `<div class="auth-form" style="min-height:100vh"><div class="auth-card"><div style="margin-bottom:28px">${U.logo()}</div><h1>관리자 로그인</h1><p class="sub">관리자 계정으로 로그인하세요.</p>
      <form id="lf"><div class="field"><label>아이디</label><input class="input" name="u" required></div><div class="field"><label>비밀번호</label><input class="input" type="password" name="p" required></div><button class="btn btn-brand btn-block btn-lg">로그인</button></form>
      ${Store.mode === 'local' ? '<div class="demo-box">데모: <code>admin</code> / <code>admin1234</code></div>' : ''}
      <div class="auth-switch"><a class="brand" href="index.html">사용자 화면으로</a></div></div></div>`;
    $('#lf').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); try { await Store.login(f.u, f.p); location.reload(); } catch (er) { U.toast(er.message, true); } };
  }
  const val = (b) => Engine.valuate(b, A.st);
  const ROLE = { user: '이용자', instructor: 'MAX 리딩', admin: '관리자' };

  const NAV_ADMIN = [['dash', '대시보드', ICON.chart], ['members', '회원관리', ICON.users], ['cash', '입출금 승인', ICON.bank], ['buffs', 'MAX 버프', ICON.shield], ['inq', '1:1 문의', ICON.doc], ['subs', 'AI 구독', ICON.spark], ['grades', '등급 관리', ICON.trophy], ['lead', 'MAX 리딩·공지', ICON.lead], ['stocks', '종목·시세', ICON.list], ['settings', '수수료·설정', ICON.gear]];
  const NAV_INST = [['lead', '리딩·공지', ICON.lead]];
  function shell() {
    const nav = A.me.role === 'admin' ? NAV_ADMIN : NAV_INST;
    root.innerHTML = `<div class="app admin">
      <header class="topbar"><a href="#/${nav[0][0]}">${U.logo()}</a><span class="badge-mode">${A.me.role === 'admin' ? 'ADMIN' : 'MAX 리딩'}</span><div class="ticker" id="tk"></div>
        <div class="top-actions"><a class="btn btn-sm hide-m" href="index.html">사용자 화면</a>${A.me.role === 'admin' ? `<button class="icon-btn bell" id="aBell" title="알림">${ICON.bell}<span class="bdg" id="aBellN" hidden></span></button><div class="notif-pop hidden" id="aPop"></div><button class="icon-btn" id="aSnd" title="알림 소리"></button>` : ''}<button class="icon-btn" id="th">${ICON.sun}</button><button class="user-chip" id="out" title="로그아웃"><span class="avatar">${esc(A.me.name.slice(0, 1))}</span><span class="nm">${esc(A.me.name)}</span></button></div></header>
      <aside class="sidebar"><nav class="nav"><div class="cap">${A.me.role === 'admin' ? 'ADMIN CONSOLE' : 'MAX 리딩'}</div>${nav.map(([r, l, i]) => `<a href="#/${r}" data-r="${r}">${i}<span>${l}</span>${['cash', 'buffs', 'inq', 'members', 'subs'].includes(r) ? `<span class="nbdg" id="nb-${r}" hidden></span>` : ''}</a>`).join('')}<div class="sep"></div><a href="index.html">${ICON.home}<span>사용자 화면</span></a></nav><div class="side-foot" id="sf"></div></aside>
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
    Poll.badges();
  }

  // ═════ 실시간 알림 (띵동) ═════
  const SND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
  const SND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>';
  const Poll = {
    d: null, seen: null, ac: null, timer: 0, log: [],
    on() { try { return localStorage.getItem('mls.adm.snd') !== '0'; } catch { return true; } },
    ctx() { if (!this.ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; this.ac = new C(); } if (this.ac.state === 'suspended') this.ac.resume().catch(() => {}); return this.ac; },
    ding(kind) {
      if (!this.on()) return; const ac = this.ctx(); if (!ac) return;
      const notes = kind === 'danger' ? [[880, 0], [660, 0.18], [880, 0.36], [660, 0.54]] : [[1318.5, 0], [987.8, 0.22]];
      for (const [f, t] of notes) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; const t0 = ac.currentTime + t; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9); o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + 1); }
    },
    say(t) { try { if (localStorage.getItem('mls.adm.voice') === '0' || !this.on() || !window.speechSynthesis) return; const u = new SpeechSynthesisUtterance(t); u.lang = 'ko-KR'; const v = speechSynthesis.getVoices().find((x) => /^ko/i.test(x.lang)); if (v) u.voice = v; speechSynthesis.speak(u); } catch {} },
    desk(title, body) { try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body, tag: 'mls-adm-' + title }); } catch {} },
    sndBtn() { const b = $('#aSnd'); if (!b) return; const on = this.on(); b.innerHTML = on ? SND_ON : SND_OFF; b.title = on ? '알림 소리·음성 켜짐 (클릭 시 끄기)' : '알림 소리·음성 꺼짐 (클릭 시 켜기)'; b.classList.toggle('muted-ic', !on); },
    badges() {
      const d = this.d; const set = (k, n) => { const e = $('#nb-' + k); if (e) { e.hidden = !n; e.textContent = n > 99 ? '99+' : n; } };
      const cash = d ? d.cash.length : A.flows.filter((f) => f.status === 'pending').length;
      set('cash', cash); set('subs', d && d.subs ? d.subs.length : 0); set('buffs', d ? d.buffs.length + d.danger.length : 0); set('inq', d ? d.inquiries.length : 0); set('members', d ? d.signups.length : 0);
      const tot = d ? d.cash.length + d.buffs.length + d.inquiries.length + d.danger.length + (d.subs || []).length : cash;
      const bn = $('#aBellN'); if (bn) { bn.hidden = !tot; bn.textContent = tot > 99 ? '99+' : tot; }
      document.title = (tot ? `(${tot}) ` : '') + 'MAX라이프 주식 · 관리자';
    },
    pop() {
      const p = $('#aPop'); if (!p || p.classList.contains('hidden')) return; const d = this.d || { cash: [], buffs: [], inquiries: [], signups: [], liquidations: [], danger: [] };
      const it = (go, tag, tc, m, at) => `<a class="np-i new" href="${go}"><span class="tag ${tc}">${tag}</span><span class="np-m">${m}</span>${at ? `<small>${U.ago(at)}</small>` : '<small></small>'}</a>`;
      const rows = [
        ...d.danger.map((x) => it('#/buffs', '담보 위험', 'tag-sell', `${esc(x.name)} · 담보비율 ${Number(x.ratio).toFixed(1)}% (청산 ${x.maintain}%)`)),
        ...d.cash.map((x) => it('#/cash', x.type === 'deposit' ? '입금 신청' : '출금 신청', x.type === 'deposit' ? 'tag-buy' : 'tag-sell', `${esc(x.name)} · ${won(x.amount)} · ${PAYN(x.method)}`, x.at)),
        ...(d.subs || []).map((x) => it('#/subs', 'AI 구독', 'tag-brand', `${esc(x.name)} · ${esc(x.planName)} ${won(x.price)}`, x.at)),
        ...d.buffs.map((x) => it('#/buffs', '버프 신청', 'tag-brand', `${esc(x.name)} · ${x.mult}배 · ${won(x.amount)}`, x.at)),
        ...d.inquiries.map((x) => it('#/inq', '1:1 문의', 'tag-wait', `${esc(x.name)} · ${esc(x.title)}`, x.at)),
        ...d.liquidations.map((x) => it('#/buffs', '자동 청산', 'tag-sell', `${esc(x.name)} · ${won(x.amount)}`, x.at)),
        ...d.signups.map((x) => it('#/members', '신규 가입', 'tag-ok', `${esc(x.name)} (${esc(x.username)})`, x.at)),
      ];
      p.innerHTML = `<div class="np-h"><b>처리할 알림</b><span class="dim" style="font-size:11px">10초마다 확인</span></div>${rows.join('') || '<div class="empty">새 알림이 없습니다</div>'}${'Notification' in window && Notification.permission === 'default' ? '<button class="btn btn-sm btn-block" id="aDesk" style="margin:10px;width:calc(100% - 20px)">바탕화면 알림 켜기</button>' : ''}`;
      const dk = $('#aDesk'); if (dk) dk.onclick = () => Notification.requestPermission().then(() => this.pop());
    },
    async tick() {
      let d; try { d = await Store.adminPoll(); } catch { return; }
      if (!d) return; this.d = d;
      const ids = (k) => (d[k] || []).map((x) => x.id || x.userId);
      const cur = { subs: ids('subs'), cash: ids('cash'), buffs: ids('buffs'), inquiries: ids('inquiries'), signups: ids('signups'), liquidations: ids('liquidations'), danger: ids('danger') };
      if (this.seen) {
        const nw = (k) => (d[k] || []).filter((x) => !this.seen[k].includes(x.id || x.userId));
        const ev = [];
        for (const x of nw('cash')) ev.push(['cash', `${x.type === 'deposit' ? '입금' : '출금'} 신청`, `${x.name} · ${won(x.amount)} · ${PAYN(x.method)}`, '#/cash']);
        for (const x of nw('subs')) ev.push(['subs', 'AI 구독 신청', `${x.name} · ${x.planName} ${won(x.price)} · ${PAYN(x.method)}`, '#/subs']);
        for (const x of nw('buffs')) ev.push(['buffs', 'MAX 버프 신청', `${x.name} · ${x.mult}배 · ${won(x.amount)}`, '#/buffs']);
        for (const x of nw('inquiries')) ev.push(['inq', '1:1 문의 접수', `${x.name} · ${x.title}`, '#/inq']);
        for (const x of nw('signups')) ev.push(['members', '신규 가입', `${x.name} (${x.username})`, '#/members']);
        for (const x of nw('liquidations')) ev.push(['danger', '자동 청산 발생', `${x.name} · 버프 ${won(x.amount)} 청산`, '#/buffs']);
        for (const x of nw('danger')) ev.push(['danger', '담보비율 경고', `${x.name} · ${Number(x.ratio).toFixed(1)}% (청산 기준 ${x.maintain}%)`, '#/buffs']);
        if (ev.length) {
          this.ding(ev.some((e) => e[0] === 'danger') ? 'danger' : 'new');
          this.say(ev.length > 1 ? `새 알림 ${ev.length}건. ${ev[0][1]}.` : `${ev[0][1]}이 들어왔습니다.`);
          for (const [, t, m, go] of ev.slice(0, 4)) this.toast(t, m, go);
          if (ev.length > 4) this.toast('새 알림', `외 ${ev.length - 4}건`, '#/dash');
          this.desk(ev[0][1] + (ev.length > 1 ? ` 외 ${ev.length - 1}건` : ''), ev[0][2]);
          reload().then(() => { A.page && A.page.data && A.page.data(); });
        }
      }
      this.seen = cur; this.badges(); this.pop();
    },
    toast(t, m, go) {
      let w = $('#aToasts'); if (!w) { w = document.createElement('div'); w.id = 'aToasts'; w.className = 'adm-toasts'; document.body.appendChild(w); }
      const e = document.createElement('a'); e.className = 'adm-toast'; e.href = go; e.innerHTML = `<span class="ic">${ICON.bell}</span><div><b>${esc(t)}</b><p>${esc(m)}</p></div><button class="x" aria-label="닫기">×</button>`;
      e.querySelector('.x').onclick = (ev) => { ev.preventDefault(); e.remove(); };
      e.onclick = () => setTimeout(() => e.remove(), 50);
      w.prepend(e); setTimeout(() => e.classList.add('out'), 9000); setTimeout(() => e.remove(), 9600);
    },
    start() {
      if (A.me.role !== 'admin') return;
      this.sndBtn();
      $('#aSnd').onclick = () => { const on = !this.on(); try { localStorage.setItem('mls.adm.snd', on ? '1' : '0'); } catch {} this.sndBtn(); if (on) { this.ctx(); this.ding('new'); U.toast('알림 소리를 켰습니다.'); } };
      $('#aBell').onclick = (e) => { e.stopPropagation(); $('#aPop').classList.toggle('hidden'); this.pop(); };
      document.addEventListener('click', (e) => { const p = $('#aPop'); if (p && !e.target.closest('#aPop')) p.classList.add('hidden'); });
      // 브라우저 자동재생 정책: 첫 클릭 시 오디오 활성화
      const unlock = () => { this.ctx(); document.removeEventListener('pointerdown', unlock); };
      document.addEventListener('pointerdown', unlock);
      this.tick(); this.timer = setInterval(() => this.tick(), 10000);
    },
  };
  function route() {
    const r = location.hash.replace(/^#\/?/, '') || (A.me.role === 'admin' ? 'dash' : 'lead');
    const pages = A.me.role === 'admin' ? { dash: Dash, members: Members, cash: CashAdm, buffs: BuffAdm, inq: InqAdm, subs: SubsAdm, grades: Grades, lead: LeadAdm, stocks: Stocks, settings: Settings } : { lead: LeadAdm };
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
      <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>운영 수익</h3><span class="dim" style="font-size:12px">수수료 · 거래세 · 버프 이자 (최근 30일 일별)</span></div><div class="panel-b"><div class="grid g-5" id="dRev" style="margin-bottom:14px"></div><div class="bar-chart"><canvas id="dRevBar"></canvas></div></div></section>
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
      rev();
    }
    let revAt = 0, R = null;
    async function rev() {
      if (!R || Date.now() - revAt > 60000) { revAt = Date.now(); try { R = await Store.revenue(); } catch { R = R || null; } }
      if (!R || !$('#dRev')) return; const T = R.total;
      $('#dRev').innerHTML = stat('누적 매매 수수료', won(T.fee), '체결 시 부과', 'brand') + stat('누적 거래세', won(T.tax), '매도 시 부과') + stat('MAX 버프 이자', won(T.interest), `사용 중 지원금 ${compact(T.loan)}원`) + stat('AI 구독 매출', won(T.ai || 0), `이용 중 ${T.aiActive || 0}명`, 'brand') + stat('총 운영 수익', won(T.fee + T.tax + T.interest + (T.ai || 0)), `누적 거래대금 ${compact(T.volume)}원`, 'brand');
      const days = []; for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(dayKey(d)); }
      const m = Object.fromEntries((R.daily || []).map((x) => [x.d, x]));
      Chart.bars($('#dRevBar'), { labels: days.map((d) => d.slice(5).replace('-', '.')), series: [{ values: days.map((d) => (m[d] ? m[d].fee : 0)), color: Chart.css('--brand') }, { values: days.map((d) => (m[d] ? m[d].tax : 0)), color: Chart.css('--warn') }] });
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

  const geo = (l) => (l ? [l.country, l.region, l.city].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' ') : '');
  function device(ua) {
    if (!ua) return '-'; const os = /Windows/.test(ua) ? 'Windows' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '기타';
    const br = /MAXLifeHTS/.test(ua) ? 'PC 프로그램' : /Edg\//.test(ua) ? 'Edge' : /Whale/.test(ua) ? '웨일' : /SamsungBrowser/.test(ua) ? '삼성 인터넷' : /KAKAOTALK/.test(ua) ? '카카오톡' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : '브라우저';
    return `${os} · ${br}`;
  }
  // 계정 삭제 (개별·일괄)
  function delDlg(list, after) {
    list = list.filter((u) => u.role !== 'admin'); if (!list.length) return U.toast('삭제할 수 있는 계정이 없습니다. (관리자 계정 제외)', true);
    const one = list.length === 1 ? list[0] : null;
    U.modal({ title: '계정 삭제', body: `<p style="margin-top:0">${one ? `<b>${esc(one.name)}</b> (${esc(one.username)})` : `<b>${list.length}개 계정</b>`}과 계좌·보유종목·주문·거래·입출금·버프·문의·AI 구독 기록을 <b class="up">영구 삭제</b>합니다. 되돌릴 수 없습니다.</p>${one ? '' : `<div class="del-list">${list.slice(0, 30).map((u) => `<span class="tag tag-no">${esc(u.name)} · ${esc(u.username)}</span>`).join(' ')}${list.length > 30 ? ' …' : ''}</div>`}<div class="field" style="margin-top:12px"><label>삭제 사유 (감사로그 기록)</label><input class="input" id="dlWhy" placeholder="예: 테스트 계정 정리, 이용 약관 위반"></div><div class="field"><label>확인을 위해 <b>삭제</b>라고 입력하세요</label><input class="input" id="dlOk2"></div>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-danger" id="dlGo">영구 삭제</button>', onMount: (m, close) => { $('#dlGo', m).onclick = async () => { if ($('#dlOk2', m).value.trim() !== '삭제') return U.toast('「삭제」를 입력해 주세요.', true); try { const n = await Store.deleteUsers(list.map((u) => u.id), $('#dlWhy', m).value); close(); after && after(); U.toast(`${n}개 계정을 삭제했습니다.`); await reload(); A.page && A.page.data && A.page.data(); } catch (e) { U.toast(e.message, true); } }; } });
  }
  function grantDlg(u, after) {
    const P = A.st.aiPlans || [];
    U.modal({ title: 'AI 구독 지급', body: `<p class="muted" style="margin-top:0">${esc(u.name)} (${esc(u.username)}) 회원에게 결제 없이 AI 구독을 지급합니다. 이용 중이면 종료일 뒤로 이어집니다.</p><div class="field"><label>요금제</label><select class="input" id="gP">${P.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label>기간 (일)</label><input class="input" id="gD" value="30" inputmode="numeric"></div><div class="field"><label>사유</label><input class="input" id="gM" value="관리자 지급"></div>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="gOk">지급</button>', onMount: (m, close) => { $('#gOk', m).onclick = async () => { try { await Store.grantSub(u.id, $('#gP', m).value, +$('#gD', m).value || 30, $('#gM', m).value); close(); U.toast('AI 구독을 지급했습니다.'); await reload(); A.page && A.page.data && A.page.data(); } catch (e) { U.toast(e.message, true); } }; } });
  }

  // ═════ AI 구독 ═════
  function SubsAdm(main) {
    let F = 'pending', L = [];
    const ST = { pending: ['승인 대기', 'tag-wait'], active: ['이용 중', 'tag-ok'], rejected: ['반려', 'tag-sell'], cancelled: ['취소', 'tag-no'], expired: ['만료', 'tag-no'] };
    main.innerHTML = `${head('AI 구독', 'MAX AI 분석 월정액 신청을 승인하고, 요금제·무료 이용 한도를 설정합니다.')}
      <div class="grid g-4" id="sbS" style="margin-bottom:16px"></div>
      <section class="panel" style="margin-bottom:16px"><div class="panel-b"><div class="filters"><div class="seg" id="sbF">${[['pending', '승인 대기'], ['active', '이용 중'], ['all', '전체']].map(([k, n]) => `<button data-s="${k}" class="${k === F ? 'on' : ''}">${n}</button>`).join('')}</div><select class="input" id="sbU" style="max-width:240px"><option value="">회원 선택 → 구독 지급</option>${A.users.filter((u) => u.role === 'user').map((u) => `<option value="${u.id}">${esc(u.name)} (${esc(u.username)})</option>`).join('')}</select></div></div><div class="panel-b flush" id="sbL"></div></section>
      <section class="panel"><div class="panel-h"><h3>요금제 · 이용 설정</h3><button class="btn btn-sm btn-brand" id="spSave">저장</button></div><div class="panel-b">
        <div class="setting-row"><div><b>AI 분석 사용</b><small>끄면 모든 이용자의 AI 분석이 일시 중지됩니다.</small></div><label class="switch" style="justify-self:end"><input type="checkbox" id="spEn" ${A.st.aiEnabled !== false ? 'checked' : ''}><span></span></label></div>
        <div class="setting-row"><div><b>카드 회원 무료</b><small>MAX DAY LIFE 카드 회원에게 첫 번째 요금제 혜택을 무료로 적용합니다.</small></div><label class="switch" style="justify-self:end"><input type="checkbox" id="spCard" ${A.st.aiCardFree ? 'checked' : ''}><span></span></label></div>
        <div class="setting-row"><div><b>무료 이용자 하루 분석 횟수</b><small>구독하지 않은 이용자</small></div><input class="input" id="spFree" style="max-width:100px;justify-self:end;text-align:right" value="${A.st.aiFreeDaily ?? 3}"></div>
        <div class="table-wrap" style="margin-top:12px"><table class="t"><thead><tr><th>코드</th><th class="l">이름</th><th>월 요금(원)</th><th>기간(일)</th><th>하루 분석 (0=무제한)</th><th></th></tr></thead><tbody id="spT"></tbody></table></div><button class="btn btn-sm" id="spAdd" style="margin-top:8px">+ 요금제 추가</button>
      </div></section>`;
    let P = JSON.parse(JSON.stringify(A.st.aiPlans || []));
    const drawP = () => { $('#spT').innerHTML = P.map((p, i) => `<tr><td><input class="input" data-i="${i}" data-f="id" value="${esc(p.id)}" style="width:80px"></td><td class="l"><input class="input" data-i="${i}" data-f="name" value="${esc(p.name)}"></td><td><input class="input" data-i="${i}" data-f="price" value="${p.price}" style="width:100px;text-align:right"></td><td><input class="input" data-i="${i}" data-f="days" value="${p.days || 30}" style="width:70px;text-align:right"></td><td><input class="input" data-i="${i}" data-f="daily" value="${p.daily || 0}" style="width:70px;text-align:right"></td><td><button class="btn btn-sm btn-ghost" data-del="${i}">삭제</button></td></tr>`).join(''); $$('#spT input').forEach((x) => (x.onchange = () => { const f = x.dataset.f; P[+x.dataset.i][f] = ['price', 'days', 'daily'].includes(f) ? +x.value.replace(/[^0-9]/g, '') || 0 : x.value.trim(); })); $$('[data-del]', main).forEach((b) => (b.onclick = () => { if (P.length <= 1) return U.toast('요금제는 최소 1개가 필요합니다.', true); P.splice(+b.dataset.del, 1); drawP(); })); };
    drawP();
    $('#spAdd').onclick = () => { P.push({ id: 'p' + (P.length + 1), name: '새 요금제', price: 19900, days: 30, daily: 100 }); drawP(); };
    $('#spSave').onclick = async () => { try { await Store.saveSettings({ aiEnabled: $('#spEn').checked, aiCardFree: $('#spCard').checked, aiFreeDaily: +$('#spFree').value || 0, aiPlans: P }); A.st = await Store.settings(); U.toast('저장되었습니다.'); } catch (e) { U.toast(e.message, true); } };
    $$('#sbF button').forEach((b) => (b.onclick = () => { F = b.dataset.s; $$('#sbF button').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
    $('#sbU').onchange = (e) => { const u = A.users.find((x) => x.id === e.target.value); e.target.value = ''; if (u) grantDlg(u, load); };
    function draw() {
      const act = L.filter((x) => x.status === 'active'); const now = new Date().toISOString();
      $('#sbS').innerHTML = stat('승인 대기', L.filter((x) => x.status === 'pending').length + '건', '', 'brand') + stat('이용 중', new Set(act.filter((x) => x.startsAt <= now).map((x) => x.userId)).size + '명', '') + stat('누적 구독 매출', won(L.filter((x) => ['active', 'expired'].includes(x.status)).reduce((s, x) => s + x.price, 0)), '') + stat('이번 달 매출', won(L.filter((x) => ['active', 'expired'].includes(x.status) && (x.processedAt || '').slice(0, 7) === U.today().slice(0, 7)).reduce((s, x) => s + x.price, 0)), '');
      const R = L.filter((x) => F === 'all' || x.status === F);
      $('#sbL').innerHTML = R.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th class="l">회원</th><th>요금제</th><th>금액</th><th>결제 수단</th><th class="l hide-m">메모</th><th>상태</th><th>기간</th><th></th></tr></thead><tbody>${R.map((x) => `<tr><td class="dim">${U.dt(x.createdAt)}</td><td class="l"><div class="sname"><b>${esc(x.name || '')}</b><small>${esc(x.username || '')}</small></div></td><td>${esc(x.planName)}</td><td><b>${x.method === 'grant' ? '지급' : won(x.price)}</b></td><td>${x.method === 'grant' ? '관리자' : PAYN(x.method)}</td><td class="l hide-m muted" style="font-size:12px">${esc(x.memo || '')}${x.adminMemo ? ' · ' + esc(x.adminMemo) : ''}</td><td><span class="tag ${ST[x.status][1]}">${ST[x.status][0]}</span></td><td class="dim" style="font-size:12px">${x.startsAt ? U.date(x.startsAt) + ' ~ ' + U.date(x.endsAt) : '-'}</td><td style="white-space:nowrap">${x.status === 'pending' ? `<button class="btn btn-sm btn-brand" data-ok="${x.id}">승인</button> <button class="btn btn-sm" data-no="${x.id}">반려</button>` : x.status === 'active' ? `<button class="btn btn-sm btn-ghost" data-rv="${x.id}">중지</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">해당 구독이 없습니다</div>';
      $$('[data-ok]', main).forEach((b) => (b.onclick = async () => { try { await Store.processSub(b.dataset.ok, true); U.toast('승인했습니다. 바로 적용됩니다.'); load(); } catch (e) { U.toast(e.message, true); } }));
      $$('[data-no]', main).forEach((b) => (b.onclick = () => U.modal({ title: '구독 반려', body: '<div class="field"><label>반려 사유 (회원에게 표시)</label><input class="input" id="rjm" placeholder="예: 입금 확인 불가"></div>', foot: '<button class="btn" data-x>취소</button><button class="btn btn-danger" id="rjOk">반려</button>', onMount: (m, close) => { $('#rjOk', m).onclick = async () => { try { await Store.processSub(b.dataset.no, false, $('#rjm', m).value); close(); U.toast('반려했습니다.'); load(); } catch (e) { U.toast(e.message, true); } }; } })));
      $$('[data-rv]', main).forEach((b) => (b.onclick = async () => { if (!(await U.confirmBox('구독 중지', '이 구독을 즉시 중지할까요?', '중지', 'btn-danger'))) return; await Store.revokeSub(b.dataset.rv); U.toast('중지했습니다.'); load(); }));
    }
    async function load() { try { L = await Store.adminSubs(); } catch { L = []; } draw(); }
    load();
    return { data: load };
  }

  // ═════ 1:1 문의 ═════
  function InqAdm(main) {
    const CAT = { cash: '입출금', buff: 'MAX 버프', order: '주문·체결', account: '계정·등급', lead: 'MAX 리딩', etc: '기타', notice: '운영 쪽지' };
    const F = { st: 'open', q: '' }; let L = [];
    main.innerHTML = `${head('1:1 문의', '이용자 문의에 답변하면 이용자 화면 알림으로 바로 전달됩니다.', '<button class="btn btn-sm btn-brand" id="iqMsg">전체 쪽지 보내기</button>')}
      <section class="panel"><div class="panel-b"><div class="filters"><div class="seg" id="iqS">${[['open', '답변 대기'], ['answered', '답변 완료'], ['closed', '종료'], ['msg', '보낸 쪽지'], ['all', '전체']].map(([k, n]) => `<button data-s="${k}" class="${k === F.st ? 'on' : ''}">${n}</button>`).join('')}</div><div class="search" style="flex:1;min-width:180px">${ICON.search}<input id="iqQ" placeholder="닉네임·제목·내용 검색" style="width:100%"></div></div></div><div class="panel-b flush" id="iqL"><div class="empty">불러오는 중…</div></div></section>`;
    $$('#iqS button').forEach((b) => (b.onclick = () => { F.st = b.dataset.s; $$('#iqS button').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
    $('#iqQ').oninput = (e) => { F.q = e.target.value.trim().toLowerCase(); draw(); };
    $('#iqMsg').onclick = () => location.hash = '#/members';
    function draw() {
      const R = L.filter((q) => (F.st === 'all' || (F.st === 'msg' ? q.fromAdmin : !q.fromAdmin && q.status === F.st)) && (!F.q || [q.name, q.username, q.title, q.body].join(' ').toLowerCase().includes(F.q)));
      // 단체 쪽지는 한 건으로 묶어서 표시
      const G = {}; const R2 = []; for (const q of R) { if (!q.fromAdmin) { R2.push(q); continue; } const k = q.title + '|' + q.answer + '|' + String(q.createdAt).slice(0, 16); if (G[k]) { G[k].n++; G[k].ids.push(q.id); continue; } G[k] = Object.assign({}, q, { n: 1, ids: [q.id] }); R2.push(G[k]); }
      R.length = 0; R.push(...R2.map((q) => (q.fromAdmin && q.n > 1 ? Object.assign(q, { name: `${q.n}명에게 발송`, username: '' }) : q)));
      $('#iqL').innerHTML = R.length ? R.map((q) => `<div class="inq"><div class="inq-h"><span class="tag ${q.fromAdmin ? 'tag-brand' : 'tag-no'}">${CAT[q.category] || '기타'}</span><b>${esc(q.title)}</b><span class="tag ${q.status === 'open' ? 'tag-wait' : 'tag-ok'}">${q.fromAdmin ? '쪽지' : q.status === 'open' ? '답변 대기' : q.status === 'answered' ? '답변 완료' : '종료'}</span><small class="dim">${esc(q.name || '')} ${esc(q.username || '')} · ${U.dt(q.createdAt)}</small></div>${q.body ? `<p class="muted" style="white-space:pre-wrap;margin:8px 0 0">${esc(q.body)}</p>` : ''}${q.answer && !q.fromAdmin ? `<div class="inq-a"><b>답변</b> <small class="dim">${esc(q.answeredBy || '')} ${q.answeredAt ? U.dt(q.answeredAt) : ''}</small><p style="white-space:pre-wrap;margin:6px 0 0">${esc(q.answer)}</p></div>` : ''}${q.fromAdmin && q.answer ? `<p style="white-space:pre-wrap;margin:8px 0 0">${esc(q.answer)}</p>` : ''}${!q.fromAdmin ? `<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">${q.status !== 'closed' ? `<button class="btn btn-sm btn-brand" data-ans="${q.id}">${q.answer ? '답변 수정' : '답변하기'}</button><button class="btn btn-sm" data-cls="${q.id}">종료</button>` : ''}<button class="btn btn-sm btn-ghost" data-mem="${q.userId}">회원 정보</button><button class="btn btn-sm btn-ghost" data-qdel="${q.id}" style="color:var(--up)">삭제</button></div>` : `<div style="margin-top:8px"><button class="btn btn-sm btn-ghost" data-qdel="${q.ids ? q.ids.join(',') : q.id}" style="color:var(--up)">쪽지 삭제${q.n > 1 ? ` (${q.n}명)` : ''}</button></div>`}</div>`).join('') : '<div class="empty">해당 문의가 없습니다</div>';
      $$('[data-ans]', main).forEach((b) => (b.onclick = () => { const q = L.find((x) => x.id === b.dataset.ans); U.modal({ title: '문의 답변', body: `<div class="inq" style="padding:0 0 12px"><b>${esc(q.title)}</b><p class="muted" style="white-space:pre-wrap">${esc(q.body || '')}</p></div><div class="field"><label>답변</label><textarea class="input" id="anB" rows="7" maxlength="3000">${esc(q.answer || '')}</textarea></div>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="anOk">답변 등록</button>', onMount: (m, close) => { $('#anOk', m).onclick = async () => { try { await Store.answerInquiry(q.id, $('#anB', m).value); close(); U.toast('답변을 등록했습니다. 이용자에게 알림이 전달됩니다.'); load(); } catch (e) { U.toast(e.message, true); } }; } }); }));
      $$('[data-cls]', main).forEach((b) => (b.onclick = async () => { try { await Store.closeInquiry(b.dataset.cls); U.toast('종료했습니다.'); load(); } catch (e) { U.toast(e.message, true); } }));
      $$('[data-mem]', main).forEach((b) => (b.onclick = () => memberDetail(b.dataset.mem)));
      $$('[data-qdel]', main).forEach((b) => (b.onclick = async () => { const ids = b.dataset.qdel.split(','); if (!(await U.confirmBox('삭제', `${ids.length > 1 ? `쪽지 ${ids.length}건` : '이 문의'}를 삭제할까요? 이용자 화면에서도 사라집니다.`, '삭제', 'btn-danger'))) return; try { await Store.deleteInquiries(ids); U.toast('삭제했습니다.'); load(); } catch (e) { U.toast(e.message, true); } }));
    }
    async function load() { try { L = await Store.adminInquiries(); } catch (e) { L = []; } draw(); }
    load();
    return { data: load };
  }

  // ═════ 회원관리 ═════
  function Members(main) {
    const F = { q: '', status: 'all', role: 'all', sort: 'join' };
    main.innerHTML = `${head('회원관리', '회원별 보유종목, 매입·매출, 수익률, 입출금 내역을 조회하고 계정을 관리합니다.')}
      <section class="panel"><div class="panel-b"><div class="filters">
        <div class="search" style="flex:1;min-width:200px">${ICON.search}<input id="mq" placeholder="닉네임·아이디·연락처 검색" style="width:100%"></div>
        <select class="input" id="ms"><option value="all">전체 상태</option><option value="active">정상</option><option value="suspended">정지</option></select>
        <select class="input" id="mr"><option value="all">전체 권한</option><option value="user">이용자</option><option value="instructor">MAX 리딩</option><option value="admin">관리자</option></select>
        <select class="input" id="mo"><option value="join">가입순</option><option value="ret">수익률순</option><option value="asset">자산순</option><option value="trade">거래순</option><option value="login">최근접속순</option></select>
        <button class="btn btn-sm" id="mcsv">CSV 내보내기</button>
      </div><div class="bulk-bar"><span id="mSel" class="muted">선택 0명</span><button class="btn btn-sm btn-brand" id="mMsg">${ICON.bell} 쪽지 보내기</button><button class="btn btn-sm" id="mPay">일괄 지급·차감</button><button class="btn btn-sm btn-danger" id="mDel">선택 계정 삭제</button><span class="dim" style="font-size:12px">선택이 없으면 쪽지는 전체 이용자에게 발송됩니다</span></div></div><div class="panel-b flush" id="mList"></div></section>`;
    $('#mq').oninput = (e) => { F.q = e.target.value.trim().toLowerCase(); data(); };
    $('#ms').onchange = (e) => { F.status = e.target.value; data(); };
    $('#mr').onchange = (e) => { F.role = e.target.value; data(); };
    $('#mo').onchange = (e) => { F.sort = e.target.value; data(); };
    let rows = []; const SEL = new Set();
    const selTxt = () => { $('#mSel').textContent = `선택 ${SEL.size}명`; };
    $('#mMsg').onclick = () => {
      const ids = [...SEL]; const who = ids.length ? `선택한 ${ids.length}명` : '전체 이용자';
      U.modal({ title: '쪽지 보내기', body: `<p class="muted" style="margin-top:0">받는 사람: <b>${who}</b> · 이용자 알림과 고객센터에 표시됩니다.</p><div class="field"><label>제목</label><input class="input" id="smT" maxlength="100" placeholder="예: 이번 주 MAX 리딩 일정 안내"></div><div class="field"><label>내용</label><textarea class="input" id="smB" rows="6" maxlength="3000"></textarea></div>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="smOk">발송</button>', onMount: (m, close) => { $('#smOk', m).onclick = async () => { const t = $('#smT', m).value.trim(); if (!t) return U.toast('제목을 입력해 주세요.', true); try { await Store.sendMessage(t, $('#smB', m).value, ids.length ? ids : null); close(); U.toast(`${who}에게 쪽지를 보냈습니다.`); } catch (e) { U.toast(e.message, true); } }; } });
    };
    $('#mDel').onclick = () => { const ids = [...SEL]; if (!ids.length) return U.toast('삭제할 회원을 먼저 선택해 주세요.', true); delDlg(ids.map((id) => A.users.find((u) => u.id === id)).filter(Boolean), () => { SEL.clear(); selTxt(); }); };
    $('#mPay').onclick = () => {
      const ids = [...SEL]; if (!ids.length) return U.toast('지급할 회원을 먼저 선택해 주세요.', true);
      U.modal({ title: '일괄 지급·차감', body: `<p class="muted" style="margin-top:0">선택한 <b>${ids.length}명</b>의 예수금을 한 번에 조정합니다. 차감은 음수로 입력하세요.</p><div class="field"><label>금액 (원)</label><input class="input" id="bcA" inputmode="numeric" placeholder="예: 1000000 / -500000"></div><div class="field"><label>사유 (입출금 내역에 표시)</label><input class="input" id="bcM" value="이벤트 지급"></div>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="bcOk">실행</button>', onMount: (m, close) => { $('#bcOk', m).onclick = async () => { const a = Number(String($('#bcA', m).value).replace(/[^0-9.-]/g, '')); if (!a) return U.toast('금액을 입력해 주세요.', true); try { await Store.bulkCash(ids, a, $('#bcM', m).value); close(); SEL.clear(); selTxt(); U.toast(`${ids.length}명에게 ${won(a)} 반영했습니다.`); } catch (e) { U.toast(e.message, true); } }; } });
    };
    function data() {
      rows = A.bundles.filter((b) => b.user.role !== 'admin' || F.role === 'admin').map((b) => ({ b, u: b.user, v: val(b) }));
      if (F.role === 'admin') rows.push(...A.users.filter((u) => u.role === 'admin').map((u) => ({ b: null, u, v: null })));
      rows = rows.filter(({ u }) => (F.status === 'all' || u.status === F.status) && (F.role === 'all' || u.role === F.role) && (!F.q || [u.name, u.username, u.phone, u.email].join(' ').toLowerCase().includes(F.q)));
      const s = { join: (a, b) => b.u.createdAt.localeCompare(a.u.createdAt), ret: (a, b) => (b.v ? b.v.netPct : -1e9) - (a.v ? a.v.netPct : -1e9), asset: (a, b) => (b.v ? b.v.net : 0) - (a.v ? a.v.net : 0), trade: (a, b) => (b.b ? b.b.fills.length : 0) - (a.b ? a.b.fills.length : 0), login: (a, b) => String(b.u.lastLogin || '').localeCompare(String(a.u.lastLogin || '')) };
      rows.sort(s[F.sort]);
      $('#mList').innerHTML = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th class="ck"><input type="checkbox" id="mAll"></th><th>회원</th><th>등급</th><th>권한</th><th>상태</th><th>순자산</th><th>수익률</th><th class="hide-m">버프·담보비율</th><th class="hide-m">예수금</th><th class="hide-m">보유</th><th class="hide-m">체결</th><th class="hide-m">총 충전</th><th class="hide-m">가입일</th><th class="hide-m l">최근 접속 · IP · 지역</th></tr></thead><tbody>${rows.map(({ u, v, b }) => `<tr class="click" data-u="${u.id}"><td class="ck">${u.role === 'user' ? `<input type="checkbox" data-ck="${u.id}" ${SEL.has(u.id) ? 'checked' : ''}>` : ''}</td><td><div class="sname"><b>${esc(u.name)}</b><small>${esc(u.username)}${u.phone ? ' · ' + esc(u.phone) : ''}</small></div></td><td>${esc(GRADE(u.grade).name)}${u.cardTier ? ' <span class="tag card-' + u.cardTier + '">' + CARD[u.cardTier] + '</span>' : ''}</td><td>${ROLE[u.role]}</td><td><span class="tag ${u.status === 'active' ? 'tag-ok' : 'tag-sell'}">${u.status === 'active' ? '정상' : '정지'}</span></td><td>${v ? won(v.net) : '-'}</td><td class="${v ? cls(v.netPct) : ''}"><b>${v ? pct(v.netPct) : '-'}</b></td><td class="hide-m">${v && v.loan ? `${v.buff.mult}배 · <b style="color:${v.ratio < v.maintain ? 'var(--up)' : v.ratio < (A.st.buffWarn || 140) ? 'var(--warn)' : 'var(--ok)'}">${v.ratio.toFixed(1)}%</b>` : '-'}</td><td class="hide-m">${v ? won(v.cash) : '-'}</td><td class="hide-m">${v ? v.holdings.length : '-'}</td><td class="hide-m">${b ? b.fills.length : '-'}</td><td class="hide-m">${won((A.sum[u.id] || {}).dep || 0)}</td><td class="hide-m dim">${U.date(u.createdAt)}</td><td class="hide-m l dim" style="font-size:12px">${u.lastLogin ? U.ago(u.lastLogin) : '-'}${(() => { const L = (A.sum[u.id] || {}).last; return L && L.ip ? `<br>${esc(L.ip)} · ${esc(geo(L) || '확인 중')}` : ''; })()}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">조건에 맞는 회원이 없습니다</div>';
      $$('[data-u]', main).forEach((r) => (r.onclick = (e) => { if (e.target.closest('.ck')) return; memberDetail(r.dataset.u); }));
      $$('[data-ck]', main).forEach((c) => (c.onchange = () => { c.checked ? SEL.add(c.dataset.ck) : SEL.delete(c.dataset.ck); selTxt(); }));
      const all = $('#mAll'); if (all) { const us = rows.filter((r) => r.u.role === 'user').map((r) => r.u.id); all.checked = us.length && us.every((id) => SEL.has(id)); all.onchange = () => { us.forEach((id) => (all.checked ? SEL.add(id) : SEL.delete(id))); data(); }; }
      selTxt();
    }
    $('#mcsv').onclick = () => {
      const lines = [['닉네임', '아이디', '권한', '상태', '연락처', '총자산', '수익률(%)', '예수금', '보유종목수', '체결수', '가입일', '최근접속'].join(',')];
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
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px"><span class="tag ${u.status === 'active' ? 'tag-ok' : 'tag-sell'}">${u.status === 'active' ? '정상' : '정지'}</span><span class="tag tag-no">${ROLE[u.role]}</span><span class="tag tag-brand">${esc(GRADE(u.grade).name)} 등급</span>${u.cardTier ? `<span class="tag card-${u.cardTier}">MAX DAY LIFE ${CARD[u.cardTier]} 카드</span>` : ''}${v.loan ? `<span class="tag tag-wait">버프 ${v.buff.mult}배 · 담보비율 ${v.ratio.toFixed(1)}%</span>` : ''}<span class="dim" style="font-size:12px">가입 ${U.dt(u.createdAt)} · 최근접속 ${u.lastLogin ? U.dt(u.lastLogin) : '-'}${u.phone ? ' · ' + esc(u.phone) : ''}</span></div>
        <div class="grid g-4" style="gap:10px;margin-bottom:16px">
          ${stat('순자산', won(v.net), `원금 ${won(v.principal)}${v.loan ? ' · 버프 ' + won(v.loan) : ''}`)}${stat('누적 수익률', pct(v.netPct), signedWon(v.netPnl), cls(v.netPct))}${stat('평가손익', signedWon(v.pnl), `평가금액 ${won(v.evalKrw)}`, cls(v.pnl))}${stat('예수금', won(v.cash), `실현손익 ${signedWon(v.realized)}`)}
        </div>
        <div class="md-sum">${(() => { const X = A.sum[u.id] || {}; const L = X.last || {}; const dep = X.dep || 0, wd = X.wd || 0; return [
          ['총 충전', won(dep), `${b.cashflows.filter((c) => c.type === 'deposit' && c.status === 'approved').length}회`], ['총 출금', won(wd), `${b.cashflows.filter((c) => c.type === 'withdraw' && c.status === 'approved').length}회`],
          ['보유 주식 평가', won(v.evalKrw), `${v.holdings.length}종목`], ['실현손익', `<span class="${cls(v.realized)}">${signedWon(v.realized)}</span>`, '매도 확정분'],
          ['출금가능금액', won(v.withdrawable), `주문 대기 ${won(v.reserved)}`], ['총 손익', `<span class="${cls(v.netPnl)}">${signedWon(v.netPnl)}</span>`, pct(v.netPct)],
          ['거래대금', won(X.vol || 0), `${b.fills.length}건 체결`], ['수수료·세금', won(X.fee || 0), '누적 납부'],
          ['AI 구독', X.ai ? esc(X.ai.plan) : '없음', X.ai ? U.date(X.ai.endsAt) + '까지' : '-'], ['MAX 버프', v.loan ? `${v.buff.mult}배 · ${won(v.loan)}` : '없음', v.loan ? `담보비율 ${v.ratio.toFixed(1)}%` : '-'],
        ].map(([k, val, sub]) => `<div><small>${k}</small><b>${val}</b><em>${sub}</em></div>`).join('') + `</div><div class="md-login"><div><small>최근 접속</small><b>${L.at ? U.dt(L.at) : u.lastLogin ? U.dt(u.lastLogin) : '-'}</b></div><div><small>접속 IP</small><b>${esc(L.ip || '-')}</b></div><div><small>지역</small><b>${esc(geo(L) || (L.ip ? '확인 중' : '-'))}</b></div><div><small>통신사</small><b>${esc(L.isp || '-')}</b></div><div><small>기기 · 브라우저</small><b>${esc(device(L.ua))}</b></div><div><small>30일 접속 · IP 수</small><b>${X.logins30 || 0}회 · ${X.ips || 0}개</b></div>`; })()}</div>
        <div style="height:160px;margin-bottom:12px"><canvas id="mdLine" style="width:100%;height:100%"></canvas></div>
        <div class="tabs" id="mdTab" style="padding:0"><button data-v="hold" class="on">보유종목 ${v.holdings.length}</button><button data-v="fills">매입·매출 ${b.fills.length}</button><button data-v="orders">주문 ${b.orders.length}</button><button data-v="cash">입출금 ${b.cashflows.length}</button><button data-v="buff">MAX 버프 ${(b.buffs || []).length}</button><button data-v="login">접속 기록</button></div>
        <div id="mdBody" style="margin:0 -20px"></div>`,
      foot: `${u.role !== 'admin' ? '<button class="btn btn-danger" id="mdDel">계정 삭제</button>' : ''}<button class="btn" id="mdAi">AI 구독 지급</button><button class="btn" id="mdGrade">등급: ${esc(GRADE(u.grade).name)}</button><button class="btn" id="mdCard">카드: ${CARD[u.cardTier || '']}</button>${v.loan ? '<button class="btn btn-danger" id="mdLiq">강제 청산</button>' : ''}<button class="btn" id="mdCash">예수금 조정</button>${u.role !== 'admin' ? `<button class="btn" id="mdRole">권한: ${ROLE[u.role]}</button>` : ''}<button class="btn ${u.status === 'active' ? 'btn-danger' : 'btn-brand'}" id="mdStat">${u.status === 'active' ? '계정 정지' : '정지 해제'}</button>`,
      onMount: (m, close) => {
        const snaps = (b.snapshots || []).map((s) => [s[0], s[1]]); if (!snaps.length || snaps[snaps.length - 1][0] !== U.today()) snaps.push([U.today(), v.total]);
        setTimeout(() => Chart.line($('#mdLine', m), { points: snaps, color: v.totalPnl >= 0 ? Chart.css('--up') : Chart.css('--down'), labels: true, base: v.principal }), 30);
        const body = () => {
          const el = $('#mdBody', m);
          if (tab === 'hold') el.innerHTML = v.holdings.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>수량</th><th>평균단가</th><th>현재가</th><th>평가금액</th><th>손익</th><th>수익률</th></tr></thead><tbody>${v.holdings.map((h) => `<tr><td><div class="sname"><b>${esc(h.name)}</b><small>${h.code}</small></div></td><td>${n0(h.qty)}</td><td>${px(h.avg, h.currency)}</td><td>${px(h.price, h.currency)}</td><td>${won(h.evalKrw)}</td><td class="${cls(h.pnl)}">${signedWon(h.pnl)}</td><td class="${cls(h.pnl)}">${pct(h.pnlPct)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">보유종목 없음</div>';
          else if (tab === 'fills') { const fs = b.fills.slice().sort((x, y) => y.at.localeCompare(x.at)); const buy = fs.filter((f) => f.side === 'buy').reduce((s, f) => s + f.amount, 0), sell = fs.filter((f) => f.side === 'sell').reduce((s, f) => s + f.amount, 0);
            el.innerHTML = `<div style="padding:12px 20px;font-size:13px" class="muted">매입 합계 <b class="up">${won(buy)}</b> · 매출 합계 <b class="down">${won(sell)}</b> · 실현손익 <b class="${cls(v.realized)}">${signedWon(v.realized)}</b></div>` + (fs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>체결일시</th><th class="l">종목</th><th>구분</th><th>체결가</th><th>수량</th><th>금액</th><th>수수료+세금</th><th>실현손익</th></tr></thead><tbody>${fs.map((f) => `<tr><td class="dim">${U.dt(f.at)}</td><td class="l">${esc(f.name)}</td><td><span class="tag ${f.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${f.side === 'buy' ? '매입' : '매출'}</span></td><td>${px(f.price, f.currency)}</td><td>${n0(f.qty)}</td><td>${won(f.amount)}</td><td>${won(f.fee + f.tax)}</td><td class="${cls(f.pnl)}">${f.side === 'sell' ? signedWon(f.pnl) : '-'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">체결 내역 없음</div>'); }
          else if (tab === 'orders') { const os = b.orders.slice().sort((x, y) => y.createdAt.localeCompare(x.createdAt)); const st = { pending: '미체결', filled: '체결', cancelled: '취소', rejected: '거부' };
            el.innerHTML = os.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>주문일시</th><th class="l">종목</th><th>구분</th><th>유형</th><th>주문가</th><th>수량</th><th>상태</th></tr></thead><tbody>${os.map((o) => `<tr><td class="dim">${U.dt(o.createdAt)}</td><td class="l">${esc(o.name)}</td><td><span class="tag ${o.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${o.side === 'buy' ? '매수' : '매도'}</span></td><td>${o.type === 'market' ? '시장가' : o.type === 'stop' ? '감시' : o.type === 'ext' ? '시간외' : '지정가'}${o.reason ? ' (' + esc(o.reason) + ')' : ''}</td><td>${o.type === 'market' ? '-' : o.type === 'stop' ? px(o.triggerPrice, o.currency) + (o.triggerCond === 'ge' ? ' 이상' : ' 이하') + ' → 시장가' : px(o.price, o.currency)}</td><td>${n0(o.qty)}</td><td>${st[o.status] || o.status}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">주문 내역 없음</div>'; }
          else if (tab === 'login') { el.innerHTML = '<div class="empty">불러오는 중…</div>'; Store.userLogins(uid).then((L) => { if (tab !== 'login') return; el.innerHTML = L.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>접속 일시</th><th>IP</th><th class="l">지역</th><th class="l hide-m">통신사</th><th class="l">기기 · 브라우저</th></tr></thead><tbody>${L.map((l) => `<tr><td class="dim">${U.dt(l.at)}</td><td>${esc(l.ip || '-')}</td><td class="l">${esc(geo(l) || (l.ip ? '확인 중' : '-'))}</td><td class="l hide-m muted">${esc(l.isp || '')}</td><td class="l muted" style="font-size:12px">${esc(device(l.ua))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">접속 기록이 없습니다</div>'; }); }
          else if (tab === 'buff') { const B = b.buffs || []; el.innerHTML = (v.loan ? `<div style="padding:12px 20px">${A.gauge(v)}</div>` : '') + (B.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th>배수</th><th>지원금</th><th>이자율</th><th>청산 기준</th><th>상태</th><th>이자</th><th>종료</th></tr></thead><tbody>${B.map((x) => `<tr><td class="dim">${U.dt(x.createdAt)}</td><td>${x.mult}배</td><td>${won(x.amount)}</td><td>${x.rate}%</td><td>${x.maintain}%</td><td>${A.BST[x.status] || x.status}</td><td>${won(x.status === 'active' ? x.interestNow || 0 : x.interest || 0)}</td><td class="dim">${x.closedAt ? U.dt(x.closedAt) : '-'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">버프 내역이 없습니다</div>'); }
          else { const cs = b.cashflows.slice().sort((x, y) => y.at.localeCompare(x.at)); const st = { pending: ['대기', 'tag-wait'], approved: ['승인', 'tag-ok'], rejected: ['반려', 'tag-sell'], cancelled: ['취소', 'tag-no'] };
            el.innerHTML = cs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th>구분</th><th>금액</th><th class="l">메모</th><th>상태</th><th>처리자</th></tr></thead><tbody>${cs.map((c) => `<tr><td class="dim">${U.dt(c.at)}</td><td><span class="tag ${c.type === 'deposit' ? 'tag-buy' : 'tag-sell'}">${c.type === 'deposit' ? '입금' : '출금'}</span></td><td>${won(c.amount)}</td><td class="l muted">${esc(c.memo || '')}</td><td><span class="tag ${st[c.status][1]}">${st[c.status][0]}</span></td><td class="dim">${esc(c.processedBy || '-')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">입출금 내역 없음</div>'; }
        };
        $('#mdTab', m).onclick = (e) => { const bt = e.target.closest('button'); if (!bt) return; tab = bt.dataset.v; $$('#mdTab button', m).forEach((x) => x.classList.toggle('on', x === bt)); body(); };
        body();
        $('#mdStat', m).onclick = async () => { const to = u.status === 'active' ? 'suspended' : 'active'; if (await U.confirmBox(to === 'suspended' ? '계정 정지' : '정지 해제', `<p>${esc(u.name)} 회원을 ${to === 'suspended' ? '정지' : '정지 해제'}할까요?${to === 'suspended' ? '<br><span class="muted" style="font-size:13px">정지된 회원은 로그인 및 주문이 불가합니다.</span>' : ''}</p>`, '확인', to === 'suspended' ? 'btn-danger' : 'btn-brand')) { await Store.setUserStatus(uid, to); close(); U.toast('처리되었습니다.'); } };
        $('#mdAi', m).onclick = () => grantDlg(u, close);
        { const md = $('#mdDel', m); if (md) md.onclick = () => delDlg([u], close); }
        $('#mdGrade', m).onclick = () => U.modal({ title: '이용자 등급 변경', body: `<p class="muted" style="margin-bottom:10px">${esc(u.name)} · 현재 ${esc(GRADE(u.grade).name)}</p><select class="input" id="gd">${(A.st.grades || []).map((g) => `<option value="${g.id}" ${g.id === (u.grade || 'basic') ? 'selected' : ''}>${esc(g.name)} · 버프 최대 ${g.maxMult}배 · 이자 ${g.rate}% · 청산 ${g.maintain}%</option>`).join('')}</select>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="gdOk">변경</button>', onMount: (m2, c2) => { $('#gdOk', m2).onclick = async () => { try { await Store.setGrade(u.id, $('#gd', m2).value); c2(); close(); U.toast('등급이 변경되었습니다.'); } catch (e) { U.toast(e.message, true); } }; } });
        $('#mdCard', m).onclick = () => U.modal({ title: 'MAX DAY LIFE 카드 등급', body: `<select class="input" id="cd">${Object.entries(CARD).map(([k, n]) => `<option value="${k}" ${k === (u.cardTier || '') ? 'selected' : ''}>${n}</option>`).join('')}</select><p class="dim" style="font-size:12px;margin-top:8px">카드 발급이 확인된 회원의 카드 등급을 연결합니다. 카드 회원은 MAX 리딩 무료 혜택이 표시됩니다.</p>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="cdOk">저장</button>', onMount: (m2, c2) => { $('#cdOk', m2).onclick = async () => { try { await Store.setCardTier(u.id, $('#cd', m2).value); c2(); close(); U.toast('저장되었습니다.'); } catch (e) { U.toast(e.message, true); } }; } });
        const lq = $('#mdLiq', m); if (lq) lq.onclick = async () => { if (!(await U.confirmBox('강제 청산', `<p>${esc(u.name)} 회원의 보유 종목을 전량 시장가 매도하고 버프 지원금 ${won(v.loan)}과 이자 ${won(v.interest)}를 상환합니다.</p><p class="muted" style="font-size:13px;margin-top:6px">현재 담보비율 ${v.ratio.toFixed(1)}% · 되돌릴 수 없습니다.</p>`, '강제 청산', 'btn-danger'))) return; try { await Store.forceLiquidate(u.id); close(); U.toast('청산되었습니다.'); } catch (e) { U.toast(e.message, true); } };
        $('#mdCash', m).onclick = () => U.modal({ title: '예수금 조정', body: `<p class="muted" style="margin-bottom:12px">현재 예수금 ${won(v.cash)} · 양수는 지급, 음수는 차감</p><div class="field"><label>조정 금액</label><input class="input" id="adjA" inputmode="numeric" placeholder="예: 5000000 또는 -1000000"></div><div class="field"><label>사유</label><input class="input" id="adjM" placeholder="예: 이벤트 추가 지급"></div>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="adjOk">적용</button>', onMount: (m2, c2) => { $('#adjOk', m2).onclick = async () => { try { await Store.adjustCash(uid, parseInt($('#adjA', m2).value.replace(/[^0-9-]/g, ''), 10), $('#adjM', m2).value); c2(); close(); U.toast('예수금이 조정되었습니다.'); } catch (e) { U.toast(e.message, true); } }; } });
        const rb = $('#mdRole', m); if (rb) rb.onclick = () => U.modal({ title: '권한 변경', body: `<select class="input" id="rl"><option value="user" ${u.role === 'user' ? 'selected' : ''}>이용자</option><option value="instructor" ${u.role === 'instructor' ? 'selected' : ''}>MAX 리딩 (리딩 작성 가능)</option><option value="admin">관리자</option></select>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="rlOk">변경</button>', onMount: (m2, c2) => { $('#rlOk', m2).onclick = async () => { try { await Store.setUserRole(uid, $('#rl', m2).value); c2(); close(); U.toast('권한이 변경되었습니다.'); } catch (e) { U.toast(e.message, true); } }; } });
      },
    });
  }

  // ═════ 입출금 승인 ═════
  function CashAdm(main) {
    let f = 'pending', ty = 'all';
    main.innerHTML = `${head('입출금 승인 관리', '이용자의 충전(계좌이체·카드·MOA 토큰·USDT·USDC·USD1·MAX 포인트)과 출금 신청을 승인 또는 반려합니다.')}
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
      $('#caL').innerHTML = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th class="l">회원</th><th>구분</th><th>수단</th><th>금액</th><th class="hide-m">현재 예수금</th><th class="l hide-m">메모</th><th>상태</th><th></th></tr></thead><tbody>${rows.map((c) => { const bd = A.bundles.find((b) => b.user.id === c.userId); return `<tr><td class="dim">${U.dt(c.at)}</td><td class="l"><div class="sname"><b>${esc(c.name || '')}</b><small>${esc(c.username || '')}</small></div></td><td><span class="tag ${c.type === 'deposit' ? 'tag-buy' : 'tag-sell'}">${c.type === 'deposit' ? '입금' : '출금'}</span></td><td>${PAYN(c.method)}</td><td><b>${won(c.amount)}</b></td><td class="hide-m">${bd ? won(bd.user.cash) : '-'}</td><td class="l hide-m muted">${esc(c.memo || '')}${c.adminMemo ? ` · <span class="dim">${esc(c.adminMemo)}</span>` : ''}</td><td><span class="tag ${st[c.status][1]}">${st[c.status][0]}</span>${c.processedBy ? `<div class="dim" style="font-size:11px">${esc(c.processedBy)} · ${U.dt(c.processedAt)}</div>` : ''}</td><td>${c.status === 'pending' ? `<button class="btn btn-sm btn-brand" data-ap="${c.id}">승인</button> <button class="btn btn-sm" data-rj="${c.id}">반려</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">해당 신청이 없습니다</div>';
      bindApprove(main);
    }
    data();
    return { data };
  }

  A.BST = { pending: '심사 중', active: '사용 중', rejected: '반려', cancelled: '취소', repaid: '상환 완료', liquidated: '자동 청산' };
  A.gauge = (v) => {
    if (!v || !v.loan) return '';
    const r = v.ratio || 0, mt = v.maintain || 120, warn = A.st.buffWarn || 140; const lo = 100, hi = Math.max(250, r + 20); const pos = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
    const col = r < mt ? 'var(--up)' : r < warn ? 'var(--warn)' : 'var(--ok)';
    return `<div class="gauge"><div class="gbar"><i style="width:${pos(r)}%;background:${col}"></i><em style="left:${pos(mt)}%"></em><em class="w" style="left:${pos(warn)}%"></em></div><div class="glab"><span>청산 ${mt}%</span><span>주의 ${warn}%</span><b style="color:${col}">현재 ${r.toFixed(1)}%</b></div></div>`;
  };

  // ═════ MAX 버프 관리 ═════
  function BuffAdm(main) {
    let f = 'pending';
    main.innerHTML = `${head('MAX 버프 관리', '신용 지원(버프) 신청을 승인·반려하고, 사용 중인 계좌의 담보비율을 실시간으로 관리합니다.')}
      <div class="grid g-4" style="margin-bottom:16px" id="baS"></div>
      <section class="panel"><div class="tabs" id="baT"><button data-v="pending" class="on">심사 대기</button><button data-v="active">사용 중</button><button data-v="closed">종료</button><button data-v="all">전체</button></div><div class="panel-b flush" id="baL"></div></section>`;
    $('#baT').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; f = b.dataset.v; $$('#baT button').forEach((x) => x.classList.toggle('on', x === b)); data(); };
    function liveVal(x) { const bd = A.bundles.find((b) => b.user.id === x.userId); return bd ? val(bd) : null; }
    function data() {
      const B = A.buffs || []; const act = B.filter((x) => x.status === 'active'); const pend = B.filter((x) => x.status === 'pending');
      const danger = act.filter((x) => { const v = liveVal(x); return v && v.ratio != null && v.ratio < (A.st.buffWarn || 140); });
      $('#baS').innerHTML = stat('심사 대기', pend.length + '건', won(pend.reduce((t, x) => t + x.amount, 0)), pend.length ? 'brand' : '') + stat('사용 중', act.length + '건', '지원금 ' + won(act.reduce((t, x) => t + x.amount, 0))) + stat('주의 계좌', danger.length + '건', `담보비율 ${A.st.buffWarn || 140}% 미만`, danger.length ? 'up' : '') + stat('누적 청산', B.filter((x) => x.status === 'liquidated').length + '건', '상환 완료 ' + B.filter((x) => x.status === 'repaid').length + '건');
      const rows = B.filter((x) => f === 'all' || (f === 'closed' ? ['rejected', 'cancelled', 'repaid', 'liquidated'].includes(x.status) : x.status === f));
      $('#baL').innerHTML = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th class="l">이용자</th><th>등급</th><th>배수</th><th>지원금</th><th>이자율</th><th>청산 기준</th><th>담보비율</th><th>상태</th><th class="l hide-m">사유</th><th></th></tr></thead><tbody>${rows.map((x) => { const u = A.users.find((y) => y.id === x.userId) || {}; const v = x.status === 'active' ? liveVal(x) : null; const r = v && v.ratio; return `<tr><td class="dim">${U.dt(x.createdAt)}</td><td class="l"><div class="sname"><b>${esc(x.name || '')}</b><small>${esc(x.username || '')}</small></div></td><td>${esc(GRADE(u.grade).name)}</td><td>${x.mult}배</td><td>${won(x.amount)}</td><td>${x.rate}%</td><td>${x.maintain}%</td><td>${r ? `<b style="color:${r < x.maintain ? 'var(--up)' : r < (A.st.buffWarn || 140) ? 'var(--warn)' : 'var(--ok)'}">${r.toFixed(1)}%</b>` : '-'}</td><td>${A.BST[x.status]}</td><td class="l hide-m muted">${esc(x.memo || '')}${x.adminMemo ? ' · ' + esc(x.adminMemo) : ''}</td><td style="white-space:nowrap">${x.status === 'pending' ? `<button class="btn btn-sm btn-brand" data-ba="${x.id}">승인</button> <button class="btn btn-sm" data-br="${x.id}">반려</button>` : x.status === 'active' ? `<button class="btn btn-sm" data-badj="${x.id}">조정</button> <button class="btn btn-sm btn-danger" data-bl="${x.userId}">강제 청산</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">해당 내역이 없습니다</div>';
      $$('[data-ba]', main).forEach((b) => (b.onclick = () => { const x = B.find((y) => y.id === b.dataset.ba); const bd = A.bundles.find((y) => y.user.id === x.userId); const v = bd ? val(bd) : null;
        U.modal({ title: 'MAX 버프 승인', body: `<dl class="kv" style="margin-bottom:12px"><dt>이용자</dt><dd>${esc(x.name)} (${esc(x.username)})</dd><dt>현재 순자산</dt><dd>${v ? won(v.net) : '-'}</dd><dt>신청 배수</dt><dd>${x.mult}배</dd><dt>이자율 · 청산 기준</dt><dd>${x.rate}% · ${x.maintain}%</dd></dl><div class="field"><label>승인 배수 (조정 가능)</label><select class="input" id="apM">${[0.5, 1, 1.5, 2, 2.5, 3].map((m) => `<option value="${m}" ${m === x.mult ? 'selected' : ''}>${m}배 · ${v ? won(v.net * m) : ''}</option>`).join('')}</select></div><p class="dim" style="font-size:12px">승인 시점의 순자산 × 배수만큼 예수금으로 지급됩니다.</p>`,
          foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="apOk">승인·지급</button>', onMount: (m, close) => { $('#apOk', m).onclick = async () => { try { await Store.processBuff(x.id, true, +$('#apM', m).value); close(); U.toast('승인되어 지급되었습니다.'); } catch (e) { U.toast(e.message, true); } }; } }); }));
      $$('[data-br]', main).forEach((b) => (b.onclick = () => U.modal({ title: 'MAX 버프 반려', body: '<div class="field"><label>반려 사유</label><input class="input" id="rjM" placeholder="예: 거래 실적 부족"></div>', foot: '<button class="btn" data-x>취소</button><button class="btn btn-danger" id="rjOk">반려</button>', onMount: (m, close) => { $('#rjOk', m).onclick = async () => { try { await Store.processBuff(b.dataset.br, false, null, $('#rjM', m).value); close(); U.toast('반려되었습니다.'); } catch (e) { U.toast(e.message, true); } }; } })));
      $$('[data-badj]', main).forEach((b) => (b.onclick = () => { const x = B.find((y) => y.id === b.dataset.badj); U.modal({ title: '버프 조건 조정', body: `<div class="field"><label>청산 기준 담보비율 (%)</label><input class="input" id="adjMt" value="${x.maintain}" inputmode="decimal"></div><div class="field"><label>이자율 (연 %)</label><input class="input" id="adjRt" value="${x.rate}" inputmode="decimal"></div><p class="dim" style="font-size:12px">사용 중인 이 버프에만 바로 적용됩니다.</p>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="adjOk">적용</button>', onMount: (m, close) => { $('#adjOk', m).onclick = async () => { const mt = parseFloat($('#adjMt', m).value), rt = parseFloat($('#adjRt', m).value); if (!(mt >= 100) || !(rt >= 0)) return U.toast('값을 확인하세요. (청산 기준 100% 이상)', true); try { await Store.adjustBuff(x.id, mt, rt); close(); U.toast('조정되었습니다.'); } catch (e) { U.toast(e.message, true); } }; } }); }));
      $$('[data-bl]', main).forEach((b) => (b.onclick = async () => { if (!(await U.confirmBox('강제 청산', '<p>보유 종목을 전량 시장가로 매도하고 지원금과 이자를 상환합니다. 되돌릴 수 없습니다.</p>', '강제 청산', 'btn-danger'))) return; try { await Store.forceLiquidate(b.dataset.bl); U.toast('청산되었습니다.'); } catch (e) { U.toast(e.message, true); } }));
    }
    data();
    let t = 0;
    return { data, tick: () => { if (Date.now() - t > 5000) { t = Date.now(); data(); } } };
  }

  // ═════ 등급 관리 ═════
  function Grades(main) {
    let G = JSON.parse(JSON.stringify(A.st.grades || []));
    main.innerHTML = `${head('등급 관리', '이용자 등급별 MAX 버프 한도·이자율·청산 기준을 정하고, 이용자별 등급을 조정합니다.')}
      <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>등급표</h3><div style="display:flex;gap:8px"><button class="btn btn-sm" id="gAdd">등급 추가</button><button class="btn btn-sm btn-brand" id="gSave">저장</button></div></div><div class="panel-b flush" id="gT"></div></section>
      <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>MAX 버프 공통 설정</h3><button class="btn btn-sm btn-brand" id="bsSave">저장</button></div><div class="panel-b" id="bS"></div></section>
      <section class="panel"><div class="panel-h"><h3>이용자별 등급</h3><input class="input" id="gq" placeholder="닉네임·아이디 검색" style="max-width:220px;height:34px"></div><div class="panel-b flush" id="gU"></div></section>`;
    let q = '';
    function table() {
      $('#gT').innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th class="l">등급 코드</th><th class="l">등급 이름</th><th>버프 최대 배수</th><th>이자율 (연 %)</th><th>청산 기준 (%)</th><th>이용자 수</th><th></th></tr></thead><tbody>${G.map((g, i) => `<tr><td class="l"><input class="input" data-gi="${i}" data-k="id" value="${esc(g.id)}" style="height:32px;width:110px" ${i === 0 ? 'readonly title="기본 등급 코드는 고정"' : ''}></td><td class="l"><input class="input" data-gi="${i}" data-k="name" value="${esc(g.name)}" style="height:32px;width:130px"></td><td><select class="input" data-gi="${i}" data-k="maxMult" style="height:32px">${[0, 1, 2, 3, 4, 5].map((m) => `<option value="${m}" ${+g.maxMult === m ? 'selected' : ''}>${m ? m + '배' : '이용 불가'}</option>`).join('')}</select></td><td><input class="input" data-gi="${i}" data-k="rate" value="${g.rate}" inputmode="decimal" style="height:32px;width:80px;text-align:right"></td><td><input class="input" data-gi="${i}" data-k="maintain" value="${g.maintain}" inputmode="decimal" style="height:32px;width:80px;text-align:right"></td><td>${A.users.filter((u) => (u.grade || 'basic') === g.id && u.role !== 'admin').length}명</td><td>${i ? `<button class="btn btn-sm" data-gdel="${i}">삭제</button>` : ''}</td></tr>`).join('')}</tbody></table></div><p class="dim" style="font-size:12px;padding:10px 16px">청산 기준은 담보비율(총 평가자산 ÷ 지원금·이자)입니다. 바꾼 조건은 새로 신청하는 버프부터 적용되며, 사용 중인 버프는 「MAX 버프 관리」에서 개별 조정합니다.</p>`;
      $$('[data-gi]', main).forEach((el) => (el.onchange = () => { const g = G[+el.dataset.gi]; const k = el.dataset.k; g[k] = ['maxMult', 'rate', 'maintain'].includes(k) ? parseFloat(el.value) || 0 : el.value.trim(); }));
      $$('[data-gdel]', main).forEach((b) => (b.onclick = () => { G.splice(+b.dataset.gdel, 1); table(); }));
    }
    function users() {
      const L = A.users.filter((u) => u.role !== 'admin' && (!q || (u.name + u.username).toLowerCase().includes(q)));
      $('#gU').innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th class="l">이용자</th><th>순자산</th><th>수익률</th><th>체결</th><th>카드</th><th>등급</th></tr></thead><tbody>${L.map((u) => { const bd = A.bundles.find((b) => b.user.id === u.id); const v = bd ? val(bd) : null; return `<tr><td class="l"><div class="sname"><b>${esc(u.name)}</b><small>${esc(u.username)}</small></div></td><td>${v ? won(v.net) : '-'}</td><td class="${v ? cls(v.netPct) : ''}">${v ? pct(v.netPct) : '-'}</td><td>${bd ? bd.fills.length : 0}</td><td><select class="input" data-cu="${u.id}" style="height:30px">${Object.entries(CARD).map(([k, n]) => `<option value="${k}" ${k === (u.cardTier || '') ? 'selected' : ''}>${n}</option>`).join('')}</select></td><td><select class="input" data-gu="${u.id}" style="height:30px">${(A.st.grades || []).map((g) => `<option value="${g.id}" ${g.id === (u.grade || 'basic') ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></td></tr>`; }).join('') || '<tr><td colspan="6"><div class="empty">이용자가 없습니다</div></td></tr>'}</tbody></table></div>`;
      $$('[data-gu]', main).forEach((el) => (el.onchange = async () => { try { await Store.setGrade(el.dataset.gu, el.value); U.toast('등급이 변경되었습니다.'); } catch (e) { U.toast(e.message, true); } }));
      $$('[data-cu]', main).forEach((el) => (el.onchange = async () => { try { await Store.setCardTier(el.dataset.cu, el.value); U.toast('카드 등급이 저장되었습니다.'); } catch (e) { U.toast(e.message, true); } }));
    }
    function bset() {
      const s = A.st;
      $('#bS').innerHTML = `<div class="setting-row"><div><b>MAX 버프 신청 받기</b><small>끄면 신규 신청이 중단됩니다</small></div><label class="switch" style="justify-self:end"><input type="checkbox" id="bEn" ${s.buffEnabled !== false ? 'checked' : ''}><span></span></label></div>
        <div class="setting-row"><div><b>자동 승인</b><small>신청 즉시 지급 (끄면 관리자 승인 후 지급)</small></div><label class="switch" style="justify-self:end"><input type="checkbox" id="bAu" ${s.buffAuto ? 'checked' : ''}><span></span></label></div>
        <div class="setting-row"><div><b>전체 최대 배수</b><small>등급 한도와 별도로 적용되는 상한</small></div><select class="input" id="bMx" style="width:120px">${[1, 2, 3, 4, 5].map((m) => `<option value="${m}" ${+s.buffMaxMult === m ? 'selected' : ''}>${m}배</option>`).join('')}</select></div>
        <div class="setting-row"><div><b>주의 담보비율 (%)</b><small>이 아래로 내려가면 이용자 화면에 경고</small></div><input class="input" id="bWn" value="${s.buffWarn}" inputmode="decimal" style="width:120px;text-align:right"></div>
        <div class="setting-row"><div><b>최소 신청 순자산 (원)</b><small>순자산이 이 금액 이상이어야 신청 가능</small></div><input class="input" id="bMn" value="${s.buffMinNet}" inputmode="numeric" style="width:160px;text-align:right"></div>`;
    }
    $('#gAdd').onclick = () => { if (G.length >= 10) return U.toast('등급은 10개까지 만들 수 있습니다.', true); G.push({ id: 'g' + (G.length + 1), name: '새 등급', maxMult: 1, rate: 8, maintain: 125 }); table(); };
    $('#gSave').onclick = async () => { if (G.some((g) => !g.id || !g.name)) return U.toast('등급 코드와 이름을 입력해 주세요.', true); if (new Set(G.map((g) => g.id)).size !== G.length) return U.toast('등급 코드가 겹칩니다.', true); if (G.some((g) => g.maintain < 100)) return U.toast('청산 기준은 100% 이상이어야 합니다.', true); try { await Store.saveSettings({ grades: G }); U.toast('등급표가 저장되었습니다.'); } catch (e) { U.toast(e.message, true); } };
    $('#bsSave').onclick = async () => { try { await Store.saveSettings({ buffEnabled: $('#bEn').checked, buffAuto: $('#bAu').checked, buffMaxMult: +$('#bMx').value, buffWarn: parseFloat($('#bWn').value) || 140, buffMinNet: parseInt(($('#bMn').value || '0').replace(/[^0-9]/g, ''), 10) || 0 }); U.toast('저장되었습니다.'); } catch (e) { U.toast(e.message, true); } };
    $('#gq').oninput = (e) => { q = e.target.value.trim().toLowerCase(); users(); };
    function data() { G = JSON.parse(JSON.stringify(A.st.grades || [])); table(); users(); bset(); }
    data();
    return { data };
  }

  // ═════ 리딩·공지 ═════
  function LeadAdm(main) {
    main.innerHTML = `${head('리딩·공지 관리', 'MAX 리딩 콘텐츠와 공지를 작성·수정·삭제합니다.', '<div style="display:flex;gap:8px"><button class="btn" id="nN">공지 작성</button><button class="btn btn-brand" id="pN">리딩 작성</button></div>')}
      <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>리딩 게시물</h3></div><div class="panel-b flush" id="lpL"></div></section>
      <section class="panel"><div class="panel-h"><h3>공지</h3></div><div class="panel-b flush" id="lnL"></div></section>`;
    $('#pN').onclick = () => Editors.postEditor(); $('#nN').onclick = () => Editors.noticeEditor();
    function data() {
      const rt = { open: ['진행중', 'tag-wait'], target: ['목표 도달', 'tag-ok'], stop: ['손절', 'tag-sell'], closed: ['종료', 'tag-no'] };
      $('#lpL').innerHTML = A.posts.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>작성일</th><th class="l">제목</th><th>유형</th><th class="l">종목</th><th>결과</th><th>댓글</th><th>반응</th><th></th></tr></thead><tbody>${A.posts.map((p) => { const q = p.code && Market.quote(p.code); return `<tr><td class="dim">${U.dt(p.at)}</td><td class="l" style="white-space:normal;min-width:240px"><b>${esc(p.title)}</b><div class="dim" style="font-size:11px">${esc(p.authorName || '')}</div></td><td>${p.kind === 'trade' ? (p.side === 'sell' ? '매도 시연' : '매수 시연') : '해설'}</td><td class="l">${q ? esc(q.name) : '-'}</td><td>${p.kind === 'trade' ? `<span class="tag ${(rt[p.result] || rt.open)[1]}">${(rt[p.result] || rt.open)[0]}</span>${p.resultPct ? ` <span class="${cls(p.resultPct)}">${pct(p.resultPct)}</span>` : ''}` : '-'}</td><td>${p.comments.length}</td><td>${p.likes.length}</td><td><button class="btn btn-sm" data-e="${p.id}">수정</button> <button class="btn btn-sm btn-danger" data-d="${p.id}">삭제</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">게시물이 없습니다</div>';
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
          <div class="setting-row"><div><b>실제 장 운영시간 적용</b><small>켜면 정규장(국내 09:00~15:20 · 미국 뉴욕 09:30~16:00)에만 시장가·지정가가 체결되고, 장외에는 지정가 예약 · 시간외(장전/장후 종가 · 단일가 · 프리/애프터마켓) 주문만 가능합니다. 끄면 24시간 마지막 시세로 체결합니다.</small></div><label class="switch" style="justify-self:end"><input type="checkbox" data-b="enforceHours" ${s.enforceHours ? 'checked' : ''}><span></span></label></div>
          <div class="setting-row" style="grid-template-columns:1fr"><div><b>국내 휴장일</b><small>이 날짜에는 국내 주식 거래가 열리지 않습니다. YYYY-MM-DD 형식으로 한 줄에 하나씩 입력하세요.</small></div><textarea class="input" id="hol" rows="4" style="margin-top:8px;font-family:inherit">${(s.krHolidays || []).join('\n')}</textarea><button class="btn btn-sm" id="holSave" style="margin-top:8px;justify-self:start">휴장일 저장</button></div>
          <div class="setting-row"><div><b>신규 회원가입 허용</b><small>끄면 관리자가 만든 계정만 사용</small></div><label class="switch" style="justify-self:end"><input type="checkbox" data-b="allowSignup" ${s.allowSignup ? 'checked' : ''}><span></span></label></div>
        </div></section>
        <section class="panel"><div class="panel-h"><h3>충전 수단 (MOA · 코인 · 포인트)</h3></div><div class="panel-b">
          ${[['cash', '계좌이체', '원화 입금'], ['card', '카드 결제', '신용·체크카드'], ['moa', 'MOA 토큰', 'MOA Card 지갑'], ['usdt', 'USDT', 'BNB·TRON·Solana'], ['usdc', 'USDC', 'BNB·Solana'], ['usd1', 'USD1', 'WLFI 스테이블코인'], ['maxp', 'MAX 포인트', 'MAX DAY LIFE 적립 포인트']].map(([k, n, d]) => `<div class="setting-row"><div><b>${n}</b><small>${d}</small></div><label class="switch" style="justify-self:end"><input type="checkbox" data-pm="${k}" ${(s.payMethods || {})[k] !== false ? 'checked' : ''}><span></span></label></div>`).join('')}
          <div class="setting-row"><div><b>MOA 토큰 원화 가격</b><small>0 이면 "시세 연동 예정"으로 표시 · 원화 기준 신청</small></div><input class="input" data-k="moaKrw" value="${s.moaKrw || 0}" inputmode="decimal" style="text-align:right"></div>
          <div class="setting-row"><div><b>MAX 포인트 1P 가치 (원)</b><small>충전 시 포인트 환산 기준</small></div><input class="input" data-k="maxpKrw" value="${s.maxpKrw || 1}" inputmode="decimal" style="text-align:right"></div>
        </div></section>
        <section class="panel"><div class="panel-h"><h3>데이터</h3></div><div class="panel-b">
          <p class="muted" style="font-size:13px;margin-bottom:12px">현재 모드: <b style="color:var(--text)">${Store.mode === 'local' ? '데모 모드 (브라우저 저장)' : '운영 모드 (서버 DB)'}</b>${Store.mode === 'local' ? '<br>여러 기기에서 회원 데이터를 공유하려면 server/ 폴더를 PHP 서버에 올리고 config.js 의 API_BASE 를 설정하세요.' : ''}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="exp">전체 데이터 백업 (JSON)</button>${Store.mode === 'local' ? '<button class="btn btn-danger" id="rst">데모 데이터 초기화</button>' : ''}</div>
          ${A.stats && A.stats.audit && A.stats.audit.length ? `<div class="divider"></div><b style="font-size:13px">최근 관리자 작업</b><div style="max-height:180px;overflow:auto;margin-top:8px;font-size:12px" class="muted">${A.stats.audit.slice().reverse().slice(0, 30).map((a) => `<div>${U.dt(a.at)} · ${esc(a.by)} · ${esc(a.action)} ${esc(a.detail || '').slice(0, 80)}</div>`).join('')}</div>` : ''}
        </div></section>`;
      $$('[data-k]', main).forEach((i) => (i.onchange = async () => { const v = parseFloat(i.value.replace(/,/g, '')); if (!(v >= 0)) return U.toast('값을 확인하세요.', true); await Store.saveSettings({ [i.dataset.k]: v }); U.toast('저장되었습니다.'); }));
      { const hs = $('#holSave'); if (hs) hs.onclick = async () => { const L = $('#hol').value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean); const bad = L.filter((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x)); if (bad.length) return U.toast('날짜 형식을 확인하세요: ' + bad[0], true); try { await Store.saveSettings({ krHolidays: L }); Market.setHolidays(L); U.toast('휴장일을 저장했습니다.'); } catch (e) { U.toast(e.message, true); } }; }
      $$('[data-b]', main).forEach((c) => (c.onchange = async () => { await Store.saveSettings({ [c.dataset.b]: c.checked }); U.toast('저장되었습니다.'); }));
      $$('[data-pm]', main).forEach((c) => (c.onchange = async () => { const pm = { ...(A.st.payMethods || {}) }; pm[c.dataset.pm] = c.checked; await Store.saveSettings({ payMethods: pm }); U.toast('저장되었습니다.'); }));
      $('#exp').onclick = async () => { const j = await Store.exportDB(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([typeof j === 'string' ? j : JSON.stringify(j)], { type: 'application/json' })); a.download = `maxlife-backup-${U.today()}.json`; a.click(); };
      const r = $('#rst'); if (r) r.onclick = async () => { if (await U.confirmBox('데모 초기화', '<p>모든 회원·거래 데이터를 지우고 데모 데이터로 다시 시작합니다.</p>', '초기화', 'btn-danger')) { await Store.resetDemo(); location.href = 'admin.html'; } };
    }
    data();
    return { data };
  }

  boot().catch((e) => { console.error(e); root.innerHTML = `<div class="empty" style="padding:80px 20px">관리자 화면을 시작하지 못했습니다: ${esc(e.message)}</div>`; });
})();
