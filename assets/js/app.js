// MAX라이프 주식 — 사용자 앱 (HTS/MTS 반응형 SPA)
(() => {
  const { $, $$, esc, won, n0, px, pxu, pct, signed, signedWon, cls, compact, ICON } = U;
  const S = { user: null, d: null, st: null, v: null, page: null, route: '', posts: [], notices: [] };
  const root = document.getElementById('app');

  // ── 테마 ──
  const theme = { get: () => localStorage.getItem('mls.theme') || 'dark', set(t) { localStorage.setItem('mls.theme', t); document.documentElement.dataset.theme = t; } };
  theme.set(theme.get());

  // ── 충전 수단 ──
  const PAY = [{ k: 'cash', n: '계좌이체', d: '원화 입금' }, { k: 'card', n: '카드 결제', d: '신용·체크카드' }, { k: 'moa', n: 'MOA 토큰', d: 'MOA Card 지갑' }, { k: 'usdt', n: 'USDT', d: '테더 · BNB·TRON·Solana' }, { k: 'usdc', n: 'USDC', d: 'USD 코인 · BNB·Solana' }, { k: 'usd1', n: 'USD1', d: 'WLFI 스테이블코인' }, { k: 'maxp', n: 'MAX 포인트', d: 'MAX DAY LIFE 적립 포인트' }];
  const PAYN = (k) => (PAY.find((m) => m.k === (k || 'cash')) || PAY[0]).n;
  const GRADE = (id) => ((S.st && S.st.grades) || []).find((g) => g.id === (id || 'basic')) || { id: 'basic', name: '일반', maxMult: 1, rate: 9, maintain: 130 };
  const CARD = { white: '화이트', blue: '블루', red: '레드', black: '블랙' };

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

  // ── 알림센터 (체결·입출금·버프·문의 답변·쪽지·공지) ──
  const Notif = {
    key: () => 'mls.seen.' + (S.user ? S.user.id : ''),
    seen() { try { return localStorage.getItem(this.key()) || ''; } catch { return ''; } },
    mark() { try { localStorage.setItem(this.key(), new Date().toISOString()); } catch {} },
    list() {
      if (!S.d) return [];
      const E = [];
      for (const f of S.d.fills || []) E.push({ at: f.at, t: '체결', m: `${f.name} ${f.side === 'buy' ? '매수' : '매도'} ${n0(f.qty)}주 @ ${px(f.price, f.currency)}`, go: '#/history' });
      for (const c of S.d.cashflows || []) if (c.processedAt && c.status !== 'cancelled') E.push({ at: c.processedAt, t: c.type === 'deposit' ? '입금' : '출금', m: `${won(c.amount)} ${c.type === 'deposit' ? '입금' : '출금'} ${c.status === 'approved' ? '승인' : '반려'}${c.adminMemo ? ' · ' + c.adminMemo : ''}`, go: '#/my/cash', bad: c.status === 'rejected' });
      for (const b of S.d.buffs || []) { if (b.approvedAt) E.push({ at: b.approvedAt, t: 'MAX 버프', m: `${b.mult}배 승인 · ${won(b.amount)} 지급`, go: '#/buff' }); if (b.closedAt && b.status !== 'cancelled') E.push({ at: b.closedAt, t: 'MAX 버프', m: b.status === 'liquidated' ? '담보비율 미달로 자동 청산되었습니다' : b.status === 'repaid' ? '상환 완료' : b.status === 'rejected' ? '신청 반려' + (b.adminMemo ? ' · ' + b.adminMemo : '') : b.status, go: '#/buff', bad: b.status === 'liquidated' || b.status === 'rejected' }); }
      for (const q of S.d.inquiries || []) if (q.answeredAt) E.push({ at: q.answeredAt, t: q.fromAdmin ? '쪽지' : '문의 답변', m: q.title, go: '#/help' });
      for (const n of S.notices || []) E.push({ at: n.at, t: '공지', m: n.title, go: '#/lead' });
      return E.filter((e) => e.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
    },
    render() {
      const L = this.list(); const sn = this.seen(); const un = L.filter((e) => e.at > sn).length;
      const bn = $('#bellN'); if (bn) { bn.hidden = !un; bn.textContent = un > 9 ? '9+' : un; } try { window.mlsApp && window.mlsApp.badge(un); } catch {}
      const pop = $('#notifPop'); if (pop && !pop.classList.contains('hidden')) pop.innerHTML = `<div class="np-h"><b>알림</b><a href="#/help">고객센터</a></div>${L.map((e) => `<a class="np-i ${e.at > sn ? 'new' : ''}" href="${e.go}"><span class="tag ${e.bad ? 'tag-sell' : 'tag-no'}">${e.t}</span><span class="np-m">${esc(e.m)}</span><small>${U.ago(e.at)}</small></a>`).join('') || '<div class="empty">알림이 없습니다</div>'}`;
    },
  };
  document.addEventListener('click', (e) => {
    const bb = e.target.closest('#bellBtn'); const pop = $('#notifPop'); if (!pop) return;
    if (bb) { pop.classList.toggle('hidden'); Notif.render(); if (!pop.classList.contains('hidden')) setTimeout(() => { Notif.mark(); const bn = $('#bellN'); if (bn) bn.hidden = true; }, 1500); return; }
    if (!e.target.closest('#notifPop') || e.target.closest('a')) pop.classList.add('hidden');
  });

  // ── 부트 ──
  async function boot() {
    root.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center">${U.logo()}</div>`;
    await Market.init({});
    await Store.init();
    S.st = await Store.settings();
    Market.setOverrides(S.st.overrides);
    S.user = await Store.current();
    if (!S.user) return renderAuth(/[?&#]ref=/.test(location.href) ? 'signup' : 'login');
    if (S.user.status === 'suspended') { await Store.logout(); U.toast('정지된 계정입니다.', true); return renderAuth(); }
    await reload();
    renderShell(); Voice.btn(); Market.setHolidays(S.st.krHolidays);
    // 실시간 시세: 보고 있는 종목 + 관심종목 + 보유종목 + (홈·시세 화면) 거래대금 상위
    Market.setLiveProvider(() => {
      const m = location.hash.match(/#\/(?:stock|ai\/analyze)\/([0-9A-Z]{6})/); const L = [];
      if (m) L.push(m[1]); if (S.v) L.push(...S.v.holdings.map((h) => h.code)); L.push(...(S.user.watch || []));
      if (!m) L.push(...Market.list().filter((q) => q.currency === 'KRW').sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 20).map((q) => q.code));
      return L;
    });
    window.addEventListener('hashchange', route);
    route();
    window.MLSX && MLSX.boot();
    if (window.MLSGuard) { const g = S.st.guard || {}; MLSGuard.apply(g); if (g.mark !== false) MLSGuard.mark(`${S.user.name} · ${S.user.username.slice(0, 3)}***`); }
    Market.on('update', onMarket);
    setInterval(() => { if (!document.hidden || Store.mode === 'server') onMarket(); }, 15000);
    if (S.user.role === 'admin' && Store.mode === 'server') StaffPoll.start();
    Store.on('change', async () => { await reload(); S.page && S.page.data && S.page.data(); });
  }
  async function reload() {
    S.d = await Store.me(); S.user = S.d.user; S.st = await Store.settings();
    S.v = Engine.valuate(S.d, S.st);
    [S.posts, S.notices] = await Promise.all([Store.posts(), Store.notices()]);
  }
  const seenFill = new Set();
  let lastMatch = 0, snapDone = false, lastSync = Date.now(), lastWarn = 0;
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
      for (const f of mine.filter((x) => !seenFill.has(x.id) && seenFill.add(x.id))) U.toast(`[체결] ${f.name} ${f.side === 'buy' ? '매수' : '매도'} ${n0(f.qty)}주 @ ${px(f.price, f.currency)}`);
      if (mine.length) { await reload(); S.page && S.page.data && S.page.data(); }
    }
    if (Store.mode === 'server' && Date.now() - lastSync > 12000) {
      lastSync = Date.now();
      const before = { fills: S.d.fills.length, buff: (S.d.buffs || []).map((b) => b.status).join() , cash: (S.d.cashflows || []).map((c) => c.status).join(), inq: (S.d.inquiries || []).filter((q) => q.answeredAt).map((q) => q.id + q.answeredAt).join() };
      await reload();
      const nf = S.d.fills.length - before.fills;
      if (nf > 0) for (const f of S.d.fills.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, nf).filter((x) => !seenFill.has(x.id) && seenFill.add(x.id))) Voice.say(`${f.name} ${n0(f.qty)}주 ${f.side === 'buy' ? '매수' : '매도'} 체결되었습니다.`), appNotify('체결', `${f.name} ${f.side === 'buy' ? '매수' : '매도'} ${n0(f.qty)}주 @ ${px(f.price, f.currency)}`), U.toast(`[체결] ${f.name} ${f.side === 'buy' ? '매수' : '매도'} ${n0(f.qty)}주 @ ${px(f.price, f.currency)}`);
      const nb = (S.d.buffs || []).map((b) => b.status).join();
      if (nb !== before.buff) { const b = (S.d.buffs || [])[0]; if (b) Voice.say(b.status === 'active' ? 'MAX 버프가 승인되었습니다.' : b.status === 'liquidated' ? '담보비율 부족으로 자동 청산되었습니다.' : b.status === 'rejected' ? 'MAX 버프 신청이 반려되었습니다.' : ''); if (b) U.toast(b.status === 'active' ? `MAX 버프 ${b.mult}배가 승인되어 ${won(b.amount)}이 지급되었습니다.` : b.status === 'liquidated' ? 'MAX 버프 담보비율이 기준 아래로 내려가 자동 청산되었습니다.' : b.status === 'rejected' ? 'MAX 버프 신청이 반려되었습니다.' : 'MAX 버프 상태가 변경되었습니다.', b.status === 'liquidated' || b.status === 'rejected'); }
      const nc = (S.d.cashflows || []).map((c) => c.status).join() !== before.cash; if (nc) { const c = (S.d.cashflows || []).filter((x) => x.processedAt).sort((a, b) => b.processedAt.localeCompare(a.processedAt))[0]; const m = c ? `${c.type === 'deposit' ? '입금' : '출금'} 신청이 ${c.status === 'approved' ? '승인' : '반려'}되었습니다.` : '입출금 신청이 처리되었습니다.'; U.toast(m); Voice.say(m); appNotify('입출금', m); }
      const ni = (S.d.inquiries || []).filter((q) => q.answeredAt).map((q) => q.id + q.answeredAt).join() !== before.inq;
      if (ni) { const q = (S.d.inquiries || []).filter((x) => x.answeredAt).sort((a, b) => b.answeredAt.localeCompare(a.answeredAt))[0]; if (q) { U.toast(q.fromAdmin ? `[쪽지] ${q.title}` : `[문의 답변] ${q.title}`); Voice.say(q.fromAdmin ? '새 쪽지가 도착했습니다.' : '문의에 답변이 등록되었습니다.'); appNotify(q.fromAdmin ? '쪽지' : '문의 답변', q.title); } }
      { const ps = AI.st && AI.st.planName; const ns = await AI.status(true); if (ps && ns && ns.planName !== ps && ns.source !== 'free') { const m = `MAX AI ${ns.planName} 구독이 시작되었습니다.`; U.toast(m); Voice.say(m); appNotify('AI 구독', m); chime(); } }
      if (nf > 0 || nb !== before.buff || nc || ni) chime();
      S.v = Engine.valuate(S.d, S.st);
      if (nf > 0 || nb !== before.buff || nc || ni) { S.page && S.page.data && S.page.data(); }
    }
    if (S.v.loan && S.v.ratio < (S.st.buffWarn || 140) && Date.now() - lastWarn > 600000) { lastWarn = Date.now(); U.toast(`담보비율 주의 · 현재 ${S.v.ratio.toFixed(1)}% (청산 기준 ${S.v.maintain}%)`, true); }
    if (!snapDone) { snapDone = true; Store.recordSnapshot(S.v.net); }
  }

  // 관리자 계정으로 사용자 화면을 보고 있을 때도 처리 요청 알림 (띵동)
  const StaffPoll = {
    seen: null,
    async tick() {
      let d; try { d = await Store.adminPoll(); } catch { return; } if (!d) return;
      const key = (x) => x.id || x.userId; const cur = {};
      const ev = [];
      for (const [k, t, f, go] of [['cash', '입출금 신청', (x) => `${x.name} · ${x.type === 'deposit' ? '입금' : '출금'} ${won(x.amount)}`, 'cash'], ['buffs', 'MAX 버프 신청', (x) => `${x.name} · ${x.mult}배 ${won(x.amount)}`, 'buffs'], ['inquiries', '1:1 문의', (x) => `${x.name} · ${x.title}`, 'inq'], ['signups', '신규 가입', (x) => `${x.name} (${x.username})`, 'members'], ['liquidations', '자동 청산', (x) => `${x.name} · ${won(x.amount)}`, 'buffs'], ['danger', '담보비율 경고', (x) => `${x.name} · ${Number(x.ratio).toFixed(1)}%`, 'buffs']]) {
        cur[k] = (d[k] || []).map(key);
        if (this.seen) for (const x of d[k] || []) if (!this.seen[k].includes(key(x))) ev.push([t, f(x), go, k]);
      }
      this.seen = cur;
      const n = (d.cash || []).length + (d.buffs || []).length + (d.inquiries || []).length;
      const ab = $('#admLink'); if (ab) { ab.querySelector('.nbdg').hidden = !n; ab.querySelector('.nbdg').textContent = n; }
      if (!ev.length) return;
      appNotify('[관리자] ' + ev[0][0], ev[0][1]); chime(true); Voice.say(ev.length > 1 ? `관리자 알림 ${ev.length}건. ${ev[0][0]}.` : `관리자 알림. ${ev[0][0]}이 들어왔습니다.`);
      for (const [t, m, go] of ev.slice(0, 3)) {
        let w = $('#aToasts'); if (!w) { w = document.createElement('div'); w.id = 'aToasts'; w.className = 'adm-toasts'; document.body.appendChild(w); }
        const e = document.createElement('a'); e.className = 'adm-toast'; e.href = 'admin.html#/' + go; e.innerHTML = `<span class="ic">${ICON.bell}</span><div><b>[관리자] ${esc(t)}</b><p>${esc(m)}</p></div>`;
        w.prepend(e); setTimeout(() => e.remove(), 10000);
      }
    },
    start() { this.tick(); setInterval(() => this.tick(), 10000); },
  };
  const appNotify = (t, b) => { try { if (window.mlsApp) window.mlsApp.notify(t, b); else if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(t, { body: b }); } catch {} };
  // 음성 안내 (주문 접수·체결·입출금·버프·문의 답변)
  const Voice = {
    on() { try { return localStorage.getItem('mls.voice') !== '0'; } catch { return true; } },
    set(v) { try { localStorage.setItem('mls.voice', v ? '1' : '0'); } catch {} this.btn(); },
    voice: null,
    pick() { if (this.voice || !window.speechSynthesis) return this.voice; const vs = speechSynthesis.getVoices(); this.voice = vs.find((v) => /ko(-|_)KR/i.test(v.lang) && /google|yuna|heami|sunhi/i.test(v.name)) || vs.find((v) => /^ko/i.test(v.lang)) || null; return this.voice; },
    say(text) {
      if (!this.on() || !window.speechSynthesis || !text) return;
      try { const u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; const v = this.pick(); if (v) u.voice = v; u.rate = 1.05; u.volume = 1; speechSynthesis.speak(u); } catch {}
    },
    btn() { const b = $('#voiceBtn'); if (!b) return; const on = this.on(); b.innerHTML = on ? VOICE_ON : VOICE_OFF; b.title = on ? '음성 안내 켜짐 (클릭하면 끄기)' : '음성 안내 꺼짐 (클릭하면 켜기)'; b.classList.toggle('muted-ic', !on); },
  };
  const VOICE_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
  const VOICE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/></svg>';
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { Voice.voice = null; Voice.pick(); };
  document.addEventListener('click', (e) => { if (e.target.closest('#voiceBtn')) { const on = !Voice.on(); Voice.set(on); if (on) Voice.say('음성 안내를 켰습니다.'); else { try { speechSynthesis.cancel(); } catch {} U.toast('음성 안내를 껐습니다.'); } } });

  function chime(staff) {
    try { if (localStorage.getItem('mls.snd') === '0') return; const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const ac = chime.ac || (chime.ac = new C()); if (ac.state === 'suspended') return;
      (staff ? [[1318.5, 0], [987.8, 0.25]] : [[1046.5, 0], [1568, 0.15]]).forEach(([f, t]) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; const t0 = ac.currentTime + t; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6); o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + 0.7); });
    } catch {}
  }
  document.addEventListener('pointerdown', () => { try { const C = window.AudioContext || window.webkitAudioContext; if (C && !chime.ac) chime.ac = new C(); chime.ac && chime.ac.state === 'suspended' && chime.ac.resume(); } catch {} }, { once: false, passive: true });

  // 계좌번호: 회원 ID로 고정 생성 (예: 7012-3456-78)
  function acctNo(id) { let h = 2166136261; for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } const d = String(h).padStart(10, '0').slice(-8); return `70${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 8)}`; }

  // 확장 모듈(코인 선물·스테이킹)에서 쓰는 공용 함수
  window.MLS = { get S() { return S; }, head: (...a) => head(...a), Voice: { say: (t) => Voice.say(t) }, chime: () => chime(), notify: (t, b) => appNotify(t, b), reload: () => reload(), bindSearch: (...a) => bindSearch(...a) };

  // ═════════ 단축키 ═════════
  const IS_APP = /MAXLifeHTS/i.test(navigator.userAgent);
  const KEYS = [
    ['공통', [
      ['F1 / ?', '단축키 안내'], ['Ctrl + K / /', '종목 검색'], ['Esc', '창·팝업 닫기, 입력 취소'],
      ['Alt + 1', '홈'], ['Alt + 2', '시세·순위'], ['Alt + 3', '조건검색'], ['Alt + 4', '관심종목'], ['Alt + 5', '종목·주문'],
      ['Alt + 6', '잔고'], ['Alt + 7', '거래내역'], ['Alt + 8', '입출금'], ['Alt + 9', 'MAX 버프'], ['Alt + 0', '마이페이지'],
      ['Alt + A', 'MAX AI 분석'], ['Alt + N', '알림센터'], ['Alt + V', '음성 안내 켜기/끄기'], ['Alt + L', '다크·화이트 전환'], ['Alt + X', '미체결 전체 취소'],
    ]],
    ['주문 화면', [
      ['F2', '매수 (수량 입력으로 이동)'], ['F3', '매도 (수량 입력으로 이동)'], ['F4', '지정가'], ['F6', '시장가'], ['F7', '감시주문'], ['F8', '시간외'], ['F9', '시장가 매수 (코인 선물: 롱)'], ['F10', '시장가 매도 (코인 선물: 숏)'],
      ['Ctrl + Enter', '주문 실행'], ['Alt + ↑ / ↓', '가격 한 호가 올림·내림'], ['Shift + ↑ / ↓', '수량 1주 늘림·줄임'],
      ['Alt + Q / W / E / R', '수량 10% · 25% · 50% · 최대'], ['Alt + S', '관심종목 추가·해제'],
    ]],
    ['차트 · 하단 탭', [
      ['Shift + 1 / 2 / 3 / 4', '분봉 · 일봉 · 주봉 · 월봉'], ['Shift + A', 'AI 분석 탭'], ['Shift + O', '미체결'], ['Shift + P', '보유현황'], ['Shift + F', '체결내역'], ['Shift + I', '종목정보'],
    ]],
    ...(IS_APP ? [['PC 프로그램 전용', [['Ctrl + N', '새 창 (차트·주문을 여러 창으로)'], ['Ctrl + R / F5', '새로고침'], ['Ctrl + 0 / + / −', '화면 크기 원래대로·확대·축소'], ['F11', '전체 화면'], ['Ctrl + W', '창 닫기 (프로그램은 트레이에 남음)']]]] : []),
  ];
  function keyGuide() {
    U.modal({ title: '단축키 안내', size: 'lg', body: `<p class="muted" style="margin-top:0">${IS_APP ? 'PC 프로그램' : '웹'}에서 바로 쓸 수 있습니다. 입력칸에 커서가 있을 때는 F키·Ctrl·Alt 조합만 동작합니다.</p><div class="key-grid">${KEYS.map(([g, L]) => `<section><h4>${g}</h4>${L.map(([k, d]) => `<div class="key-row"><span>${k.split(' / ').map((x) => x.split(' + ').map((y) => `<kbd>${y}</kbd>`).join('+')).join(' <i>또는</i> ')}</span><b>${d}</b></div>`).join('')}</section>`).join('')}</div>${IS_APP ? '' : '<div class="key-app"><b>PC 프로그램</b>을 설치하면 창 여러 개 띄우기, 트레이 알림, 자동 업데이트를 쓸 수 있습니다. <a class="btn btn-sm btn-brand" href="#/download">PC 프로그램 받기</a></div>'}` });
  }
  const NAVKEY = { 1: '#/home', 2: '#/market', 3: '#/screen', 4: '#/watch', 5: null, 6: '#/balance', 7: '#/history', 8: '#/cash', 9: '#/buff', 0: '#/my' };
  document.addEventListener('keydown', async (e) => {
    if (!S.user || !$('#main')) return;
    const t = e.target; const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const K = S.page && S.page.keys; const k = e.key; const modal = $('.modal-bg');
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'F1' || (!typing && k === '?')) { stop(); if (!modal) keyGuide(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'k' || k === 'K')) { stop(); $('#q') && $('#q').focus(); return; }
    if (!typing && k === '/') { stop(); $('#q') && $('#q').focus(); return; }
    if (k === 'Escape') { const np = $('#notifPop'); if (np && !np.classList.contains('hidden')) np.classList.add('hidden'); if (typing && t.id === 'q') { t.value = ''; t.blur(); $('#qr') && $('#qr').classList.add('hidden'); } return; }
    if (modal) return;
    if (e.altKey && !e.ctrlKey && /^Digit\d$/.test(e.code)) { stop(); const n = e.code.slice(5); location.hash = NAVKEY[n] || '#/stock/' + ((K && K.code) || (S.user.watch || [])[0] || '005930'); return; }
    if (e.altKey && !e.ctrlKey) {
      const c = e.code;
      if (c === 'KeyN') { stop(); $('#bellBtn') && $('#bellBtn').click(); return; }
      if (c === 'KeyA') { stop(); location.hash = K && K.code ? '#/ai/analyze/' + K.code : '#/ai'; return; }
      if (c === 'KeyV') { stop(); $('#voiceBtn') && $('#voiceBtn').click(); return; }
      if (c === 'KeyL') { stop(); $('#themeBtn') && $('#themeBtn').click(); return; }
      if (c === 'KeyX') { stop(); const os = (S.d.orders || []).filter((o) => o.status === 'pending'); if (!os.length) return U.toast('미체결 주문이 없습니다.'); if (await U.confirmBox('미체결 전체 취소', `미체결 주문 ${os.length}건을 모두 취소할까요?`, '전체 취소', 'btn-danger')) { let n = 0; for (const o of os) { try { await Store.cancelOrder(o.id); n++; } catch {} } U.toast(`${n}건 취소되었습니다.`); Voice.say(`미체결 주문 ${n}건이 취소되었습니다.`); } return; }
      if (K) {
        if (c === 'ArrowUp') { stop(); K.price(1); return; } if (c === 'ArrowDown') { stop(); K.price(-1); return; }
        const P = { KeyQ: 0.1, KeyW: 0.25, KeyE: 0.5, KeyR: 1 }; if (P[c]) { stop(); K.pct(P[c]); return; }
        if (c === 'KeyS') { stop(); K.star(); return; }
      }
    }
    if (!K) return;
    const F = { F2: () => K.side('buy'), F3: () => K.side('sell'), F4: () => K.type('limit'), F6: () => K.type('market'), F7: () => K.type('stop'), F8: () => K.type('ext'), F9: () => K.quick && K.quick('buy'), F10: () => K.quick && K.quick('sell') };
    if (F[k]) { stop(); F[k](); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'Enter') { stop(); K.submit(); return; }
    if (e.shiftKey && !e.altKey && !e.ctrlKey) {
      if (k === 'ArrowUp') { stop(); K.qty(1); return; } if (k === 'ArrowDown') { stop(); K.qty(-1); return; }
      if (typing) return;
      const TF = { Digit1: 'm', Digit2: 'D', Digit3: 'W', Digit4: 'M' }; if (TF[e.code]) { stop(); K.tf(TF[e.code]); return; }
      const TB = { KeyA: 'ai', KeyO: 'open', KeyP: 'pos', KeyF: 'fills', KeyI: 'info' }; if (TB[e.code]) { stop(); K.tab(TB[e.code]); return; }
    }
  }, true);
  if (IS_APP) document.documentElement.classList.add('is-app');

  // ═════════ PC 프로그램 다운로드 ═════════
  const REL = 'https://github.com/whaleguard/maxlife-stock/releases/latest/download/';
  function Download(main) {
    const ua = navigator.userAgent; const mac = /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua);
    main.innerHTML = `${head('PC 프로그램', '웹 버전과 똑같은 계좌·주문·잔고를 PC 설치 프로그램으로 씁니다. 한쪽에서 주문하면 다른 쪽에도 바로 반영됩니다.')}
      ${IS_APP ? `<section class="panel" style="margin-bottom:16px"><div class="panel-b"><b>지금 PC 프로그램으로 실행 중입니다.</b> <span class="muted">새 버전이 나오면 자동으로 업데이트됩니다.</span></div></section>` : ''}
      <div class="grid g-2 stack" style="margin-bottom:16px">
        <section class="panel dl-card ${!mac ? 'pri' : ''}"><div class="panel-b"><div class="dl-os">Windows</div><p class="muted">Windows 10 · 11 (64비트)</p><a class="btn btn-brand btn-block btn-lg" href="${REL}MAXLife-Stock-Setup.exe">${ICON.download || ''} Windows용 내려받기 (.exe)</a><a class="dim dl-alt" href="${REL}MAXLife-Stock-Portable.exe">설치 없이 실행하는 휴대용 버전</a></div></section>
        <section class="panel dl-card ${mac ? 'pri' : ''}"><div class="panel-b"><div class="dl-os">macOS</div><p class="muted">macOS 11 이상 · Apple Silicon(M1~M4) · Intel</p><a class="btn btn-block btn-lg ${mac ? 'btn-brand' : ''}" href="${REL}MAXLife-Stock-mac-arm64.dmg">Apple Silicon용 (.dmg)</a><a class="dim dl-alt" href="${REL}MAXLife-Stock-mac-x64.dmg">Intel Mac용</a><p class="dim" style="font-size:12px;margin:10px 0 0">처음 실행할 때 "확인되지 않은 개발자" 안내가 뜨면 앱을 우클릭 → 열기를 누르세요.</p></div></section>
      </div>
      <div class="grid g-2 stack">
        <section class="panel"><div class="panel-h"><h3>웹 버전 vs PC 프로그램</h3></div><div class="table-wrap"><table class="t"><thead><tr><th class="l">기능</th><th>웹</th><th>PC 프로그램</th></tr></thead><tbody>${[['국내·미국 전 종목 실시세 매매', 1, 1], ['계좌·잔고·주문 실시간 연동', 1, 1], ['단축키 (F2 매수 · F3 매도 등)', 1, 1], ['체결·알림 음성 안내', 1, 1], ['창 여러 개 (차트·주문 분리, 모니터 여러 대)', 0, 1], ['트레이 상주 · 윈도우 알림', 0, 1], ['자동 로그인 · 자동 업데이트', '△', 1], ['설치 없이 휴대폰·태블릿 사용', 1, 0]].map(([n, a, b]) => `<tr><td class="l">${n}</td><td>${a === 1 ? '<span class="brand">●</span>' : a || '-'}</td><td>${b === 1 ? '<span class="brand">●</span>' : b || '-'}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="panel"><div class="panel-h"><h3>설치 방법</h3><button class="btn btn-sm" id="dlKeys">단축키 안내</button></div><div class="panel-b"><ol class="dl-steps"><li>위에서 내 PC에 맞는 파일을 내려받습니다.</li><li>내려받은 파일을 실행하면 설치가 끝나고 바탕화면에 <b>MAX라이프 주식</b> 아이콘이 생깁니다.</li><li>웹과 같은 아이디·비밀번호로 로그인합니다.</li><li>메뉴 <b>파일 → 새 창</b>(Ctrl+N)으로 차트·주문 창을 여러 개 띄워 배치할 수 있습니다.</li><li>창을 닫아도 트레이(작업 표시줄 오른쪽 아래)에 남아 체결 알림을 받습니다.</li></ol><p class="dim" style="font-size:12px">Windows에서 "PC 보호" 안내가 뜨면 <b>추가 정보 → 실행</b>을 누르세요.</p></div></section>
      </div>`;
    $('#dlKeys').onclick = keyGuide;
    return {};
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
          <p>실제 국내·미국 주식 시세로 매수·매도하고, MAX 리딩의 실전 매매를 가상계좌로 따라하며 투자를 배웁니다.</p>
        </div>
        <div class="auth-stats"><div><b>${Market.list().length}+</b><small>국내·미국 종목</small></div><div><b>1,000만원</b><small>가입 즉시 예수금</small></div><div><b>0원</b><small>실제 투자 위험</small></div></div>
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
          ${Store.mode === 'local' ? `<div class="demo-box"><b style="color:var(--text)">데모 계정</b><br>이용자 <code>demo</code> / <code>demo1234</code><br>MAX 리딩 <code>teacher</code> / <code>teacher1234</code><br>관리자 <code>admin</code> / <code>admin1234</code></div>` : (window.MLS_CONFIG.DEMO_ACCOUNTS || []).length ? `<div class="demo-box"><b style="color:var(--text)">테스트 계정</b> <span class="dim">· 누르면 바로 입력됩니다</span>${window.MLS_CONFIG.DEMO_ACCOUNTS.map((a, i) => `<button type="button" class="demo-acc" data-demo="${i}"><span>${esc(a.label)}</span><code>${esc(a.id)}</code> / <code>${esc(a.pw)}</code></button>`).join('')}</div>` : ''}
        ` : `
          <h1>회원가입</h1><p class="sub">가입 즉시 예수금 ${won(S.st.initialCash)}이 지급됩니다.</p>
          <form id="authF">
            <div class="field"><label>닉네임</label><input class="input" name="name" required maxlength="20"></div>
            <div class="field"><label>아이디 (영문/숫자 4~20자)</label><input class="input" name="username" autocomplete="username" required pattern="[A-Za-z0-9_]{4,20}"></div>
            <div class="field"><label>비밀번호 (6자 이상)</label><input class="input" type="password" name="pw" autocomplete="new-password" required minlength="6"></div>
            <div class="field"><label>휴대폰 (선택)</label><input class="input" name="phone" inputmode="tel"></div>
            <div class="field"><label>추천 코드 (선택)</label><input class="input" name="ref" value="${esc(refGet())}" maxlength="20" style="text-transform:uppercase" placeholder="받은 추천 코드가 있으면 입력"></div>
            <label class="check" style="margin:6px 0 14px"><input type="checkbox" required> <span><button type="button" class="link" data-terms="terms">이용약관</button> · <button type="button" class="link" data-terms="privacy">개인정보 처리방침</button> · <button type="button" class="link" data-terms="risk">거래 위험 안내</button>에 동의하며, 가상 계좌로 운영되어 실제 주식 주문·송금은 이뤄지지 않음을 확인합니다.</span></label>
            <button class="btn btn-brand btn-block btn-lg">가입하고 시작하기</button>
          </form>
          <div class="auth-switch">이미 계정이 있으신가요? <button data-sw="login">로그인</button></div>
        `}
      </div></div>
    </div>`;
    $('[data-sw]').onclick = (e) => renderAuth(e.target.dataset.sw);
    $$('[data-demo]').forEach((b) => (b.onclick = () => { const a = window.MLS_CONFIG.DEMO_ACCOUNTS[+b.dataset.demo]; const f = $('#authF'); f.username.value = a.id; f.pw.value = a.pw; f.querySelector('.btn-brand').focus(); }));
    $$('[data-terms]').forEach((b) => (b.onclick = (e) => { e.preventDefault(); termsModal(b.dataset.terms); }));
    $('#authF').onsubmit = async (e) => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const btn = e.target.querySelector('button.btn-brand'); btn.disabled = true;
      if (f.ref) f.ref = f.ref.trim().toUpperCase(); else delete f.ref;
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
    ['home', '홈', ICON.home], ['market', '시세·순위', ICON.grid], ['screen', '조건검색', ICON.search], ['watch', '관심종목', ICON.star], ['stock/005930', '종목·주문', ICON.chart], ['balance', '잔고', ICON.wallet], ['history', '거래내역', ICON.list],
    ['cash', '입출금', ICON.bank], ['futures/BTC', '코인 선물', ICON.bolt], ['staking', '스테이킹', ICON.coin], ['lead', 'MAX 리딩', ICON.lead], ['buff', 'MAX 버프', ICON.shield], ['ai', 'MAX AI 분석', ICON.spark], ['rank', '투자 수익 랭킹', ICON.trophy], ['events', '이벤트·투자 대회', ICON.coin], ['guide', '이용 가이드', ICON.list], ['help', '고객센터', ICON.doc], ['my', '마이페이지', ICON.user],
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
          <button class="icon-btn hide-m" id="keysBtn" title="단축키 안내 (F1)"><kbd style="font-size:11px">F1</kbd></button><button class="icon-btn" id="voiceBtn" title="음성 안내"></button><button class="icon-btn bell" id="bellBtn" title="알림">${ICON.bell}<span class="bdg" id="bellN" hidden></span></button><div class="notif-pop hidden" id="notifPop"></div>
          <button class="icon-btn" id="themeBtn" title="다크·화이트 전환">${theme.get() === 'dark' ? ICON.sun : ICON.moon}</button>
          <button class="user-chip" id="userBtn"><span class="avatar">${esc(S.user.name.slice(0, 1))}</span><span class="nm">${esc(S.user.name)}</span></button>
        </div>
      </header>
      <aside class="sidebar">
        <nav class="nav">
          <div class="cap">TRADING</div>
          ${NAV.slice(0, 8).map(([r, l, i]) => `<a href="#/${r}" data-r="${r.split('/')[0]}">${i}<span>${l}</span></a>`).join('')}
          <div class="sep"></div><div class="cap">COIN</div>
          ${NAV.slice(8, 10).map(([r, l, i]) => `<a href="#/${r}" data-r="${r.split('/')[0]}">${i}<span>${l}</span></a>`).join('')}
          <div class="sep"></div><div class="cap">MAX SERVICE</div>
          ${NAV.slice(10).map(([r, l, i]) => `<a href="#/${r}" data-r="${r.split('/')[0]}">${i}<span>${l}</span></a>`).join('')}
          ${staff ? `<div class="sep"></div><a href="admin.html" id="admLink">${ICON.shield}<span>${S.user.role === 'admin' ? '관리자' : 'MAX 리딩 관리'}</span><span class="nbdg" hidden></span></a>` : ''}
        </nav>
        ${IS_APP ? '' : `<a class="side-dl" href="#/download">${ICON.monitor || ICON.chart}<span><b>PC 프로그램</b><small>Windows · Mac 내려받기</small></span></a>`}
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
    $('#keysBtn').onclick = keyGuide;
    bindSearch($('#q'), $('#qr'), (code) => (location.hash = '#/stock/' + code));
    renderTicker();
  }
  function userMenu() {
    const staff = S.user.role !== 'user';
    U.modal({
      title: S.user.name + ' 님', body: `
      <div class="kv" style="margin-bottom:16px"><dt>아이디</dt><dd>${esc(S.user.username)}</dd><dt>권한</dt><dd>${{ user: '이용자', instructor: 'MAX 리딩', admin: '관리자' }[S.user.role]}</dd><dt>총자산</dt><dd>${won(S.v.total)}</dd></div>
      <div class="grid" style="gap:8px">
        <a class="btn btn-block" href="#/my" data-x>마이페이지</a>
        <button class="btn btn-block" id="mTheme" data-x>${theme.get() === 'dark' ? '라이트 모드' : '다크 모드'}로 전환</button>
        ${staff ? `<a class="btn btn-block" href="admin.html">${S.user.role === 'admin' ? '관리자 페이지' : 'MAX 리딩 관리'}</a>` : ''}
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
    t.innerHTML = ['KOSPI', 'KOSDAQ', 'NASDAQ', 'SPX'].filter((k) => ix[k]).map((k) => `<span class="ix" data-ix="${k}" style="cursor:pointer"><b>${k === 'SPX' ? 'S&P500' : k}</b><span class="v ${cls(ix[k].change)}">${U.n2(ix[k].price)}</span><span class="${cls(ix[k].change)}">${pct(ix[k].changePct)}</span></span>`).join('');
    const sf = $('#sideFoot'); if (sf) sf.innerHTML = statusLine(true);
    Notif.render();
  }
  function statusLine(short) {
    const s = Market.state;
    if (s.status === 'LIVE') { const kr = Market.session('KR'), us = Market.session('US'); return `<span class="brand">●</span> 시세 연동<br>${U.dt(s.updatedAt)} 기준<br>국내 ${kr.label} · 미국 ${us.label}`; }
    return `<span style="color:var(--warn)">●</span> 시세 불러오는 중`;
  }

  // 지수 차트
  function indexModal(k) {
    const ix = Market.state.indices[k] || {}; const name = k === 'SPX' ? 'S&P 500' : ix.name || k;
    U.modal({ title: name + ' 지수', size: 'lg', body: `<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px"><b style="font-size:26px" class="${cls(ix.change)}">${U.n2(ix.price || 0)}</b><span class="${cls(ix.change)}">${signed(ix.change || 0, 'USD').replace('$', '')} (${pct(ix.changePct || 0)})</span></div><div class="seg" id="ixTf" style="margin-bottom:8px"><button data-v="D" class="on">일</button><button data-v="W">주</button><button data-v="M">월</button></div><div class="chart-box" style="height:340px"><div class="chart-tip" id="ixTip"></div><canvas id="ixC"></canvas></div>`,
      foot: '<button class="btn" data-x>닫기</button>',
      onMount: async (m) => {
        const ch = Chart.candle($('#ixC', m), { ccy: 'USD', tip: $('#ixTip', m), view: 120, sub: 'vol' });
        const d = await Market.indexCandles(k);
        const agg = (unit) => { if (unit === 'D') return d; const out = []; let cur = null; for (const x of d) { const dt = new Date(x.t); const key = unit === 'W' ? (() => { const y = new Date(dt); y.setDate(y.getDate() - ((y.getDay() + 6) % 7)); return y.toDateString(); })() : dt.getFullYear() + '-' + dt.getMonth(); if (!cur || cur.key !== key) { cur && out.push(cur.k); cur = { key, k: { ...x } }; } else { cur.k.h = Math.max(cur.k.h, x.h); cur.k.l = Math.min(cur.k.l, x.l); cur.k.c = x.c; cur.k.v += x.v; } } cur && out.push(cur.k); return out; };
        ch.set({ data: d, tf: 'D' });
        $('#ixTf', m).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('#ixTf button', m).forEach((x) => x.classList.toggle('on', x === b)); ch.set({ data: agg(b.dataset.v), tf: b.dataset.v, offset: 0 }); };
      },
    });
  }
  document.addEventListener('click', (e) => { const t = e.target.closest('#ticker [data-ix]'); if (t) indexModal(t.dataset.ix); });

  // ── 라우팅 ──
  function route() {
    const h = location.hash.replace(/^#\/?/, '') || 'home';
    const [name, arg] = h.split('/');
    const pages = { ...(window.MLS_PAGES || {}), home: Home, help: Help, download: Download, ai: AiPage, market: MarketPage, screen: Screen, buff: Buff, watch: Watch, stock: Stock, balance: Balance, history: History, cash: Cash, lead: Lead, rank: Rank, my: My, menu: Menu };
    const P = pages[name] || Home;
    S.page && S.page.destroy && S.page.destroy();
    $$('.nav a, .tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.r === name));
    const main = $('#main'); main.innerHTML = ''; window.scrollTo(0, 0);
    S.page = P(main, arg, h.split('/')[2]) || {};
    window.MLSX && MLSX.route(name);
  }
  const refGet = () => { try { const m = location.href.match(/[?&#]ref=([A-Za-z0-9]+)/); if (m) localStorage.setItem('mls.ref', m[1].toUpperCase()); return localStorage.getItem('mls.ref') || ''; } catch { return ''; } };
  const termsModal = (k) => window.MLSX && MLSX.termsModal(k);
  const head = (t, sub, right = '') => `<div class="page-head"><div><h1>${t}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;
  const marketBanner = () => sesStrip();
  const stockRow = (q, extra = '') => `<div class="row" data-go="${q.code}"><div class="sname">${extra}<b>${esc(q.name)}</b><small>${q.code} · ${q.market}</small></div><div class="p ${cls(q.change)}"><b>${px(q.price, q.currency)}</b><small>${pct(q.changePct)}</small></div></div>`;
  const bindGo = (el) => el.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g && !e.target.closest('[data-stop]')) location.hash = '#/stock/' + g.dataset.go; });

  // ═════════ 홈 ═════════
  function Home(main) {
    let mk = 'ALL', rk = 'value';
    main.innerHTML = `
      <div class="home-grid">
      <div class="home-notice" id="hNotice"></div><div class="home-sessions">${marketBanner()}</div>
        <section class="panel home-assets"><div class="panel-b hero-asset" id="hAsset"></div><div id="hBuff"></div></section>
        <div class="home-market"><section class="panel"><div class="panel-h"><h3>시장 지수</h3><span class="dim" style="font-size:12px" id="hTime"></span></div><div class="panel-b flush slist" id="hIdx"></div></section><div id="hBrd"></div></div>
        <section class="panel home-ranking"><div class="panel-h"><h3>실시간 랭킹</h3><div class="home-ranking-filters"><div class="seg" id="hMk"><button data-v="ALL" class="on">전체</button><button data-v="KR">국내</button><button data-v="US">미국</button></div><div class="seg" id="hRk"><button data-v="value" class="on">거래대금</button><button data-v="up">급등</button><button data-v="down">급락</button></div></div></div><div class="panel-b flush"><div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>현재가</th><th>등락률</th><th class="hide-m">거래량</th><th class="hide-m">거래대금</th></tr></thead><tbody id="hRank"></tbody></table></div></div></section>
        <div class="home-rail">
          <section class="panel home-watchlist"><div class="panel-h"><h3>관심종목</h3><a class="dim" href="#/stock/005930" style="font-size:12px">종목 검색</a></div><div class="panel-b flush slist" id="hWatch"></div></section>
          <section class="panel home-holdings"><div class="panel-h"><h3>내 보유종목</h3><a class="dim" href="#/balance" style="font-size:12px">잔고 전체</a></div><div class="panel-b flush slist" id="hHold"></div></section>
          <section class="panel home-reading"><div class="panel-h"><h3>최신 리딩</h3><a class="dim" href="#/lead" style="font-size:12px">리딩룸</a></div><div class="panel-b flush" id="hLead"></div></section>
        </div>
      </div>`;
    $('#hMk').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; mk = b.dataset.v; $$('#hMk button').forEach((x) => x.classList.toggle('on', x === b)); tick(); };
    $('#hRk').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; rk = b.dataset.v; $$('#hRk button').forEach((x) => x.classList.toggle('on', x === b)); tick(); };
    ['#hWatch', '#hRank', '#hHold'].forEach((s) => bindGo($(s)));
    $('#hIdx').onclick = (e) => { const r = e.target.closest('[data-ix]'); if (r) indexModal(r.dataset.ix); };
    $('#hWatch').addEventListener('click', async (e) => { const s = e.target.closest('[data-star]'); if (s) { e.stopPropagation(); await Store.toggleWatch(s.dataset.star); } });
    function data() {
      const pin = S.notices.find((n) => n.pinned) || S.notices[0];
      $('#hNotice').innerHTML = pin ? `<a class="notice-bar" href="#/lead"><b>공지</b><span>${esc(pin.title)}</span><span class="dim" style="margin-left:auto;font-size:12px">${U.ago(pin.at)}</span></a>` : '';
      $('#hLead').innerHTML = S.posts.slice(0, 3).map((p) => `<a href="#/lead" class="feed-card" style="display:block;padding:14px 18px"><div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">${p.kind === 'trade' ? `<span class="tag ${p.side === 'sell' ? 'tag-sell' : 'tag-buy'}">${p.side === 'sell' ? '매도 시연' : '매수 시연'}</span>` : '<span class="tag tag-brand">해설</span>'}${resultTag(p)}<span class="dim" style="font-size:12px;margin-left:auto">${U.ago(p.at)}</span></div><b style="font-weight:700">${esc(p.title)}</b></a>`).join('') || '<div class="empty">등록된 리딩이 없습니다</div>';
      tick();
    }
    function tick() {
      const v = S.v;
      const hb = $('#hBuff'); if (hb) hb.innerHTML = v.loan ? `<div class="panel-b" style="border-top:1px solid var(--border)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>MAX 버프 ${v.buff.mult}배 사용 중 · 지원금 ${won(v.loan)}</b><a class="btn btn-sm" href="#/buff">관리</a></div>${gauge(v)}</div>` : '';
      $('#hAsset').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div><div class="stat"><div class="k">${v.loan ? '순자산 (버프 차감)' : '총 자산'}</div></div><div class="v num home-total-v">${won(v.net)}</div><div class="${cls(v.netPnl)}" style="font-weight:600;margin-top:2px">${signedWon(v.netPnl)} (${pct(v.netPct)})<span class="dim" style="font-weight:500;margin-left:6px">누적 수익</span></div></div>
          <div style="display:flex;gap:8px"><a class="btn btn-sm" href="#/cash">입출금</a><a class="btn btn-sm btn-brand" href="#/stock/005930">주문하기</a></div>
        </div>
        ${(S.d.snapshots || []).length >= 2 ? '<div class="home-performance"><canvas id="hSpark" style="width:100%;height:100%"></canvas></div>' : '<div class="home-performance is-empty">거래 기록이 이틀 이상 쌓이면 자산 추이 그래프가 표시됩니다</div>'}
        <div class="home-assets-meta">
          <div class="stat"><div class="k">평가금액</div><div class="v" style="font-size:17px">${won(v.evalKrw)}</div></div>
          <div class="stat"><div class="k">평가손익</div><div class="v ${cls(v.pnl)}" style="font-size:17px">${signedWon(v.pnl)}</div><div class="s ${cls(v.pnl)}">${pct(v.pnlPct)}</div></div>
          <div class="stat"><div class="k">예수금</div><div class="v" style="font-size:17px">${won(v.cash)}</div></div>
          <div class="stat"><div class="k">주문가능</div><div class="v" style="font-size:17px">${won(v.orderable)}</div></div>
        </div>`;
      const snaps = (S.d.snapshots || []).slice(-60).map((s) => [s[0], s[1]]);
      if (!snaps.length || snaps[snaps.length - 1][0] !== U.today()) snaps.push([U.today(), v.net]); else snaps[snaps.length - 1][1] = v.net;
      if ($('#hSpark')) Chart.line($('#hSpark'), { points: snaps, color: v.netPnl >= 0 ? Chart.css('--up') : Chart.css('--down'), labels: false, base: v.principal, fmt: compact });
      const ix = Market.state.indices;
      $('#hIdx').innerHTML = ['KOSPI', 'KOSDAQ', 'NASDAQ', 'SPX', 'DJI'].filter((k) => ix[k]).map((k) => `<div class="row" data-ix="${k}"><div class="sname"><b>${k === 'SPX' ? 'S&P 500' : ix[k].name || k}</b><small>${k === 'KOSPI' || k === 'KOSDAQ' ? '국내 · ' + Market.session('KR').label : '미국 · ' + Market.session('US').label}</small></div><div class="p ${cls(ix[k].change)}"><b>${U.n2(ix[k].price)}</b><small>${signed(ix[k].change, 'USD').replace('$', '')} ${pct(ix[k].changePct)}</small></div></div>`).join('');
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
    const O = { cond: 'le', trig: 0, side: pre && pre.code === code ? pre.side : 'buy', type: 'limit', price: pre && pre.code === code && pre.price ? pre.price : 0, qty: 1, tf: 'D' };
    // 기본 주문가: 매수는 매도1호가, 매도는 매수1호가 (바로 체결되는 가격)
    const bestFor = (side) => (side === 'sell' ? Market.bestBid(code) : Market.bestAsk(code)) || q0.price; let autoPx = !O.price; if (autoPx) O.price = bestFor(O.side);
    main.innerHTML = `

      <div class="trade">
        <div class="col-chart">
          <section class="panel">
            <div class="quote-head" id="sHead"></div>
            <div class="q-sum" id="sSum"></div>
            <div class="chart-tools"><div class="seg" id="sTf"><button data-v="m">분</button><button data-v="D" class="on">일</button><button data-v="W">주</button><button data-v="M">월</button></div><div class="seg" id="sMa" title="이동평균선"><button data-v="5" class="on">5</button><button data-v="20" class="on">20</button><button data-v="60" class="on">60</button><button data-v="120" class="on">120</button></div><div class="seg" id="sInd"><button data-v="bb">볼린저</button></div><div class="seg" id="sSub"><button data-v="vol" class="on">거래량</button><button data-v="rsi">RSI</button><button data-v="macd">MACD</button></div><button class="btn btn-sm btn-ghost" id="sEasy" title="이동평균 20일·거래량만 보는 간편 차트">간편 차트</button><div class="seg draw-seg" id="sDraw" title="차트 그리기"><button data-v="h" title="차트를 누른 가격에 수평선">수평선</button><button data-v="t" title="두 점을 눌러 추세선">추세선</button><button data-v="x" title="그린 선 모두 지우기">지우기</button></div><button class="btn btn-sm btn-ghost" id="sFull" title="차트 전체화면">전체화면</button><span class="dim" style="font-size:11px" id="sCSrc"></span></div>
            <div class="chart-box"><div class="chart-tip" id="sTip"></div><canvas id="sChart"></canvas></div>
          </section>
          <section class="panel" style="margin-top:16px">
            <div class="tabs" id="sTabs"><span class="tab-grp">주문</span><button data-v="open" class="on">미체결</button><button data-v="pos">보유현황</button><button data-v="fills">체결내역</button><span class="tab-grp">종목정보</span><button data-v="daily">일별시세</button><button data-v="info">종목정보</button><button data-v="deal">투자자</button><button data-v="news">뉴스·리포트</button><button data-v="disc">공시</button><span class="tab-grp">분석</span><button data-v="ai" class="ai-tab">AI 분석</button><button data-v="alert">가격알림</button></div>
            <div id="sBottom"></div>
          </section>
        </div>
        <section class="panel book-panel">
          <div class="panel-h"><h3>호가</h3><label class="dim oc-tg" title="호가를 누르면 확인 없이 그 가격으로 바로 주문합니다 (매도호가 → 매수, 매수호가 → 매도)"><input type="checkbox" id="sOC"> 원클릭</label><span class="dim" style="font-size:11px" id="sBookSrc"></span></div>
          <div class="bk-ratio" id="sRatio"></div>
          <div class="book" id="sBook"></div>
          <div class="panel-h" style="border-top:1px solid var(--border)"><h3>체결</h3></div>
          <div class="ticks" id="sTicks"></div>
        </section>
        <section class="panel" id="orderPanel">
          <div class="acct-bar" id="oAcct"></div>
          <div class="order-side"><button class="buy" data-side="buy">매수</button><button class="sell" data-side="sell">매도</button></div>
          <div class="panel-b">
            <div class="field"><label>주문 유형</label><div class="seg" id="oType" style="width:100%"><button data-v="limit" style="flex:1">지정가</button><button data-v="market" style="flex:1">시장가</button><button data-v="stop" style="flex:1" title="손절·익절·돌파 매매">감시주문</button><button data-v="ext" style="flex:1" title="장전·장후 시간외 종가, 시간외 단일가, 프리·애프터마켓">시간외</button></div></div>
            <div class="ses-box" id="oSes"></div>
            <div class="field" id="oStopBox" style="display:none"><label>감시 조건 <span class="dim">현재가가 이 가격에 닿으면 시장가로 자동 주문</span></label><div class="seg" id="oCond" style="width:100%;margin-bottom:8px"><button data-v="le" style="flex:1">이하로 내려가면</button><button data-v="ge" style="flex:1">이상 올라가면</button></div><div class="stepper"><button data-t="-1">−</button><input class="input" id="oTrig" inputmode="decimal"><button data-t="1">+</button></div><div class="pct-row" id="oTrigPct"><button data-tp="-5">−5%</button><button data-tp="-3">−3%</button><button data-tp="3">+3%</button><button data-tp="5">+5%</button><button data-tp="10">+10%</button></div></div>
            <div class="field" id="oPriceBox"><label>주문 가격 <span class="dim" id="oTickInfo"></span></label><div class="stepper"><button data-p="-1">−</button><input class="input" id="oPrice" inputmode="decimal"><button data-p="1">+</button></div></div>
            <div class="field"><label>수량 <span class="dim" id="oMaxInfo"></span></label><div class="stepper"><button data-q="-1">−</button><input class="input" id="oQty" inputmode="numeric"><button data-q="1">+</button></div><div class="amt-row"><span class="dim">금액으로</span><input class="input" id="oAmt" inputmode="numeric" placeholder="투자금액 입력 → 수량 자동 계산"><span class="dim">원</span></div><div class="pct-row" id="oPct"><button data-r=".1">10%</button><button data-r=".25">25%</button><button data-r=".5">50%</button><button data-r="1">최대</button></div></div>
            <details class="cf-tpsl" id="oAuto"><summary>매수 체결 후 자동 익절·손절</summary><div class="cf-tpsl-b"><div class="field"><label>익절 (+%)</label><input class="input" id="oTpP" inputmode="decimal" placeholder="예: 5"></div><div class="field"><label>손절 (−%)</label><input class="input" id="oSlP" inputmode="decimal" placeholder="예: 3"></div></div><p class="dim" style="font-size:11px;margin:6px 0 0">매수가 체결되면 익절 지정가 매도와 손절 감시 매도를 함께 걸고, 한쪽이 체결되면 다른 쪽은 자동 취소됩니다.</p></details>
            <div class="order-sum" id="oSum"></div>
            <button class="btn btn-block btn-lg" id="oSubmit"></button>
            <p class="dim" style="font-size:11px;margin-top:10px;line-height:1.6">실제 시세 기준으로 가상 계좌에서 체결됩니다.</p>
          </div>
        </section>
      </div>
      <div class="m-orderbar show-m"><button class="btn btn-buy" data-mo="buy">매수</button><button class="btn btn-sell" data-mo="sell">매도</button></div>`;
    main.classList.add('has-orderbar');
    $$('[data-mo]').forEach((b) => (b.onclick = () => { O.side = b.dataset.mo; if (autoPx) O.price = bestFor(O.side); syncForm(); $('#orderPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
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
      const easy = localStorage.getItem('mls.easy') === '1';
      ['#sMa', '#sInd', '#sSub'].forEach((x) => { const e = $(x); if (e) e.style.display = easy ? 'none' : ''; });
      const eb = $('#sEasy'); if (eb) { eb.classList.toggle('on', easy); eb.textContent = easy ? '전문가 차트' : '간편 차트'; }
      chart.set(easy ? { ma: [20], bb: false, sub: 'vol' } : { ma: IND.ma.slice().sort((a, b) => a - b), bb: IND.bb, sub: IND.sub });
    };
    const DKEY = 'mls.draw.' + code; const loadDraws = () => { try { return JSON.parse(localStorage.getItem(DKEY) || '[]'); } catch { return []; } };
    chart.set({ draws: loadDraws(), onDraw: (d) => { try { localStorage.setItem(DKEY, JSON.stringify(d.slice(-30))); } catch {} } });
    $('#sDraw').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const v = b.dataset.v;
      if (v === 'x') { chart.set({ draws: [], drawMode: null, _pend: null }); try { localStorage.removeItem(DKEY); } catch {} $$('#sDraw button').forEach((x) => x.classList.remove('on')); $('#sChart').style.cursor = ''; return U.toast('그린 선을 모두 지웠습니다.'); }
      const on = !b.classList.contains('on'); $$('#sDraw button').forEach((x) => x.classList.toggle('on', on && x === b)); chart.set({ drawMode: on ? v : null, _pend: null }); $('#sChart').style.cursor = on ? 'crosshair' : '';
      if (on) U.toast(v === 'h' ? '차트에서 원하는 가격을 누르면 수평선이 그려집니다.' : '차트에서 두 점을 차례로 누르면 추세선이 그려집니다.'); };
    $('#sFull').onclick = () => { const box = $('#sChart').closest('.panel'); if (document.fullscreenElement) document.exitFullscreen(); else if (box.requestFullscreen) box.requestFullscreen().catch(() => U.toast('전체화면을 열 수 없습니다.', true)); };
    const onFs = () => { const box = $('#sChart') && $('#sChart').closest('.panel'); if (!box) return; box.classList.toggle('fs-on', document.fullscreenElement === box); setTimeout(() => chart.draw(), 60); };
    document.addEventListener('fullscreenchange', onFs);
    let y52 = null; Market.candles(code, 'D').then((r) => { const d = r.data.slice(-250); if (d.length) y52 = { hi: Math.max(...d.map((k) => k.h)), lo: Math.min(...d.map((k) => k.l)) }; renderSum(); }).catch(() => {});
    let lastPx = null;
    function renderSum() {
      const q = Market.quote(code); const el = $('#sSum'); if (!el || !q) return; const tk = Market.ticks(code);
      const bv = tk.filter((t) => t.side > 0).reduce((s2, t) => s2 + t.v, 0), sv = tk.filter((t) => t.side < 0).reduce((s2, t) => s2 + t.v, 0); const ns = tk.filter((t) => t.side).length; const str = ns < 6 ? null : sv ? Math.min(999, (bv / sv) * 100) : 999;
      const h52 = q.high52 || (y52 && y52.hi), l52 = q.low52 || (y52 && y52.lo); const val = q.value || q.price * q.volume * (q.currency === 'USD' ? Market.fx() : 1);
      const pos52 = h52 && l52 && h52 > l52 ? Math.max(0, Math.min(100, ((q.price - l52) / (h52 - l52)) * 100)) : null;
      el.innerHTML = `<div title="최근 실시간 체결의 매수 체결량 ÷ 매도 체결량 × 100"><small>체결강도</small><b class="${str == null ? '' : str >= 100 ? 'up' : 'down'}">${str == null ? '집계 중' : str.toFixed(1) + '%'}</b></div><div><small>거래대금</small><b>${q.currency === 'USD' ? U.usd(q.value || q.price * q.volume) : compact(val) + '원'}</b></div><div><small>시가총액</small><b>${q.marketCap ? (q.currency === 'USD' ? '$' + compact(q.marketCap) : compact(q.marketCap) + '원') : '-'}</b></div>
        <div class="q52"><small>52주 최저 · 최고</small><b>${l52 ? px(l52, q.currency) : '-'} <span class="dim">~</span> ${h52 ? px(h52, q.currency) : '-'}</b>${pos52 != null ? `<span class="q52-bar"><i style="left:${pos52}%"></i></span>` : ''}</div>`;
    }
    $('#sEasy').onclick = () => { try { localStorage.setItem('mls.easy', localStorage.getItem('mls.easy') === '1' ? '0' : '1'); } catch {} syncInd(); };
    $('#sMa').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const v = +b.dataset.v; IND.ma = IND.ma.includes(v) ? IND.ma.filter((x) => x !== v) : [...IND.ma, v]; syncInd(); };
    $('#sInd').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; IND[b.dataset.v] = !IND[b.dataset.v]; syncInd(); };
    $('#sSub').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; IND.sub = b.dataset.v; syncInd(); };
    syncInd();
    $('#sTabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; bottomTab = b.dataset.v; $$('#sTabs button').forEach((x) => x.classList.toggle('on', x === b)); renderBottom(); };
    // 주문 패널 이벤트
    $$('.order-side button').forEach((b) => (b.onclick = () => { O.side = b.dataset.side; if (autoPx) O.price = bestFor(O.side); syncForm(); }));
    $('#oType').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; O.type = b.dataset.v; if (O.type === 'ext') { O.price = Market.quote(code).price; autoPx = false; } if (O.type === 'stop' && !O.trig) { const q = Market.quote(code); O.trig = ccy === 'USD' ? +(q.price * (O.side === 'sell' ? 0.95 : 1.05)).toFixed(2) : U.roundTick(q.price * (O.side === 'sell' ? 0.95 : 1.05), 'KRW'); O.cond = O.side === 'sell' ? 'le' : 'ge'; } syncForm(); };
    $('#oCond').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; O.cond = b.dataset.v; syncForm(); };
    $$('[data-t]').forEach((b) => (b.onclick = () => { O.trig = U.stepPrice(O.trig || Market.quote(code).price, ccy, +b.dataset.t); syncForm(); }));
    $('#oTrigPct').onclick = (e) => { const b = e.target.closest('[data-tp]'); if (!b) return; const q = Market.quote(code); const v = q.price * (1 + +b.dataset.tp / 100); O.trig = ccy === 'USD' ? +v.toFixed(2) : U.roundTick(v, 'KRW'); O.cond = +b.dataset.tp < 0 ? 'le' : 'ge'; syncForm(); };
    $('#oTrig').addEventListener('change', (e) => { const v = parseFloat(e.target.value.replace(/,/g, '')); if (v > 0) O.trig = ccy === 'USD' ? +v.toFixed(2) : U.roundTick(v, 'KRW'); syncForm(); });
    $$('[data-p]').forEach((b) => (b.onclick = () => { autoPx = false; O.price = U.stepPrice(O.price || Market.quote(code).price, ccy, +b.dataset.p); syncForm(); }));
    $$('[data-q]').forEach((b) => (b.onclick = () => { O.qty = Math.max(1, (O.qty || 0) + +b.dataset.q); syncForm(); }));
    $('#oPrice').addEventListener('change', (e) => { autoPx = false; const v = parseFloat(e.target.value.replace(/,/g, '')); O.price = v > 0 ? U.roundTick(v, ccy) : Market.quote(code).price; syncForm(); });
    $('#oQty').addEventListener('input', (e) => { O.qty = Math.max(0, parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0); updSum(); });
    $('#oQty').addEventListener('change', () => syncForm());
    $('#oAmt').addEventListener('input', (e) => { const a = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0; e.target.value = a ? n0(a) : ''; const pk = Market.toKrw(unitPrice(), ccy) * (1 + Engine.feeRate(S.st, ccy)); O.qty = pk ? Math.floor(a / pk) : 0; $('#oQty').value = O.qty; updSum(); });
    $('#oPct').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; O.qty = Math.max(1, Math.floor(maxQty() * +b.dataset.r)); syncForm(); };
    $('#sOC').checked = localStorage.getItem('mls.oc') === '1';
    $('#sOC').onchange = (e) => { try { localStorage.setItem('mls.oc', e.target.checked ? '1' : '0'); } catch {} U.toast(e.target.checked ? '원클릭 주문 켜짐 · 매도호가를 누르면 매수, 매수호가를 누르면 매도 주문이 바로 접수됩니다.' : '원클릭 주문 꺼짐 · 호가를 누르면 가격만 입력됩니다.'); };
    $('#sBook').onclick = (e) => { const r = e.target.closest('[data-px]'); if (!r) return; autoPx = false; O.price = +r.dataset.px; O.type = 'limit';
      if ($('#sOC').checked) { O.side = r.classList.contains('ask') ? 'buy' : 'sell'; if (!O.qty) O.qty = 1; syncForm(); return submit(true); }
      syncForm(); };
    $('#oSubmit').onclick = submit;
    function unitPrice() { const q = Market.quote(code); if (O.type === 'stop') return O.trig || q.price; return O.type === 'market' ? (O.side === 'buy' ? Market.bestAsk(code) : Market.bestBid(code)) : O.price || q.price; }
    function maxQty() {
      if (O.side === 'sell') { const h = S.v.holdings.find((x) => x.code === code); return h ? h.sellable : 0; }
      const p = Market.toKrw(unitPrice(), ccy) * (1 + Engine.feeRate(S.st, ccy)); return p ? Math.floor(S.v.orderable / p) : 0;
    }
    function sesBox() {
      const ss = Market.session(Market.quote(code).market); const el = $('#oSes'); if (!el) return;
      const lf = ss.left != null ? ` · ${ss.nextLabel}까지 ${ss.left >= 60 ? Math.floor(ss.left / 60) + '시간 ' : ''}${ss.left % 60}분` : '';
      let tip = '';
      if (O.type === 'ext') tip = ss.ext ? (ss.code === 'single' ? '시간외 단일가: 종가 대비 ±10% 이내 지정가로 주문, 현재가에 닿으면 체결됩니다. 18:00에 미체결분 자동 취소.' : ss.code === 'pre_close' || ss.code === 'post_close' ? '시간외 종가: 종가로만 주문하며 즉시 체결됩니다.' : '프리·애프터마켓: 지정가로 주문하며 현재가에 닿으면 체결됩니다. 세션 종료 시 미체결분 자동 취소.') : `지금은 시간외 거래 시간이 아닙니다. ${ss.extHours}`;
      else if (!ss.open && S.st.enforceHours) tip = O.type === 'market' ? `정규장(${ss.hours})에만 시장가 주문이 가능합니다.${ss.ext ? ' 지금은 「시간외」 주문을 이용하세요.' : ''}` : `지정가·감시주문은 예약 주문으로 접수되어 정규장(${ss.hours})이 열리면 체결됩니다.`;
      el.className = 'ses-box ' + (ss.open ? 'on' : ss.ext ? 'ext' : 'off');
      el.innerHTML = `<b><i></i>${ss.kr ? '국내' : '미국'} ${ss.label}</b><span>${lf}</span>${tip ? `<p>${tip}</p>` : ''}`;
    }
    function syncForm() {
      $$('.order-side button').forEach((b) => b.classList.toggle('on', b.dataset.side === O.side));
      $$('#oType button').forEach((b) => b.classList.toggle('on', b.dataset.v === O.type));
      $('#oStopBox').style.display = O.type === 'stop' ? '' : 'none'; $('#oPriceBox').style.display = O.type === 'stop' ? 'none' : '';
      $$('#oCond button').forEach((b) => b.classList.toggle('on', b.dataset.v === O.cond));
      if (document.activeElement !== $('#oTrig')) $('#oTrig').value = ccy === 'USD' ? (+O.trig || 0).toFixed(2) : n0(O.trig || 0);
      const pi = $('#oPrice'); pi.disabled = O.type === 'market'; $$('[data-p]').forEach((b) => (b.disabled = O.type === 'market'));
      if (O.type === 'ext') { const ss = Market.session(Market.quote(code).market); if (ss.code === 'pre_close' || ss.code === 'post_close') { O.price = Market.quote(code).price; pi.disabled = true; $$('[data-p]').forEach((b) => (b.disabled = true)); } }
      pi.value = O.type === 'market' ? '시장가' : ccy === 'USD' ? (+O.price).toFixed(2) : n0(O.price);
      sesBox();
      if (document.activeElement !== $('#oQty')) $('#oQty').value = O.qty;
      $('#oTickInfo').textContent = ccy === 'USD' ? 'USD' : `· 호가단위 ${n0(U.tickKR(O.price || q0.price))}원`;
      const sb = $('#oSubmit'); sb.className = 'btn btn-block btn-lg ' + (O.side === 'buy' ? 'btn-buy' : 'btn-sell'); sb.textContent = O.type === 'stop' ? `감시 ${O.side === 'buy' ? '매수' : '매도'} 등록 (${px(O.trig, ccy)} ${O.cond === 'ge' ? '이상' : '이하'})` : (O.side === 'buy' ? '매수' : '매도') + (O.type === 'market' ? ' (시장가)' : '');
      updSum();
    }
    function updSum() {
      sesBox();
      const q = Market.quote(code); const p = unitPrice(); const gross = Market.toKrw(p * (O.qty || 0), ccy);
      const fee = gross * Engine.feeRate(S.st, ccy); const tax = O.side === 'sell' ? gross * Engine.taxRate(S.st, ccy) : 0;
      const h = S.v.holdings.find((x) => x.code === code);
      $('#oAcct').innerHTML = `<div><small>예수금</small><b>${won(S.v.cash)}</b></div><div><small>주문가능</small><b>${won(S.v.orderable)}</b></div><div><small>이 종목 평가손익</small><b class="${cls(h ? h.pnl : 0)}">${h ? signedWon(h.pnl) : '-'}</b></div><div><small>보유</small><b>${h ? n0(h.qty) + '주' : '-'}</b></div>`;
      $('#oAuto').style.display = O.side === 'buy' && O.type !== 'ext' ? '' : 'none';
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
    async function submit(quick) {
      const q = Market.quote(code);
      if (!O.qty) return U.toast('수량을 입력해 주세요.', true);
      const input = { code, side: O.side, type: O.type, price: O.type === 'limit' || O.type === 'ext' ? +O.price : 0, qty: O.qty, ...(O.type === 'stop' ? { triggerPrice: +O.trig, triggerCond: O.cond } : {}) };
      const err = Engine.validate(S.d, S.st, input);
      if (err && /주문가능금액/.test(err)) { const go = await U.confirmBox('주문가능금액 부족', `<p style="margin:0 0 8px">${esc(err)}</p><p class="muted" style="margin:0">입출금 메뉴에서 충전하면 바로 주문할 수 있습니다.${S.user.role === 'admin' ? '<br>관리자 계정은 충전 신청이 즉시 승인됩니다.' : ''}</p>`, '충전하러 가기'); if (go) location.hash = '#/cash'; return; }
      if (err) return U.toast(err, true);
      const p = unitPrice(); const gross = Market.toKrw(p * O.qty, ccy);
      const ok = quick === true || await U.confirmBox(`${O.side === 'buy' ? '매수' : '매도'} 주문 확인`, `<dl class="kv" style="font-size:14px"><dt>종목</dt><dd>${esc(q.name)} <span class="dim">${code}</span></dd><dt>구분</dt><dd class="${O.side === 'buy' ? 'up' : 'down'}">${O.side === 'buy' ? '매수' : '매도'} · ${O.type === 'market' ? '시장가' : O.type === 'stop' ? '감시주문' : O.type === 'ext' ? '시간외 · ' + Market.session(q.market).label : '지정가'}</dd><dt>가격</dt><dd>${O.type === 'market' ? '시장가 (약 ' + px(p, ccy) + ')' : O.type === 'stop' ? '현재가 ' + pxu(O.trig, ccy) + ' ' + (O.cond === 'ge' ? '이상' : '이하') + ' 도달 시 시장가' : pxu(O.price, ccy)}</dd><dt>수량</dt><dd>${n0(O.qty)}주</dd><dt>주문금액</dt><dd>${won(gross)}</dd></dl>`, O.type === 'stop' ? '감시주문 등록' : O.side === 'buy' ? '매수 주문' : '매도 주문', O.side === 'buy' ? 'btn-buy' : 'btn-sell');
      if (!ok) return;
      try {
        const r = await Store.placeOrder(input);
        const sd = O.side === 'buy' ? '매수' : '매도';
        if (r.fill) { seenFill.add(r.fill.id); chime(); Voice.say(`${q.name} ${n0(r.fill.qty)}주 ${sd} 체결되었습니다.`); }
        else Voice.say(O.type === 'stop' ? `감시 ${sd} 주문이 등록되었습니다.` : `${sd} 주문이 접수되었습니다.`);
        if (r.fill) U.toast(`체결 완료 · ${q.name} ${n0(r.fill.qty)}주 @ ${px(r.fill.price, ccy)}`);
        const tpP = parseFloat($('#oTpP').value) || 0, slP = parseFloat($('#oSlP').value) || 0;
        if (O.side === 'buy' && (tpP || slP)) { if (r.fill) await setTpSl(r.fill.qty, r.fill.price, tpP, slP); else U.toast('자동 익절·손절은 매수가 체결된 뒤 보유현황 탭의 「익절·손절」에서 걸 수 있습니다.'); }
        else if (O.type === 'ext') U.toast(`시간외 주문 접수 · ${px(input.price, ccy)} — 현재가에 닿으면 체결, 세션 종료 시 자동 취소`);
        else U.toast(O.type === 'stop' ? `감시주문 등록 · ${px(input.triggerPrice, ccy)} ${O.cond === 'ge' ? '이상' : '이하'} 도달 시 시장가 ${O.side === 'buy' ? '매수' : '매도'}` : `주문 접수 · 지정가 ${px(input.price, ccy)} 미체결 — ${O.side === 'buy' ? '매도호가가 이 가격 이하' : '매수호가가 이 가격 이상'}로 오면 자동 체결됩니다${!Market.session(q.market).open && S.st.enforceHours ? ` (${Market.session(q.market).label} 중: 정규장에서 체결)` : ''}`);
        if (bottomTab !== 'open' && !r.fill) { bottomTab = 'open'; $$('#sTabs button').forEach((x) => x.classList.toggle('on', x.dataset.v === 'open')); }
      } catch (e) { U.toast(e.message, true); }
    }
    // 익절(지정가 매도) + 손절(감시 매도)을 한 묶음(OCO)으로 등록
    async function setTpSl(qty, base, tpP, slP) {
      const g = 'oco' + Date.now().toString(36); const rp = (v) => (ccy === 'USD' ? +v.toFixed(2) : U.roundTick(v, 'KRW')); let n = 0;
      try {
        if (tpP > 0) { await Store.placeOrder({ code, side: 'sell', type: 'limit', price: rp(base * (1 + tpP / 100)), qty, oco: g }); n++; }
        if (slP > 0) { await Store.placeOrder({ code, side: 'sell', type: 'stop', price: 0, triggerPrice: rp(base * (1 - slP / 100)), triggerCond: 'le', qty, oco: g }); n++; }
        U.toast(`익절 ${tpP ? '+' + tpP + '% ' + px(rp(base * (1 + tpP / 100)), ccy) : '-'} · 손절 ${slP ? '-' + slP + '% ' + px(rp(base * (1 - slP / 100)), ccy) : '-'} 주문을 걸었습니다.`); Voice.say('익절 손절 주문을 등록했습니다.');
      } catch (e) { U.toast((n ? '일부만 등록됨 · ' : '') + e.message, true); }
    }
    function tpslDlg(h) {
      U.modal({ title: `${h.name} 익절·손절`, body: `<p class="muted" style="margin:0 0 10px">평균단가 ${px(h.avg, h.currency)} · 매도가능 ${n0(h.sellable)}주</p><div class="grid g-2"><div class="field"><label>익절 (+%)</label><input class="input" id="tdT" inputmode="decimal" value="5"></div><div class="field"><label>손절 (−%)</label><input class="input" id="tdS" inputmode="decimal" value="3"></div></div><div class="field"><label>수량</label><input class="input" id="tdQ" inputmode="numeric" value="${h.sellable}"></div><p class="dim" style="font-size:12px">평균단가 기준으로 계산합니다. 한쪽이 체결되면 다른 쪽은 자동 취소됩니다.</p>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="tdOk">등록</button>', onMount: (m, close) => { $('#tdOk', m).onclick = async () => { const qn = Math.min(h.sellable, parseInt($('#tdQ', m).value, 10) || 0); if (!qn) return U.toast('매도가능 수량이 없습니다.', true); close(); await setTpSl(qn, h.avg, parseFloat($('#tdT', m).value) || 0, parseFloat($('#tdS', m).value) || 0); }; } });
    }
    async function closeCode(h, silent) {
      if (!h || !h.sellable) { if (!silent) U.toast('매도가능 수량이 없습니다.', true); return false; }
      try { const r = await Store.placeOrder({ code: h.code, side: 'sell', type: 'market', price: 0, qty: h.sellable }); if (r.fill) seenFill.add(r.fill.id); return true; } catch (e) { U.toast(`${h.name} · ${e.message}`, true); return false; }
    }
    function renderHead() {
      const q = Market.quote(code); const ses = Market.session(q.market); const watched = (S.user.watch || []).includes(code);
      $('#sHead').innerHTML = `
        <div style="min-width:0"><div style="display:flex;align-items:center;gap:6px"><button class="star ${watched ? 'on' : ''}" id="sStar" title="관심종목">${ICON.star}</button><span class="nm">${esc(q.name)}</span>${q.currency === 'KRW' ? (Market.isRealtime(code) ? '<span class="rt-b on" title="2~3초마다 실시간 체결가·거래량 반영"><i></i>실시간</span>' : '<span class="rt-b" title="실시간 연결 중 · 연결 전에는 5분 간격 시세">연결 중</span>') : '<span class="rt-b" title="미국 주식은 5분 간격 시세">5분 지연</span>'}<span class="cd">${code} · ${q.market}</span><span class="tag ${ses.open ? 'tag-ok' : ses.ext ? 'tag-brand' : 'tag-no'}" style="margin-left:4px">${ses.label}</span></div>
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
      { const rb = sumA + sumB ? (sumB / (sumA + sumB)) * 100 : 50; $('#sRatio').innerHTML = `<span class="down">매도 ${(100 - rb).toFixed(0)}%</span><div class="bk-bar"><i class="a" style="width:${100 - rb}%"></i><i class="b" style="width:${rb}%"></i></div><span class="up">매수 ${rb.toFixed(0)}%</span>`; }
      const tk = Market.ticks(code);
      $('#sTicks').innerHTML = tk.slice(0, 30).map((t) => `<div class="r"><span class="dim">${t.t}</span><span class="${t.side > 0 ? 'up' : t.side < 0 ? 'down' : ''}">${px(t.p, q.currency)}</span><span>${n0(t.v)}</span></div>`).join('') || '<div class="empty">체결 내역 없음</div>';
    }
    function renderBottom() {
      const el = $('#sBottom'); const q = Market.quote(code);
      if (bottomTab === 'open') {
        const os = S.d.orders.filter((o) => o.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        el.innerHTML = os.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>구분</th><th>주문가</th><th>수량</th><th class="hide-m">주문시각</th><th></th></tr></thead><tbody>${os.map((o) => `<tr><td><div class="sname"><b>${esc(o.name)}</b><small>${o.code}</small></div></td><td><span class="tag ${o.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${o.side === 'buy' ? '매수' : '매도'}</span>${o.type === 'stop' ? ' <span class="tag tag-wait">감시</span>' : o.type === 'ext' ? ' <span class="tag tag-brand">시간외</span>' : ''}</td><td>${o.type === 'stop' ? px(o.triggerPrice, o.currency) + (o.triggerCond === 'ge' ? ' 이상' : ' 이하') : px(o.price, o.currency)}</td><td>${n0(o.qty)}</td><td class="hide-m dim">${U.dt(o.createdAt)}</td><td><button class="btn btn-sm" data-amend="${o.id}">정정</button> <button class="btn btn-sm btn-danger" data-cancel="${o.id}">취소</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">미체결 주문이 없습니다</div>';
      } else if (bottomTab === 'pos') {
        const h = S.v.holdings.find((x) => x.code === code);
        el.innerHTML = h ? `<div class="panel-b"><div class="grid g-4"><div class="stat"><div class="k">보유수량</div><div class="v" style="font-size:18px">${n0(h.qty)}주</div><div class="s dim">매도가능 ${n0(h.sellable)}주</div></div><div class="stat"><div class="k">평균단가</div><div class="v" style="font-size:18px">${pxu(h.avg, h.currency)}</div></div><div class="stat"><div class="k">평가금액</div><div class="v" style="font-size:18px">${won(h.evalKrw)}</div></div><div class="stat"><div class="k">평가손익</div><div class="v ${cls(h.pnl)}" style="font-size:18px">${signedWon(h.pnl)}</div><div class="s ${cls(h.pnl)}">${pct(h.pnlPct)}</div></div></div><div class="pos-act"><button class="btn btn-sm" id="pTs">익절·손절 걸기</button><button class="btn btn-sm btn-sell" id="pCl">이 종목 전량 청산</button><button class="btn btn-sm btn-danger" id="pAll">보유 종목 일괄 청산</button></div></div>` : `<div class="empty">이 종목을 보유하고 있지 않습니다${S.v.holdings.length ? `<br><button class="btn btn-sm btn-danger" id="pAll" style="margin-top:10px">보유 종목 ${S.v.holdings.length}개 일괄 청산</button>` : ''}</div>`;
        if ($('#pTs')) $('#pTs').onclick = () => tpslDlg(h);
        if ($('#pCl')) $('#pCl').onclick = async () => { if (!(await U.confirmBox('종목 청산', `<p>${esc(h.name)} 매도가능 ${n0(h.sellable)}주를 시장가로 모두 매도할까요?</p>`, '전량 매도', 'btn-sell'))) return; if (await closeCode(h)) { chime(); Voice.say(`${h.name} 전량 매도했습니다.`); U.toast(`${h.name} 전량 매도 주문 완료`); } };
        if ($('#pAll')) $('#pAll').onclick = async () => { const L = S.v.holdings.filter((x) => x.sellable > 0); if (!L.length) return U.toast('매도가능한 보유 종목이 없습니다.', true); if (!(await U.confirmBox('일괄 청산', `<p>보유 종목 ${L.length}개를 모두 시장가로 매도합니다.</p><p class="dim" style="font-size:12px">${L.map((x) => esc(x.name)).join(', ')}</p>`, '일괄 청산', 'btn-danger'))) return; let n = 0; for (const x of L) if (await closeCode(x, true)) n++; chime(); Voice.say(`${n}개 종목을 청산했습니다.`); U.toast(`일괄 청산 · ${n}/${L.length}개 종목 매도 주문 완료`); };
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
      } else if (bottomTab === 'disc') {
        if (q.currency !== 'KRW') { el.innerHTML = `<div class="empty">미국 주식 공시는 SEC EDGAR에서 확인할 수 있습니다.<br><a class="btn btn-sm" style="margin-top:10px" target="_blank" rel="noopener" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=&CIK=${encodeURIComponent(code)}&type=&dateb=&owner=include&count=40">SEC 공시 보기</a></div>`; return; }
        el.innerHTML = '<div class="empty">공시를 불러오는 중…</div>';
        Store.disclosures(code).then((L) => {
          if (bottomTab !== 'disc') return; L = Array.isArray(L) ? L : [];
          const tag = (t) => (/실적|영업|매출|손익/.test(t) ? ['실적', 'tag-brand'] : /배당/.test(t) ? ['배당', 'tag-ok'] : /증자|감자|전환사채|신주|자기주식|자사주/.test(t) ? ['자본', 'tag-wait'] : /정정/.test(t) ? ['정정', 'tag-no'] : /가격제한|투자주의|경고|위험|거래정지/.test(t) ? ['시장조치', 'tag-sell'] : ['공시', 'tag-no']);
          el.innerHTML = L.length ? `<div class="disc-l">${L.map((d) => { const [tn, tc] = tag(d.title || ''); return `<button class="disc-r" data-did="${d.disclosureId}"><span class="tag ${tc}">${tn}</span><b>${esc((d.title || '').replace(/^\S+\(주\)\s*/, ''))}</b><small>${esc(d.author || '')} · ${U.dt(d.datetime)}</small></button>`; }).join('')}</div><p class="dim" style="font-size:11px;padding:8px 16px">출처: 한국거래소·금융감독원 공시 (네이버 증권 경유) · 10분마다 갱신</p>` : '<div class="empty">최근 공시가 없습니다</div>';
          $$('[data-did]', el).forEach((b) => (b.onclick = async () => {
            const d0 = L.find((x) => String(x.disclosureId) === b.dataset.did);
            U.modal({ title: (d0 && d0.title) || '공시', size: 'lg', body: '<div class="empty">불러오는 중…</div>', foot: `<a class="btn" target="_blank" rel="noopener" href="https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(q.name)}">DART에서 보기</a><button class="btn btn-brand" data-x>닫기</button>`, onMount: async (m) => {
              try { const r = await Store.disclosure(code, b.dataset.did); const html = (r && r.disclosure && r.disclosure.contents) || '';
                const box = $('.modal-b', m.closest('.modal-bg')) || m; const fr = document.createElement('iframe'); fr.className = 'disc-frame'; fr.setAttribute('sandbox', ''); fr.srcdoc = `<meta charset="utf-8"><style>body{font:13px/1.6 -apple-system,'Malgun Gothic',sans-serif;color:#222;background:#fff;margin:12px}table{border-collapse:collapse;width:100%!important}td,th{border:1px solid #ccc;padding:4px 6px;font-size:12px}span{width:auto!important}</style>${html || '<p>본문을 불러오지 못했습니다.</p>'}`; box.innerHTML = ''; box.appendChild(fr);
              } catch (e) { m.querySelector('.modal-b').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
            } });
          }));
        }).catch((e) => { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
      } else if (bottomTab === 'ai') {
        el.innerHTML = '<div class="empty">AI가 차트·수급·뉴스를 분석하는 중…</div>';
        AI.run(code).then((R) => { if (bottomTab !== 'ai') return; el.innerHTML = `<div style="padding:16px 20px">${AI.report(R, true)}</div>`; AI.bind(el); }).catch((e) => { if (bottomTab === 'ai') el.innerHTML = AI.gate(e.message); });
      } else if (bottomTab === 'deal' || bottomTab === 'news') {
        el.innerHTML = '<div class="empty">불러오는 중…</div>';
        if (q.currency !== 'KRW') { el.innerHTML = `<div class="empty">${bottomTab === 'deal' ? '투자자별 매매동향은 국내 종목에 제공됩니다.' : '뉴스·리포트는 국내 거래대금 상위 500종목에 제공됩니다.'}</div>`; return; }
        const tab = bottomTab;
        Market.info(code).then((I) => {
          if (bottomTab !== tab) return;
          if (!I) { el.innerHTML = '<div class="empty">국내 거래대금 상위 500종목에 제공됩니다.</div>'; return; }
          if (tab === 'deal') {
            const sum = (i) => I.deal.reduce((t, d) => t + d[i], 0);
            el.innerHTML = I.deal.length ? `<div class="panel-b" style="padding-bottom:0"><div class="grid g-3" style="gap:10px">${[['외국인', 1], ['기관', 2], ['개인', 3]].map(([n, i]) => `<div class="stat"><div class="k">${n} 순매수 (${I.deal.length}일)</div><div class="v ${cls(sum(i))}" style="font-size:18px">${(sum(i) > 0 ? '+' : '') + n0(sum(i))}주</div></div>`).join('')}</div></div>
              <div class="table-wrap"><table class="t"><thead><tr><th>일자</th><th>종가</th><th>외국인</th><th>기관</th><th>개인</th><th class="hide-m">외국인 보유율</th></tr></thead><tbody>${I.deal.map((d) => `<tr><td class="dim">${d[0].slice(0, 4)}.${d[0].slice(4, 6)}.${d[0].slice(6, 8)}</td><td>${n0(d[5])}원</td>${[1, 2, 3].map((i) => `<td class="${cls(d[i])}">${(d[i] > 0 ? '+' : '') + n0(d[i])}</td>`).join('')}<td class="hide-m">${d[4]}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">매매동향 정보가 없습니다.</div>';
          } else {
            el.innerHTML = `<div class="panel-b"><h4 style="margin:0 0 10px">뉴스</h4>${I.news.length ? I.news.map((n) => `<a href="${esc(n[3])}" target="_blank" rel="noopener" style="display:block;padding:10px 0;border-bottom:1px solid var(--border);color:inherit;text-decoration:none"><b style="font-weight:600">${esc(n[2])}</b><div class="dim" style="font-size:12px;margin-top:4px">${esc(n[1])} · ${n[0].slice(4, 6)}.${n[0].slice(6, 8)} ${n[0].slice(8, 10)}:${n[0].slice(10, 12)}</div></a>`).join('') : '<p class="dim">최근 뉴스가 없습니다.</p>'}
              <h4 style="margin:22px 0 10px">증권사 리포트</h4>${I.reports.length ? I.reports.map((r) => `<div style="padding:9px 0;border-bottom:1px solid var(--border)"><b style="font-weight:600">${esc(r[2])}</b><div class="dim" style="font-size:12px;margin-top:3px">${esc(r[1])} · ${r[0].slice(0, 4)}.${r[0].slice(4, 6)}.${r[0].slice(6, 8)}</div></div>`).join('') : '<p class="dim">최근 리포트가 없습니다.</p>'}
              <p class="dim" style="font-size:11px;margin-top:12px">뉴스 제목을 누르면 원문 기사로 이동합니다.</p></div>`;
          }
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
        const base = (I) => { const g = (k) => (I && I.info && I.info[k]) || ''; return `<div class="panel-b"><div class="grid g-2" style="gap:18px"><dl class="kv"><dt>시장</dt><dd>${q.type === 'etf' ? 'ETF · ' : ''}${q.market}</dd><dt>업종</dt><dd>${esc(m.sector || '-')}</dd><dt>전일 종가</dt><dd>${pxu(q.prevClose, q.currency)}</dd><dt>시가총액</dt><dd>${q.marketCap ? compact(Market.toKrw(q.marketCap, q.currency)) + '원' : g('marketValue') || '-'}</dd><dt>52주 최고</dt><dd class="up">${g('highPriceOf52Weeks') || (q.high52 ? px(q.high52, q.currency) : '-')}</dd><dt>52주 최저</dt><dd class="down">${g('lowPriceOf52Weeks') || (q.low52 ? px(q.low52, q.currency) : '-')}</dd><dt>외국인 소진율</dt><dd>${g('foreignRate') || '-'}</dd><dt>장 운영시간 (KST)</dt><dd>${Market.session(q.market).hours}</dd></dl>
          <dl class="kv"><dt>PER</dt><dd>${g('per') || '-'}</dd><dt>추정 PER</dt><dd>${g('cnsPer') || '-'}</dd><dt>EPS</dt><dd>${g('eps') || '-'}</dd><dt>PBR</dt><dd>${g('pbr') || '-'}</dd><dt>BPS</dt><dd>${g('bps') || '-'}</dd><dt>배당수익률</dt><dd>${g('dividendYieldRatio') || '-'}</dd><dt>주당배당금</dt><dd>${g('dividend') || '-'}</dd><dt>거래대금</dt><dd>${compact(Market.toKrw(q.value || q.price * q.volume, q.currency))}원</dd></dl></div>
          ${I && I.desc ? `<p class="muted" style="font-size:13px;margin-top:14px;line-height:1.7">${esc(I.desc)}</p>` : ''}${!I && q.currency === 'KRW' ? '<p class="dim" style="font-size:12px;margin-top:10px">상세 재무 지표는 거래대금 상위 500종목에 제공됩니다.</p>' : ''}</div>`; };
        el.innerHTML = base(null);
        if (q.currency === 'KRW') Market.info(code).then((I) => { if (bottomTab === 'info' && I) el.innerHTML = base(I); });
      }
      $$('[data-cancel]', el).forEach((b) => (b.onclick = async () => { try { await Store.cancelOrder(b.dataset.cancel); U.toast('주문이 취소되었습니다.'); Voice.say('주문이 취소되었습니다.'); } catch (e) { U.toast(e.message, true); } }));
      $$('[data-amend]', el).forEach((b) => (b.onclick = () => amendModal(S.d.orders.find((o) => o.id === b.dataset.amend))));
    }
    function tick() { renderHead(); renderBook(); updSum(); renderSum(); const q = Market.quote(code); const pe = $('#sHead .px'); if (pe && lastPx != null && q.price !== lastPx) { pe.classList.remove('flash-up', 'flash-down'); void pe.offsetWidth; pe.classList.add(q.price > lastPx ? 'flash-up' : 'flash-down'); } lastPx = q.price; }
    function data() { renderBottom(); updSum(); chart.set({ lines: avgLine() }); renderHead(); }
    syncForm(); tick(); renderBottom(); loadChart();
    const ci = setInterval(() => { if (Market.state.status === 'SAMPLE') chart.draw(); }, 2000);
    const keys = {
      code,
      side: (sd) => { O.side = sd; if (autoPx) O.price = bestFor(O.side); syncForm(); $('#oQty').focus(); $('#oQty').select(); },
      type: (t) => { const b = $(`#oType [data-v="${t}"]`); if (b) b.click(); },
      submit: () => submit(),
      price: (n) => { if (O.type === 'market') return; autoPx = false; O.price = U.stepPrice(O.price || Market.quote(code).price, ccy, n); syncForm(); },
      qty: (n) => { O.qty = Math.max(1, (O.qty || 0) + n); syncForm(); $('#oQty').value = O.qty; },
      pct: (r) => { O.qty = Math.max(1, Math.floor(maxQty() * r)); syncForm(); },
      tf: (v) => { const b = $(`#sTf [data-v="${v}"]`); if (b) b.click(); },
      tab: (v) => { const b = $(`#sTabs [data-v="${v}"]`); if (b) b.click(); },
      star: () => { const b = $('#sStar'); if (b) b.click(); },
      quick: (sd) => { O.side = sd; O.type = 'market'; if (!O.qty) O.qty = 1; syncForm(); submit(); },
    };
    return { tick, data, keys, redraw: () => { chart.draw(); }, destroy: () => { clearInterval(ci); chart.destroy(); document.removeEventListener('fullscreenchange', onFs); main.classList.remove('has-orderbar'); } };
  }
  function amendModal(o) {
    if (!o) return;
    let price = o.type === 'stop' ? o.triggerPrice : o.price, qty = o.qty - (o.filled || 0);
    U.modal({
      title: '주문 정정', body: `<p class="muted" style="margin-bottom:14px">${esc(o.name)} · ${o.side === 'buy' ? '매수' : '매도'} ${o.type === 'stop' ? '감시주문 (' + (o.triggerCond === 'ge' ? '이상' : '이하') + ' 도달 시 시장가)' : '지정가'}</p>
        <div class="field"><label>${o.type === 'stop' ? '감시 가격' : '정정 가격'}</label><div class="stepper"><button data-p="-1">−</button><input class="input" id="aP"><button data-p="1">+</button></div></div>
        <div class="field"><label>정정 수량</label><input class="input" id="aQ" inputmode="numeric" style="text-align:right"></div>`,
      foot: '<button class="btn" data-x>닫기</button><button class="btn btn-brand" id="aOk">정정 주문</button>',
      onMount: (m, close) => {
        const sync = () => { $('#aP', m).value = o.currency === 'USD' ? (+price).toFixed(2) : n0(price); $('#aQ', m).value = qty; };
        $$('[data-p]', m).forEach((b) => (b.onclick = () => { price = U.stepPrice(price, o.currency, +b.dataset.p); sync(); }));
        $('#aP', m).onchange = (e) => { price = U.roundTick(parseFloat(e.target.value.replace(/,/g, '')) || price, o.currency); sync(); };
        $('#aQ', m).oninput = (e) => { qty = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0; };
        $('#aOk', m).onclick = async () => { try { const r = await Store.amendOrder(o.id, price, qty, o.type === 'stop' ? { triggerPrice: price, triggerCond: o.triggerCond } : null); close(); U.toast(r.fill ? '정정 후 즉시 체결되었습니다.' : '주문이 정정되었습니다.'); } catch (e) { U.toast(e.message, true); } };
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
      ${sesStrip()}
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
    let range = 30; const SPK = {};
    main.innerHTML = `${head('잔고', '보유종목과 계좌 수익률을 확인합니다.')}
      <div class="grid g-4" style="margin-bottom:16px" id="bStats"></div>
      <div class="grid g-main" style="margin-bottom:16px">
        <section class="panel"><div class="panel-h"><h3>계좌 수익률 추이</h3><div class="seg" id="bRange"><button data-v="7">1주</button><button data-v="30" class="on">1개월</button><button data-v="90">3개월</button><button data-v="9999">전체</button></div></div><div class="panel-b"><div style="height:240px"><canvas id="bLine" style="width:100%;height:100%"></canvas></div></div></section>
        <section class="panel"><div class="panel-h"><h3>자산 구성</h3></div><div class="panel-b" id="bAlloc"></div></section>
      </div>
      <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>보유종목</h3><span class="dim" style="font-size:12px" id="bCnt"></span></div><div class="panel-b flush"><div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>보유수량</th><th>평균단가</th><th>현재가</th><th>평가금액</th><th>평가손익</th><th>수익률</th><th class="hide-m">30일 추이</th><th class="hide-m"></th></tr></thead><tbody id="bHold"></tbody></table></div></div></section>
      <section class="panel"><div class="panel-h"><h3>미체결 주문</h3></div><div class="panel-b flush" id="bOpen"></div></section>`;
    $('#bRange').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; range = +b.dataset.v; $$('#bRange button').forEach((x) => x.classList.toggle('on', x === b)); drawLine(); };
    bindGo($('#bHold'));
    function drawLine() {
      const snaps = (S.d.snapshots || []).map((s) => [s[0], s[1]]);
      if (!snaps.length || snaps[snaps.length - 1][0] !== U.today()) snaps.push([U.today(), S.v.net]); else snaps[snaps.length - 1][1] = S.v.net;
      const pts = snaps.slice(-range).map(([d, v]) => [d, S.v.principal ? ((v - S.v.principal) / S.v.principal) * 100 : 0]);
      Chart.line($('#bLine'), { points: pts, color: (pts[pts.length - 1] || [0, 0])[1] >= 0 ? Chart.css('--up') : Chart.css('--down'), labels: true, base: 0, fmt: (v) => v.toFixed(1) + '%' });
    }
    function tick() {
      const v = S.v;
      $('#bStats').innerHTML = `
        <div class="panel panel-b stat"><div class="k">${v.loan ? '순자산 (버프 차감)' : '총 평가자산'}</div><div class="v">${won(v.net)}</div><div class="s ${cls(v.netPnl)}">${signedWon(v.netPnl)} (${pct(v.netPct)})${v.loan ? ' · 총자산 ' + won(v.total) : ''}</div></div>
        <div class="panel panel-b stat"><div class="k">평가손익</div><div class="v ${cls(v.pnl)}">${signedWon(v.pnl)}</div><div class="s ${cls(v.pnl)}">${pct(v.pnlPct)}</div></div>
        <div class="panel panel-b stat"><div class="k">예수금 · 주문가능</div><div class="v">${won(v.cash)}</div><div class="s muted">주문가능 ${won(v.orderable)}</div></div>
        <div class="panel panel-b stat"><div class="k">실현손익 (누적)</div><div class="v ${cls(v.realized)}">${signedWon(v.realized)}</div><div class="s muted">투자원금 ${won(v.principal)}</div></div>`;
      $('#bCnt').textContent = v.holdings.length + '종목';
      $('#bHold').innerHTML = v.holdings.length ? v.holdings.map((h) => `<tr class="click" data-go="${h.code}"><td><div class="sname"><b>${esc(h.name)}</b><small>${h.code} · ${h.market}</small></div></td><td>${n0(h.qty)}</td><td>${px(h.avg, h.currency)}</td><td class="${cls(h.changePct)}">${px(h.price, h.currency)}</td><td>${won(h.evalKrw)}</td><td class="${cls(h.pnl)}">${signedWon(h.pnl)}</td><td class="${cls(h.pnl)}"><b>${pct(h.pnlPct)}</b></td><td class="hide-m"><canvas class="h-spark" data-sp="${h.code}" width="90" height="28"></canvas></td><td class="hide-m"><button class="btn btn-sm btn-sell" data-stop data-sell="${h.code}">매도</button></td></tr>`).join('') : '<tr><td colspan="9"><div class="empty">보유종목이 없습니다</div></td></tr>';
      $$('#bHold [data-sp]').forEach((c) => { const code = c.dataset.sp; const hit = SPK[code]; const draw = (vals) => { if (vals && vals.length > 1) Chart.spark(c, vals, vals[vals.length - 1] >= vals[0] ? Chart.css('--up') : Chart.css('--down')); }; if (hit) draw(hit); else Market.candles(code, 'D').then((r) => { SPK[code] = r.data.slice(-30).map((k) => k.c); draw(SPK[code]); }).catch(() => {}); });
      $$('[data-sell]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); sessionStorage.setItem('mls.prefill', JSON.stringify({ code: b.dataset.sell, side: 'sell' })); location.hash = '#/stock/' + b.dataset.sell; }));
      const tot = v.total || 1; const items = v.holdings.slice(0, 5).map((h) => [h.name, h.evalKrw]); const rest = v.holdings.slice(5).reduce((s, h) => s + h.evalKrw, 0); if (rest) items.push(['기타', rest]); items.push(['예수금', v.cash]);
      const cols = ['#B7E77A', '#619AFF', '#FF626B', '#F5B94A', '#B48CFF', '#56C7C7', '#8A94A6'];
      $('#bAlloc').innerHTML = `<div class="alloc-donut"><canvas id="bDonut" width="150" height="150"></canvas><div><small class="dim">총 평가자산</small><b>${won(v.total)}</b><span class="dim">주식 ${tot ? ((v.evalKrw / tot) * 100).toFixed(1) : 0}% · 예수금 ${tot ? ((v.cash / tot) * 100).toFixed(1) : 0}%</span></div></div><div style="display:flex;height:12px;border-radius:6px;overflow:hidden;margin-bottom:16px">${items.map(([, val], i) => `<span style="width:${(val / tot) * 100}%;background:${i === items.length - 1 ? 'var(--border-strong)' : cols[i]}"></span>`).join('')}</div>` +
        items.map(([nm, val], i) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px"><span style="width:8px;height:8px;border-radius:2px;background:${i === items.length - 1 ? 'var(--border-strong)' : cols[i]}"></span><span>${esc(nm)}</span><span class="dim" style="margin-left:auto">${((val / tot) * 100).toFixed(1)}%</span><b style="width:120px;text-align:right">${won(val)}</b></div>`).join('');
    }
    function donut() {
      const c = $('#bDonut'); if (!c) return; const v = S.v; const tot = v.total || 1; const items = v.holdings.slice(0, 5).map((h) => h.evalKrw); const rest = v.holdings.slice(5).reduce((s2, h) => s2 + h.evalKrw, 0); if (rest) items.push(rest); items.push(v.cash);
      const cols = ['#B7E77A', '#619AFF', '#FF626B', '#F5B94A', '#B48CFF', '#56C7C7', Chart.css('--border-strong')]; const dpr = devicePixelRatio || 1; c.width = 150 * dpr; c.height = 150 * dpr; c.style.width = c.style.height = '150px'; const x = c.getContext('2d'); x.scale(dpr, dpr);
      let a = -Math.PI / 2; items.forEach((val, i) => { const d = (val / tot) * Math.PI * 2; if (d <= 0) return; x.beginPath(); x.arc(75, 75, 58, a, a + d); x.strokeStyle = i === items.length - 1 ? cols[6] : cols[i]; x.lineWidth = 18; x.stroke(); a += d; });
      x.fillStyle = Chart.css('--text'); x.font = "800 15px 'Pretendard Variable', sans-serif"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.holdings.length + '종목', 75, 70); x.fillStyle = Chart.css('--text-3'); x.font = "500 11px 'Pretendard Variable', sans-serif"; x.fillText('보유', 75, 90);
    }
    function data() {
      tick(); drawLine(); donut();
      const os = S.d.orders.filter((o) => o.status === 'pending');
      $('#bOpen').innerHTML = os.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>종목</th><th>구분</th><th>주문가</th><th>수량</th><th>현재가</th><th class="hide-m">주문시각</th><th></th></tr></thead><tbody>${os.map((o) => { const q = Market.quote(o.code); return `<tr><td><div class="sname"><b>${esc(o.name)}</b><small>${o.code}</small></div></td><td><span class="tag ${o.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${o.side === 'buy' ? '매수' : '매도'}</span></td><td>${px(o.price, o.currency)}</td><td>${n0(o.qty)}</td><td class="${cls(q.change)}">${px(q.price, q.currency)}</td><td class="hide-m dim">${U.dt(o.createdAt)}</td><td><button class="btn btn-sm" data-amend="${o.id}">정정</button> <button class="btn btn-sm btn-danger" data-cancel="${o.id}">취소</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">미체결 주문이 없습니다</div>';
      $$('#bOpen [data-cancel]').forEach((b) => (b.onclick = async () => { try { await Store.cancelOrder(b.dataset.cancel); U.toast('주문이 취소되었습니다.'); Voice.say('주문이 취소되었습니다.'); } catch (e) { U.toast(e.message, true); } }));
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
        $('#hsList').innerHTML = os.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>주문일시</th><th class="l">종목</th><th>구분</th><th>유형</th><th>주문가</th><th>수량</th><th>체결가</th><th>상태</th></tr></thead><tbody>${os.map((o) => `<tr><td class="dim">${U.dt(o.createdAt)}</td><td class="l"><div class="sname"><b>${esc(o.name)}</b><small>${o.code}</small></div></td><td><span class="tag ${o.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${o.side === 'buy' ? '매수' : '매도'}</span></td><td>${o.type === 'market' ? '시장가' : o.type === 'stop' ? '감시 ' + px(o.triggerPrice, o.currency) + (o.triggerCond === 'ge' ? '↑' : '↓') : o.type === 'ext' ? '시간외' : '지정가'}${o.reason ? ' <small class="dim">(' + esc(o.reason) + ')</small>' : ''}${o.reason ? ' <span class="dim">(' + esc(o.reason) + ')</span>' : ''}${o.amended ? ' <span class="dim">(정정)</span>' : ''}</td><td>${o.type === 'market' ? '-' : px(o.price, o.currency)}</td><td>${n0(o.qty)}</td><td>${o.avgFill ? px(o.avgFill, o.currency) : '-'}</td><td><span class="tag ${(stt[o.status] || stt.rejected)[1]}">${(stt[o.status] || stt.rejected)[0]}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">조회 기간에 주문 내역이 없습니다</div>';
      }
    }
    data();
    return { data };
  }

  // ═════════ 입출금 ═════════
  function Cash(main) {
    let type = 'deposit', method = 'cash', chain = 'BNB';
    main.innerHTML = `${head('입출금', '예수금 충전·출금을 신청합니다. MOA 토큰·스테이블코인·MAX 포인트로도 충전할 수 있습니다.')}
      <div class="notice-bar"><b>안내</b><span>모든 입출금 신청은 관리자 승인 후 계좌에 반영됩니다.${S.st.autoApprove ? ' (현재 자동 승인 운영 중)' : ''}</span></div>
      <div class="grid g-main" style="margin-bottom:16px">
        <section class="panel">
          <div class="order-side" id="cType"><button class="buy on" data-v="deposit">입금 신청</button><button class="sell" data-v="withdraw">출금 신청</button></div>
          <div class="panel-b">
            <div class="field"><label id="cMLbl">충전 수단</label><div class="pay-grid" id="cMeth"></div><div id="cChain" class="seg" style="margin-top:8px;display:none"><button data-c="BNB" class="on">BNB Chain</button><button data-c="TRON">TRON</button><button data-c="Solana">Solana</button></div></div>
            <div class="field"><label id="cLbl">입금 신청 금액</label><div class="input-unit"><input class="input" id="cAmt" inputmode="numeric" placeholder="0" style="height:52px;font-size:20px"><span style="top:16px">원</span></div>
              <div class="chips" style="margin-top:8px" id="cQuick"><button class="chip" data-a="1000000">+100만</button><button class="chip" data-a="5000000">+500만</button><button class="chip" data-a="10000000">+1,000만</button><button class="chip" data-a="50000000">+5,000만</button><button class="chip" data-a="max" id="cMax" hidden>전액</button><button class="chip" data-a="0">초기화</button></div></div>
            <div class="field"><label>메모 (선택)</label><input class="input" id="cMemo" maxlength="60" placeholder="예: 추가 연습자금 요청"></div>
            <div class="order-sum" id="cSum"></div>
            <button class="btn btn-brand btn-block btn-lg" id="cGo">신청하기</button>
          </div>
        </section>
        <section class="panel"><div class="panel-h"><h3>내 계좌</h3></div><div class="panel-b" id="cAcct"></div></section>
      </div>
      <section class="panel"><div class="panel-h"><h3>입출금 내역</h3></div><div class="panel-b flush" id="cList"></div></section>`;
    const amt = () => parseInt(($('#cAmt').value || '').replace(/[^0-9]/g, ''), 10) || 0;
    const coin = (k) => ['usdt', 'usdc', 'usd1'].includes(k);
    function meths() {
      const pm = S.st.payMethods || {};
      const L = PAY.filter((m) => (type === 'withdraw' ? m.k !== 'card' : pm[m.k] !== false));
      if (!L.find((m) => m.k === method)) method = L[0].k;
      $('#cMLbl').textContent = type === 'deposit' ? '충전 수단' : '받을 수단';
      $('#cMeth').innerHTML = L.map((m) => `<button class="pay-opt ${m.k === method ? 'on' : ''}" data-m="${m.k}"><b>${m.n}</b><small>${m.d}</small></button>`).join('');
      $('#cChain').style.display = coin(method) || method === 'moa' ? '' : 'none';
    }
    $('#cMeth').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; method = b.dataset.m; meths(); sum(); };
    $('#cChain').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; chain = b.dataset.c; $$('#cChain button').forEach((x) => x.classList.toggle('on', x === b)); sum(); };
    const fmtAmt = () => { const a = amt(); $('#cAmt').value = a ? n0(a) : ''; sum(); };
    $('#cAmt').addEventListener('input', fmtAmt);
    $('#cType').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.v; $$('#cType button').forEach((x) => x.classList.toggle('on', x === b)); $('#cLbl').textContent = type === 'deposit' ? '입금 신청 금액' : '출금 신청 금액'; $('#cMax').hidden = type !== 'withdraw'; meths(); sum(); };
    $('#cQuick').onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; $('#cAmt').value = a === 'max' ? n0(S.v.withdrawable) : a === '0' ? '' : n0(amt() + +a); fmtAmt(); };
    $('#cGo').onclick = async () => {
      const a = amt(); if (a < 10000) return U.toast('최소 10,000원 이상 입력해 주세요.', true);
      const ok = await U.confirmBox(type === 'deposit' ? '입금 신청' : '출금 신청', `<p style="font-size:15px"><b>${won(a)}</b> ${type === 'deposit' ? '입금' : '출금'}을 신청합니다.</p><p class="muted" style="margin-top:6px">${type === 'deposit' ? '충전' : '받을'} 수단: <b>${PAYN(method)}</b>${coin(method) || method === 'moa' ? ' · ' + chain : ''} ${conv(a)}</p><p class="muted" style="margin-top:8px;font-size:13px">관리자 승인 후 예수금에 반영됩니다.</p>`, '신청');
      if (!ok) return;
      try { let c = await Store.requestCash(type, a, [PAYN(method) + (coin(method) || method === 'moa' ? ' · ' + chain : ''), $('#cMemo').value].filter(Boolean).join(' · '), method); if (c.status === 'pending' && S.user.role === 'admin') { await Store.processCash(c.id, true, '관리자 즉시 승인'); c = { ...c, status: 'approved' }; await reload(); S.page && S.page.data && S.page.data(); } $('#cAmt').value = ''; $('#cMemo').value = ''; if (c.status === 'pending') chime(); Voice.say(c.status === 'approved' ? '충전이 완료되었습니다.' : `${type === 'deposit' ? '입금' : '출금'} 신청이 접수되었습니다.`); U.toast(c.status === 'approved' ? '승인되어 즉시 반영되었습니다.' : '신청이 접수되었습니다. 승인 대기 중입니다.'); } catch (e) { U.toast(e.message, true); }
    };
    function conv(a) {
      if (!a) return '';
      if (coin(method)) return `(약 ${(a / Market.fx()).toFixed(2)} ${method.toUpperCase()} · 환율 ${U.n2(Market.fx())}원)`;
      if (method === 'moa') return S.st.moaKrw > 0 ? `(약 ${n0(a / S.st.moaKrw)} MOA · 1 MOA = ${n0(S.st.moaKrw)}원)` : '(MOA 시세 연동 예정 · 원화 기준 신청)';
      if (method === 'maxp') return `(${n0(a / (S.st.maxpKrw || 1))} P 사용)`;
      return '';
    }
    function sum() {
      const a = amt(); const after = type === 'deposit' ? S.v.cash + a : S.v.cash - a;
      $('#cSum').innerHTML = `<dl class="kv"><dt>${type === 'deposit' ? '충전 수단' : '받을 수단'}</dt><dd>${PAYN(method)}${coin(method) || method === 'moa' ? ' · ' + chain : ''}</dd>${conv(a) ? `<dt>환산</dt><dd>${conv(a).replace(/[()]/g, '')}</dd>` : ''}${S.v.loan ? '<dt>MAX 버프</dt><dd class="down">사용 중 · 출금 불가</dd>' : ''}<dt>현재 예수금</dt><dd>${won(S.v.cash)}</dd>${type === 'withdraw' ? `<dt>출금가능금액</dt><dd>${won(S.v.withdrawable)}</dd>` : `<dt>1회 최대</dt><dd>${won(S.st.maxDeposit)}</dd>`}<dt>승인 후 예수금</dt><dd class="${type === 'deposit' ? 'up' : 'down'}">${won(Math.max(0, after))}</dd></dl>`;
    }
    function data() {
      const v = S.v; meths(); sum();
      $('#cAcct').innerHTML = `<div class="acct-head"><div><small>MAX라이프 주식 · 종합계좌</small><b>${acctNo(S.user.id)}</b><span>${esc(S.user.name)} 님</span></div><button class="btn btn-sm" id="cCopy">계좌번호 복사</button></div><div class="stat" style="margin-top:14px"><div class="k">예수금</div><div class="v" style="font-size:28px">${won(v.cash)}</div></div><div class="divider"></div><dl class="kv"><dt>출금가능금액</dt><dd><b>${won(v.withdrawable)}</b></dd><dt>주문 대기 금액</dt><dd>${won(v.reserved)}</dd><dt>투자원금</dt><dd>${won(v.principal)}</dd>${S.user.initial ? `<dt>최초 지급액</dt><dd>${won(S.user.initial)}</dd>` : ''}<dt>누적 입금</dt><dd class="up">${won(v.deposits)}</dd><dt>누적 출금</dt><dd class="down">${won(v.withdrawals)}</dd></dl>`;
      { const cc = $('#cCopy'); if (cc) cc.onclick = () => { try { navigator.clipboard.writeText(acctNo(S.user.id).replace(/-/g, '')); U.toast('계좌번호를 복사했습니다.'); } catch { U.toast(acctNo(S.user.id)); } }; }
      const cs = S.d.cashflows.slice().sort((a, b) => b.at.localeCompare(a.at));
      const stt = { pending: ['승인 대기', 'tag-wait'], approved: ['승인 완료', 'tag-ok'], rejected: ['반려', 'tag-sell'], cancelled: ['취소', 'tag-no'] };
      $('#cList').innerHTML = cs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th>구분</th><th>수단</th><th>금액</th><th class="l hide-m">메모</th><th>상태</th><th class="hide-m">처리일시</th><th></th></tr></thead><tbody>${cs.map((c) => `<tr><td class="dim">${U.dt(c.at)}</td><td><span class="tag ${c.type === 'deposit' ? 'tag-buy' : 'tag-sell'}">${c.type === 'deposit' ? '입금' : '출금'}</span></td><td>${PAYN(c.method)}</td><td><b>${won(c.amount)}</b></td><td class="l hide-m muted">${esc(c.memo || '')}${c.adminMemo ? ` <span class="dim">· ${esc(c.adminMemo)}</span>` : ''}</td><td><span class="tag ${stt[c.status][1]}">${stt[c.status][0]}</span></td><td class="hide-m dim">${c.processedAt ? U.dt(c.processedAt) : '-'}</td><td>${c.status === 'pending' ? `<button class="btn btn-sm" data-cc="${c.id}">취소</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">입출금 내역이 없습니다</div>';
      $$('[data-cc]').forEach((b) => (b.onclick = async () => { try { await Store.cancelCash(b.dataset.cc); U.toast('신청이 취소되었습니다.'); } catch (e) { U.toast(e.message, true); } }));
    }
    data();
    return { data, tick: () => { $('#cAcct') && data(); } };
  }

  // ═════════ 리딩룸 ═════════
  function Lead(main) {
    const staff = S.user.role !== 'user';
    let filter = 'all';
    main.innerHTML = `${head('MAX 리딩', 'MAX 리딩이 가상계좌로 직접 보여주는 실전 매매 리딩입니다.', staff ? '<button class="btn btn-brand" id="lNew">리딩 작성</button>' : '')}
      <div class="grid g-main">
        <section class="panel"><div class="tabs" id="lTab"><button data-v="all" class="on">전체</button><button data-v="trade">매매 시연</button><button data-v="lesson">해설</button><button data-v="open">진행중</button></div><div id="lFeed"></div></section>
        <div>
          <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>실시간 공지</h3>${staff ? '<button class="btn btn-sm" id="nNew">공지 작성</button>' : ''}</div><div id="lNotice"></div></section>
          <section class="panel"><div class="panel-h"><h3>리딩 성과</h3></div><div class="panel-b" id="lPerf"></div></section>
          <p class="dim" style="font-size:11px;margin-top:12px;line-height:1.7;padding:0 4px">MAX 리딩의 모든 매매는 가상계좌 기반 시연이며, 특정 종목의 매수·매도를 권유하는 투자자문이 아닙니다. 투자 판단과 책임은 본인에게 있습니다.</p>
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
        <div class="feed-meta"><span class="avatar">${esc((p.authorName || '강').slice(0, 1))}</span><div class="who"><b>${esc(p.authorName || 'MAX 리딩')}</b><small>${U.ago(p.at)}${p.updatedAt ? ' · 수정됨' : ''}</small></div><div style="margin-left:auto;display:flex;gap:6px;align-items:center">${p.kind === 'trade' ? `<span class="tag ${p.side === 'sell' ? 'tag-sell' : 'tag-buy'}">${p.side === 'sell' ? '매도 시연' : '매수 시연'}</span>` : '<span class="tag tag-brand">해설</span>'}${resultTag(p)}</div></div>
        <h3>${esc(p.title)}</h3>
        ${q && p.kind === 'trade' ? `<a href="#/stock/${p.code}" style="display:inline-flex;gap:8px;align-items:baseline;font-size:13px;margin-bottom:4px"><b>${esc(q.name)}</b><span class="dim">${p.code}</span><span class="${cls(q.change)}">${px(q.price, q.currency)} ${pct(q.changePct)}</span></a>
          <div class="plan"><div><small>진입가</small><b>${px(p.entry, q.currency)}</b></div><div><small>목표가</small><b class="up">${px(p.target, q.currency)}</b></div><div><small>손절가</small><b class="down">${px(p.stop, q.currency)}</b></div><div><small>${p.result === 'open' ? '현재 수익률' : '결과'}</small><b class="${cls(p.result === 'open' ? live : p.resultPct)}">${p.result === 'open' ? pct(live) : pct(+p.resultPct || 0)}</b></div></div>
          <div class="mini-chart"><canvas data-mc="${p.id}"></canvas></div>` : ''}
        ${p.image ? `<img src="${esc(p.image)}" alt="" style="border-radius:6px;border:1px solid var(--border);margin:12px 0" loading="lazy">` : ''}
        <div class="body">${esc(p.body)}</div>
        ${yt ? `<div class="video-wrap"><iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen loading="lazy" title="리딩 영상"></iframe></div>` : p.video ? `<p style="margin-top:10px"><a class="brand" href="${esc(p.video)}" target="_blank" rel="noopener">리딩 영상 보기 →</a></p>` : ''}
        <div class="feed-actions"><button class="btn btn-sm ${p.likes.includes(S.user.id) ? 'btn-brand' : ''}" data-like="${p.id}">도움돼요 ${p.likes.length}</button>${q && p.kind === 'trade' && p.result === 'open' ? `<button class="btn btn-sm" data-follow="${p.id}">내 계좌로 따라하기</button>` : ''}${can ? `<button class="btn btn-sm btn-ghost" data-edit="${p.id}" style="margin-left:auto">수정</button><button class="btn btn-sm btn-ghost" data-del="${p.id}">삭제</button>` : ''}</div>
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
    let by = 'pct', period = 'all';
    main.innerHTML = `${head('투자 수익 랭킹', '이용자들의 투자 수익 순위입니다. 닉네임으로 표시됩니다.', `<span class="dim" style="font-size:12px" id="rkT"></span>`)}
      <section class="panel" style="margin-bottom:16px"><div class="panel-h" style="flex-wrap:wrap;gap:8px"><div class="seg" id="rkBy"><button data-v="pct">수익률</button><button data-v="pnl">수익금</button><button data-v="real">실현손익</button><button data-v="trades">거래 횟수</button></div><div class="seg" id="rkP"><button data-v="all">전체</button><button data-v="month">이번 달</button><button data-v="week">최근 7일</button></div></div></section>
      <div id="rk"></div>`;
    const since = () => { const d = new Date(); if (period === 'week') d.setDate(d.getDate() - 7); else if (period === 'month') d.setDate(1); else return null; d.setHours(0, 0, 0, 0); return d; };
    $('#rkBy').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; by = b.dataset.v; draw(); };
    $('#rkP').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; period = b.dataset.v; draw(); };
    let raw = [];
    function draw() {
      $$('#rkBy button').forEach((x) => x.classList.toggle('on', x.dataset.v === by)); $$('#rkP button').forEach((x) => x.classList.toggle('on', x.dataset.v === period));
      const sd = since();
      const rows = raw.map((b) => {
        const v = Engine.valuate(b, S.st);
        const fills = (b.fills || []).filter((f) => !sd || !f.at || new Date(f.at) >= sd);
        let base = v.principal, pnl = v.netPnl;
        if (sd) { const snap = (b.snapshots || []).filter((x) => new Date(x[0]) < sd).sort((x, y) => (x[0] < y[0] ? 1 : -1))[0]; if (snap) { base = snap[1]; pnl = v.net - base; } }
        return { id: b.user.id, name: b.user.name, grade: GRADE(b.user.grade).name, net: v.net, pnl, pct: base ? (pnl / base) * 100 : 0, real: fills.reduce((t, f) => t + (f.pnl || 0), 0), trades: fills.length, n: v.holdings.length, buff: !!v.loan };
      });
      const key = { pct: (r) => r.pct, pnl: (r) => r.pnl, real: (r) => r.real, trades: (r) => r.trades }[by];
      rows.sort((x, y) => key(y) - key(x));
      const me = rows.findIndex((r) => r.id === S.user.id);
      const nm = (r) => esc(r.name) + (r.id === S.user.id ? ' <span class="tag tag-brand">나</span>' : '');
      const metric = (r) => (by === 'pct' ? pct(r.pct) : by === 'pnl' ? signedWon(r.pnl) : by === 'real' ? signedWon(r.real) : n0(r.trades) + '회');
      const mcls = (r) => (by === 'trades' ? '' : cls(by === 'pct' ? r.pct : by === 'pnl' ? r.pnl : r.real));
      $('#rkT').textContent = rows.length + '명 참여';
      $('#rk').innerHTML = `
        ${me >= 0 ? `<div class="notice-bar"><b>내 순위</b><span>${me + 1}위 / ${rows.length}명 · 수익률 <b class="${cls(rows[me].pct)}" style="color:inherit">${pct(rows[me].pct)}</b> · 수익금 <b>${signedWon(rows[me].pnl)}</b></span></div>` : ''}
        <div class="podium">${rows.slice(0, 3).map((r, i) => `<div class="panel ${i === 0 ? 'first' : ''}"><div class="medal">${i + 1}ST</div><span class="avatar">${esc(r.name.slice(0, 1))}</span><div><b>${nm(r)}</b><div class="dim" style="font-size:12px">${r.grade} · 순자산 ${won(r.net)}</div></div><div class="rt ${mcls(r)}">${metric(r)}</div></div>`).join('')}</div>
        <section class="panel"><div class="table-wrap"><table class="t"><thead><tr><th>순위</th><th class="l">닉네임</th><th>등급</th><th>수익률</th><th>수익금</th><th class="hide-m">실현손익</th><th class="hide-m">순자산</th><th class="hide-m">보유</th><th class="hide-m">거래</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.id === S.user.id ? 'me' : ''}"><td><b>${i + 1}</b></td><td class="l">${nm(r)}${r.buff ? ' <span class="tag tag-wait">버프</span>' : ''}</td><td>${r.grade}</td><td class="${cls(r.pct)}"><b>${pct(r.pct)}</b></td><td class="${cls(r.pnl)}">${signedWon(r.pnl)}</td><td class="hide-m ${cls(r.real)}">${signedWon(r.real)}</td><td class="hide-m">${won(r.net)}</td><td class="hide-m">${r.n}</td><td class="hide-m">${r.trades}</td></tr>`).join('') || '<tr><td colspan="9"><div class="empty">참여자가 없습니다</div></td></tr>'}</tbody></table></div></section>`;
    }
    async function data() { raw = await Store.ranking(); draw(); }
    data();
    let t = 0;
    return { data, tick: () => { if (Date.now() - t > 15000) { t = Date.now(); data(); } } };
  }

  // ═════════ MAX 버프 (담보 신용) ═════════
  function gauge(v) {
    if (!v.loan) return '';
    const r = v.ratio || 0, mt = v.maintain || 120, warn = (S.st.buffWarn || 140);
    const lo = 100, hi = Math.max(250, r + 20); const pos = (x) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
    const col = r < mt ? 'var(--up)' : r < warn ? 'var(--warn)' : 'var(--ok)';
    return `<div class="gauge"><div class="gbar"><i style="width:${pos(r)}%;background:${col}"></i><em style="left:${pos(mt)}%" title="청산 기준"></em><em class="w" style="left:${pos(warn)}%" title="주의"></em></div><div class="glab"><span>청산 ${mt}%</span><span>주의 ${warn}%</span><b style="color:${col}">현재 ${r.toFixed(1)}%</b></div></div>`;
  }
  function Buff(main) {
    let mult = 1;
    main.innerHTML = `${head('MAX 버프', '자신 있는 종목에 더 크게 투자하세요. 순자산의 1~3배를 지원받고, 담보비율이 기준 아래로 내려가면 자동 청산됩니다.')}
      <div id="bfNow"></div>
      <div class="grid g-main" style="margin-bottom:16px"><section class="panel"><div class="panel-h"><h3>버프 신청</h3><span class="dim" id="bfGrade" style="font-size:12px"></span></div><div class="panel-b" id="bfForm"></div></section>
      <section class="panel"><div class="panel-h"><h3>이용 안내</h3></div><div class="panel-b" style="font-size:13px;line-height:1.8" id="bfGuide"></div></section></div>
      <section class="panel"><div class="panel-h"><h3>버프 내역</h3></div><div class="panel-b flush" id="bfList"></div></section>`;
    function data() {
      const v = S.v; const g = GRADE(S.user.grade); const buffs = S.d.buffs || []; const pend = buffs.find((b) => b.status === 'pending');
      $('#bfGrade').textContent = `내 등급 ${g.name} · 최대 ${g.maxMult}배`;
      $('#bfNow').innerHTML = v.loan ? `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>사용 중인 버프 · ${v.buff.mult}배</h3><button class="btn btn-sm btn-brand" id="bfRepay">전액 상환</button></div><div class="panel-b">
          <div class="grid g-4" style="margin-bottom:14px"><div class="stat"><div class="k">지원금 (대출)</div><div class="v" style="font-size:20px">${won(v.loan)}</div></div><div class="stat"><div class="k">누적 이자 (연 ${v.buff.rate}%)</div><div class="v" style="font-size:20px">${won(v.interest)}</div></div><div class="stat"><div class="k">총 평가자산</div><div class="v" style="font-size:20px">${won(v.total)}</div></div><div class="stat"><div class="k">순자산</div><div class="v ${cls(v.net - v.buff.baseNet)}" style="font-size:20px">${won(v.net)}</div></div></div>
          ${gauge(v)}<p class="dim" style="font-size:12px;margin-top:10px">담보비율 = 총 평가자산 ÷ (지원금 + 이자) × 100. 청산 기준 ${v.maintain}% 미만이 되면 보유 종목이 시장가로 전량 매도되어 자동 상환됩니다.</p></div></section>` : '';
      const f = $('#bfForm');
      if (v.loan) f.innerHTML = '<div class="empty">사용 중인 버프를 상환한 뒤 다시 신청할 수 있습니다.</div>';
      else if (pend) f.innerHTML = `<div class="notice-bar"><b>심사 중</b><span>${pend.mult}배 · ${won(pend.amount)} 신청 · ${U.dt(pend.createdAt)}</span></div><button class="btn" id="bfCancel" data-id="${pend.id}">신청 취소</button>`;
      else {
        const opts = [1, 2, 3].map((m) => { const ok = m <= Math.min(g.maxMult, S.st.buffMaxMult || 3); const amt = Math.max(0, v.net) * m; const ratio = amt ? ((v.total + amt) / amt) * 100 : 0; return `<button class="buff-opt ${m === mult ? 'on' : ''}" data-m="${m}" ${ok ? '' : 'disabled'}><b>${m}배</b><span>${won(amt)}</span><small>${ok ? '시작 담보비율 ' + ratio.toFixed(0) + '%' : g.name + ' 등급 이용 불가'}</small></button>`; }).join('');
        const amt = Math.max(0, v.net) * mult;
        f.innerHTML = `<div class="buff-grid" id="bfM">${opts}</div>
          <dl class="kv" style="margin-top:14px"><dt>내 순자산</dt><dd>${won(v.net)}</dd><dt>지원 예정 금액</dt><dd class="up">${won(amt)}</dd><dt>이자율 (연)</dt><dd>${g.rate}%</dd><dt>청산 기준 담보비율</dt><dd>${g.maintain}%</dd><dt>최소 신청 순자산</dt><dd>${won(S.st.buffMinNet || 0)}</dd></dl>
          <div class="field" style="margin-top:12px"><label>신청 사유 (선택)</label><input class="input" id="bfMemo" maxlength="100" placeholder="예: 반도체 업황 회복 기대, 삼성전자 집중 매수"></div>
          <label class="check" style="margin:8px 0 12px"><input type="checkbox" id="bfAgree"> 담보비율이 ${g.maintain}% 미만이 되면 보유 종목이 자동 청산(반대매매)되는 것에 동의합니다.</label>
          <button class="btn btn-brand btn-block btn-lg" id="bfGo" ${S.st.buffEnabled === false ? 'disabled' : ''}>${S.st.buffEnabled === false ? '현재 신청 중단' : mult + '배 버프 신청'}</button>`;
        $('#bfM').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b || b.disabled) return; mult = +b.dataset.m; data(); };
        $('#bfGo').onclick = async () => { if (!$('#bfAgree').checked) return U.toast('자동 청산 안내에 동의해 주세요.', true); try { const r = await Store.requestBuff(mult, $('#bfMemo').value); U.toast(r.status === 'active' ? '버프가 바로 지급되었습니다.' : '신청이 접수되었습니다. 관리자 승인 후 지급됩니다.'); } catch (e) { U.toast(e.message, true); } };
      }
      const cb = $('#bfCancel'); if (cb) cb.onclick = async () => { try { await Store.cancelBuff(cb.dataset.id); U.toast('신청이 취소되었습니다.'); } catch (e) { U.toast(e.message, true); } };
      const rb = $('#bfRepay'); if (rb) rb.onclick = async () => { if (!(await U.confirmBox('버프 전액 상환', `<dl class="kv"><dt>지원금</dt><dd>${won(v.loan)}</dd><dt>이자</dt><dd>${won(v.interest)}</dd><dt><b>상환 금액</b></dt><dd><b>${won(v.loan + v.interest)}</b></dd><dt>상환 후 예수금</dt><dd>${won(v.cash - v.loan - v.interest)}</dd></dl>`, '상환'))) return; try { await Store.repayBuff(); U.toast('상환이 완료되었습니다.'); } catch (e) { U.toast(e.message, true); } };
      $('#bfGuide').innerHTML = `<ol style="padding-left:18px;margin:0"><li>등급별로 순자산의 최대 ${g.maxMult}배까지 신청할 수 있습니다. (등급은 관리자가 조정합니다)</li><li>관리자 승인 후 지원금이 예수금으로 들어오고, 바로 매수에 쓸 수 있습니다.</li><li>이자는 연 ${g.rate}% 일할 계산되며 상환할 때 함께 정산됩니다.</li><li>담보비율이 <b>주의 ${S.st.buffWarn || 140}%</b> 아래면 화면에 경고가 표시됩니다.</li><li>담보비율이 <b>${g.maintain}% 미만</b>이 되면 보유 종목이 시장가로 전량 자동 매도되어 지원금과 이자가 상환됩니다.</li><li>버프 사용 중에는 출금할 수 없습니다.</li></ol>
        <div class="divider"></div><b style="font-size:13px">등급별 조건</b><div class="table-wrap" style="margin-top:6px"><table class="t"><thead><tr><th class="l">등급</th><th>최대 배수</th><th>이자 (연)</th><th>청산 기준</th></tr></thead><tbody>${(S.st.grades || []).map((x) => `<tr class="${x.id === g.id ? 'me' : ''}"><td class="l">${esc(x.name)}</td><td>${x.maxMult}배</td><td>${x.rate}%</td><td>${x.maintain}%</td></tr>`).join('')}</tbody></table></div>`;
      const stt = { pending: ['심사 중', 'tag-wait'], active: ['사용 중', 'tag-ok'], rejected: ['반려', 'tag-sell'], cancelled: ['취소', 'tag-no'], repaid: ['상환 완료', 'tag-brand'], liquidated: ['자동 청산', 'tag-sell'] };
      $('#bfList').innerHTML = buffs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th>배수</th><th>지원금</th><th>이자율</th><th>청산 기준</th><th>상태</th><th class="hide-m">이자</th><th class="hide-m">종료일시</th><th class="l hide-m">메모</th></tr></thead><tbody>${buffs.map((b) => `<tr><td class="dim">${U.dt(b.createdAt)}</td><td>${b.mult}배</td><td>${won(b.amount)}</td><td>${b.rate}%</td><td>${b.maintain}%</td><td><span class="tag ${(stt[b.status] || ['', ''])[1]}">${(stt[b.status] || [b.status])[0]}</span></td><td class="hide-m">${won(b.status === 'active' ? b.interestNow || 0 : b.interest || 0)}</td><td class="hide-m dim">${b.closedAt ? U.dt(b.closedAt) : '-'}</td><td class="l hide-m muted">${esc(b.memo || '')}${b.adminMemo ? ' · ' + esc(b.adminMemo) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">버프 내역이 없습니다</div>';
    }
    data();
    let t = 0;
    return { data, tick: () => { if (Date.now() - t > 4000) { t = Date.now(); data(); } } };
  }

  // ═════════ 조건검색 ═════════
  function Screen(main) {
    const DEF = { mk: 'KR', sub: 'all', pmin: '', pmax: '', cmin: '', cmax: '', vmin: '', capmin: '', capmax: '', near: false, limit: false, sort: 'value' };
    let F = (() => { try { return { ...DEF, ...JSON.parse(localStorage.getItem('mls.scr') || '{}') }; } catch { return { ...DEF }; } })();
    const PRESET = [['급등 (+10% 이상)', { cmin: 10, cmax: '', sort: 'up' }], ['급락 (−10% 이하)', { cmin: '', cmax: -10, sort: 'down' }], ['거래대금 1,000억 이상', { vmin: 100000000000, sort: 'value' }], ['시총 1조 이상 · 상승', { capmin: 1000000000000, cmin: 0.01, sort: 'up' }], ['52주 신고가 근접', { near: true, sort: 'high' }], ['상한가', { limit: true, sort: 'up' }]];
    main.innerHTML = `${head('조건검색', '조건을 조합해 전 종목에서 원하는 종목을 찾습니다.')}
      <section class="panel" style="margin-bottom:16px"><div class="panel-b">
        <div class="chips" id="scP" style="margin-bottom:12px">${PRESET.map(([n], i) => `<button class="chip" data-p="${i}">${n}</button>`).join('')}<button class="chip" data-p="reset">초기화</button></div>
        <div class="scr-grid">
          <div class="field"><label>시장</label><select class="input" id="scMk"><option value="KR">국내 전체</option><option value="KOSPI">코스피</option><option value="KOSDAQ">코스닥</option><option value="ETF">국내 ETF</option><option value="US">미국 전체</option><option value="NASDAQ">나스닥</option><option value="NYSE">뉴욕</option></select></div>
          <div class="field"><label>현재가 (원/달러)</label><div style="display:flex;gap:6px"><input class="input" id="scPmin" placeholder="최소" inputmode="decimal"><input class="input" id="scPmax" placeholder="최대" inputmode="decimal"></div></div>
          <div class="field"><label>등락률 (%)</label><div style="display:flex;gap:6px"><input class="input" id="scCmin" placeholder="최소" inputmode="decimal"><input class="input" id="scCmax" placeholder="최대" inputmode="decimal"></div></div>
          <div class="field"><label>거래대금 최소 (원)</label><input class="input" id="scVmin" placeholder="예: 10000000000" inputmode="numeric"></div>
          <div class="field"><label>시가총액 (원)</label><div style="display:flex;gap:6px"><input class="input" id="scCapmin" placeholder="최소" inputmode="numeric"><input class="input" id="scCapmax" placeholder="최대" inputmode="numeric"></div></div>
          <div class="field"><label>정렬</label><select class="input" id="scSort"><option value="value">거래대금</option><option value="up">상승률</option><option value="down">하락률</option><option value="cap">시가총액</option><option value="volume">거래량</option><option value="high">52주 고가 근접</option></select></div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px"><label class="check"><input type="checkbox" id="scNear"> 52주 최고가 5% 이내</label><label class="check"><input type="checkbox" id="scLimit"> 상한가 종목만</label></div>
      </div></section>
      <section class="panel"><div class="panel-h"><h3 id="scN">검색 결과</h3></div><div id="scL"></div></section>`;
    const ids = { mk: 'scMk', pmin: 'scPmin', pmax: 'scPmax', cmin: 'scCmin', cmax: 'scCmax', vmin: 'scVmin', capmin: 'scCapmin', capmax: 'scCapmax', sort: 'scSort' };
    const fill = () => { for (const [k, id] of Object.entries(ids)) $('#' + id).value = F[k] ?? ''; $('#scNear').checked = !!F.near; $('#scLimit').checked = !!F.limit; };
    const read = () => { for (const [k, id] of Object.entries(ids)) F[k] = $('#' + id).value.replace(/,/g, '').trim(); F.near = $('#scNear').checked; F.limit = $('#scLimit').checked; try { localStorage.setItem('mls.scr', JSON.stringify(F)); } catch {} };
    main.addEventListener('input', (e) => { if (e.target.closest('.scr-grid') || e.target.type === 'checkbox') { read(); clearTimeout(main._t); main._t = setTimeout(draw, 250); } });
    main.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') { read(); draw(); } });
    $('#scP').onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; F = b.dataset.p === 'reset' ? { ...DEF } : { ...DEF, mk: F.mk, ...PRESET[+b.dataset.p][1] }; fill(); read(); draw(); };
    bindGo($('#scL'));
    $('#scL').addEventListener('click', async (e) => { const st = e.target.closest('[data-star]'); if (st) { e.stopPropagation(); await Store.toggleWatch(st.dataset.star); } });
    function draw() {
      const num = (x) => (x === '' || x == null ? null : +x);
      const mk = F.mk; const w = S.user.watch || [];
      let L = Market.list((q) => {
        if (mk === 'KR' ? q.currency !== 'KRW' : mk === 'US' ? q.currency !== 'USD' : mk === 'ETF' ? q.type !== 'etf' : q.market !== mk || q.type === 'etf') return false;
        const val = Market.toKrw(q.value || q.price * q.volume, q.currency), cap = Market.toKrw(q.marketCap || 0, q.currency);
        if (num(F.pmin) != null && q.price < num(F.pmin)) return false; if (num(F.pmax) != null && q.price > num(F.pmax)) return false;
        if (num(F.cmin) != null && q.changePct < num(F.cmin)) return false; if (num(F.cmax) != null && q.changePct > num(F.cmax)) return false;
        if (num(F.vmin) != null && val < num(F.vmin)) return false;
        if (num(F.capmin) != null && cap < num(F.capmin)) return false; if (num(F.capmax) != null && cap > num(F.capmax)) return false;
        if (F.near && !(q.high52 && q.price >= q.high52 * 0.95)) return false;
        if (F.limit && !(q.upper && q.price >= q.upper)) return false;
        return q.volume > 0 || !(F.sort === 'up' || F.sort === 'down');
      });
      const val = (q) => Market.toKrw(q.value || q.price * q.volume, q.currency);
      const SO = { value: (a, b) => val(b) - val(a), up: (a, b) => b.changePct - a.changePct, down: (a, b) => a.changePct - b.changePct, cap: (a, b) => Market.toKrw(b.marketCap || 0, b.currency) - Market.toKrw(a.marketCap || 0, a.currency), volume: (a, b) => b.volume - a.volume, high: (a, b) => (b.high52 ? b.price / b.high52 : 0) - (a.high52 ? a.price / a.high52 : 0) };
      L.sort(SO[F.sort] || SO.value);
      $('#scN').textContent = `검색 결과 ${n0(L.length)}종목` + (L.length > 200 ? ' (상위 200개 표시)' : '');
      $('#scL').innerHTML = `<div class="table-wrap"><table class="t"><thead><tr><th class="l">종목</th><th>현재가</th><th>등락률</th><th class="hide-m">거래량</th><th class="hide-m">거래대금</th><th class="hide-m">시가총액</th><th></th></tr></thead><tbody>${L.slice(0, 200).map((q) => `<tr class="click" data-go="${q.code}"><td class="l"><div class="sname"><b>${esc(q.name)}</b><small>${q.code} · ${q.type === 'etf' ? 'ETF' : q.market}</small></div></td><td class="${cls(q.change)}"><b>${px(q.price, q.currency)}</b></td><td class="${cls(q.change)}">${pct(q.changePct)}</td><td class="hide-m">${n0(q.volume)}</td><td class="hide-m">${compact(val(q))}원</td><td class="hide-m">${q.marketCap ? compact(Market.toKrw(q.marketCap, q.currency)) + '원' : '-'}</td><td><button class="star ${w.includes(q.code) ? 'on' : ''}" data-star="${q.code}" data-stop>${ICON.star}</button></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">조건에 맞는 종목이 없습니다.</div></td></tr>'}</tbody></table></div>`;
    }
    fill(); draw();
    let t = 0;
    return { data: draw, tick: () => { if (Date.now() - t > 10000) { t = Date.now(); draw(); } } };
  }

  // 장 운영 현황 · 시간표
  function sesStrip() {
    const kr = Market.session('KR'), us = Market.session('US');
    const card = (t, ss, rows) => `<div class="ses-card ${ss.open ? 'on' : ss.ext ? 'ext' : 'off'}"><div class="sc-h"><b><i></i>${t} · ${ss.label}</b>${ss.left != null ? `<span>${ss.nextLabel}까지 ${ss.left >= 60 ? Math.floor(ss.left / 60) + '시간 ' : ''}${ss.left % 60}분</span>` : ''}</div><div class="sc-t">${rows.map(([c, n, h]) => `<span class="${ss.code === c ? 'cur' : ''}"><em>${n}</em>${h}</span>`).join('')}</div></div>`;
    const dst = us.extHours.match(/\d\d:\d\d/g) || [];
    return `<div class="ses-strip">${card('국내', kr, [['pre_close', '장전 시간외', '08:30'], ['pre_auction', '동시호가', '08:40'], ['regular', '정규장', '09:00'], ['close_auction', '마감 동시호가', '15:20'], ['post_close', '장후 시간외', '15:40'], ['single', '시간외 단일가', '16:00~18:00']])}${card('미국', us, [['pre', '프리마켓', dst[0] || ''], ['regular', '정규장', us.hours.split('~')[0]], ['after', '애프터마켓', (dst[2] || '') + (dst[3] ? '~' + dst[3] : '')]])}</div>`;
  }

  // ═════════ MAX AI 분석 ═════════
  const AI = {
    st: null,
    async status(force) { if (!this.st || force) { try { this.st = await Store.aiStatus(); } catch { this.st = null; } } return this.st; },
    async run(code) {
      const q = Market.quote(code); if (!q) throw new Error('종목을 찾을 수 없습니다.');
      this.st = await Store.aiUse(code); // 이용 한도 확인·차감 (오늘 본 종목은 차감 안 함)
      const [c, info] = await Promise.all([Market.candles(code, 'D'), q.currency === 'KRW' ? Market.info(code) : Promise.resolve(null)]);
      return AICore.analyze({ bars: c.data, price: q.price, code, name: q.name, currency: q.currency, info });
    },
    gate(msg) {
      return `<div class="ai-gate"><div class="ai-ic">${ICON.spark}</div><b>${esc(msg || 'AI 분석을 이용할 수 없습니다.')}</b><p class="muted">AI 월정액을 구독하면 매일 더 많은 종목을 분석하고, 매일 갱신되는 AI 추천종목 전체를 볼 수 있습니다.${S.user.cardTier ? '' : ' MAX DAY LIFE 카드 회원은 베이직 혜택이 무료입니다.'}</p><a class="btn btn-brand" href="#/ai/sub">AI 월정액 보기</a></div>`;
    },
    px(x, ccy) { return ccy === 'USD' ? '$' + (+x).toFixed(2) : n0(U.roundTick(x, 'KRW')) + '원'; },
    report(R, compact) {
      if (!R || !R.ok) return `<div class="empty">${esc((R && R.reason) || '분석할 수 없습니다.')}</div>`;
      const K = { trend: '추세', momentum: '모멘텀', supply: '수급', volume: '거래량', position: '가격 위치', value: '재무·가치', news: '뉴스·공시' };
      const deg = Math.round((R.score / 100) * 180);
      const L = R.levels, I = R.ind, c = R.currency;
      return `<div class="ai-rep">
        <div class="ai-top"><div class="ai-gauge" style="--d:${deg}deg"><div class="g-arc"></div><div class="g-v"><b>${R.score}</b><small>/100</small></div></div>
          <div class="ai-op"><span class="ai-badge ${R.tone}">${R.opinion}</span><h3>${esc(R.name)} <small class="dim">${R.code}</small></h3><p>${esc(R.summary)}</p></div></div>
        <div class="ai-bars">${Object.keys(K).map((k) => `<div class="ai-bar"><span>${K[k]}</span><div><i style="width:${(R.scores[k] / R.max[k]) * 100}%"></i></div><b>${R.scores[k]}<small>/${R.max[k]}</small></b></div>`).join('')}</div>
        <div class="ai-lv">${[['손절 기준', L.stop, 'down'], ['1차 지지', L.support, ''], ['현재가', R.price, 'cur'], ['1차 저항', L.resist, ''], ['2차 목표', L.target2, 'up']].map(([n, v, k]) => `<div class="${k}"><small>${n}</small><b>${this.px(v, c)}</b></div>`).join('')}</div>
        <p class="dim" style="font-size:12px;margin:6px 0 14px">손익비(1차 저항까지 기대수익 ÷ 손절 시 손실) ${L.rr.toFixed(2)} · ${L.rr >= 2 ? '유리한 구간' : L.rr >= 1 ? '보통' : '불리한 구간 — 눌림 확인 후 접근'}</p>
        <div class="grid g-2 stack" style="gap:14px">
          <div><h4 class="ai-h">판단 근거</h4><ul class="ai-f">${R.factors.map(([t, x]) => `<li class="${t === '+' ? 'p' : 'n'}"><i>${t === '+' ? '▲' : '▼'}</i>${esc(x)}</li>`).join('') || '<li>특이 신호 없음</li>'}</ul></div>
          <div><h4 class="ai-h">주요 지표</h4><dl class="kv ai-kv"><dt>RSI(14)</dt><dd>${I.rsi != null ? I.rsi.toFixed(1) : '-'}</dd><dt>MACD 히스토그램</dt><dd class="${cls(I.hist || 0)}">${I.hist != null ? (I.hist > 0 ? '+' : '') + (c === 'USD' ? I.hist.toFixed(2) : n0(I.hist)) : '-'}</dd><dt>이평선 5/20/60</dt><dd>${[I.ma5, I.ma20, I.ma60].map((x) => (x ? this.px(x, c) : '-')).join(' · ')}</dd><dt>변동성(ATR)</dt><dd>${I.atrPct.toFixed(1)}%</dd><dt>거래량(5일/20일)</dt><dd>${I.volR.toFixed(2)}배</dd><dt>52주 위치</dt><dd>${(I.pos52 * 100).toFixed(0)}% (${this.px(I.lo52, c)} ~ ${this.px(I.hi52, c)})</dd><dt>수익률 5·20·60일</dt><dd>${[I.r5, I.r20, I.r60].map((x) => (x == null ? '-' : `<span class="${cls(x)}">${pct(x)}</span>`)).join(' · ')}</dd>${I.per != null ? `<dt>PER · 추정PER · PBR</dt><dd>${I.per ?? '-'} · ${I.cper ?? '-'} · ${I.pbr ?? '-'}</dd>` : ''}</dl></div>
        </div>
        ${R.news && R.news.length ? `<h4 class="ai-h" style="margin-top:14px">뉴스·리포트 감성</h4><ul class="ai-f">${R.news.map((n) => `<li class="${n.s >= 0 ? 'p' : 'n'}"><i>${n.s >= 0 ? '＋' : '－'}</i>${esc(n.t)}</li>`).join('')}</ul>` : ''}
        <div class="ai-foot">${compact ? `<a class="btn btn-sm" href="#/ai/analyze/${R.code}">전체 화면으로 보기</a>` : `<a class="btn btn-sm btn-brand" href="#/stock/${R.code}">주문 화면으로</a>`}<span class="dim">${U.dt(R.at)} 분석 · 차트(일봉)·이동평균·RSI·MACD·볼린저·거래량·외국인/기관 수급·PER/PBR·뉴스/리포트 제목을 종합한 알고리즘 결과이며, 투자 권유가 아닙니다. 최종 판단과 책임은 투자자 본인에게 있습니다.</span></div>
      </div>`;
    },
    bind() {},
  };
  function AiPage(main, sub, arg) {
    let tab = ['picks', 'analyze', 'holdings', 'sub'].includes(sub) ? sub : 'picks'; let mk = 'kr';
    main.innerHTML = `${head('MAX AI 분석', '차트·그래프·수급·재무·뉴스와 공시를 AI 알고리즘으로 분석해 종목 점수와 매매 구간을 알려드립니다.', '<span id="aiSt"></span>')}
      <div class="tabs" id="aiTab" style="margin-bottom:16px">${[['picks', '오늘의 AI 추천종목'], ['analyze', '종목 분석'], ['holdings', '내 보유종목 진단'], ['sub', 'AI 월정액']].map(([k, n]) => `<button data-v="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="aiBody"></div>`;
    $('#aiTab').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.v; history.replaceState(null, '', '#/ai/' + tab); $$('#aiTab button').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
    const stLine = async (force) => { const st = await AI.status(force); const el = $('#aiSt'); if (!el || !st) return; el.innerHTML = `<span class="tag ${st.source === 'free' ? 'tag-no' : 'tag-brand'}">${esc(st.planName)}</span> <span class="dim" style="font-size:12px">오늘 ${st.used}회 사용${st.unlimited ? ' · 무제한' : ` / ${st.limit}회`}${st.endsAt ? ` · ${U.date(st.endsAt)}까지` : ''}</span>`; };
    async function draw() {
      const el = $('#aiBody'); await stLine();
      if (tab === 'picks') {
        el.innerHTML = '<div class="empty">AI 추천종목을 불러오는 중…</div>';
        const P = await Market.aiPicks(); const st = AI.st || {};
        if (!P) { el.innerHTML = '<div class="empty">추천종목을 준비 중입니다. 장 마감 후 매일 갱신됩니다.</div>'; return; }
        const L = P[mk] || []; const T = P[mk + 'Theme'] || {}; const lock = !st.picks; const show = lock ? 3 : L.length;
        const row = (x, i) => { const q = Market.quote(x.code) || x; const p = q.price || x.price; return `<a class="ai-pick ${i >= show ? 'locked' : ''}" href="${i >= show ? '#/ai/sub' : '#/ai/analyze/' + x.code}"><span class="rk">${i + 1}</span><div class="sname"><b>${esc(x.name)}</b><small>${x.code} · ${x.market}</small></div><div class="sc"><b>${x.score}</b><small>${x.opinion}</small></div><div class="pp"><b class="${cls(q.changePct ?? x.changePct)}">${AI.px(p, x.currency)}</b><small class="${cls(q.changePct ?? x.changePct)}">${pct(q.changePct ?? x.changePct)}</small></div><div class="why">${x.why.map((w) => `<span>${esc(w.split(' — ')[0])}</span>`).join('')}</div><div class="lv"><small>지지 ${AI.px(x.support, x.currency)} · 저항 ${AI.px(x.resist, x.currency)} · 손익비 ${x.rr}</small></div></a>`; };
        const themeBox = (k, n, d) => { const A2 = T[k] || []; return `<section class="panel"><div class="panel-h"><h3>${n}</h3><span class="dim" style="font-size:12px">${d}</span></div><div class="panel-b flush">${A2.slice(0, lock ? 2 : 8).map((x) => `<a class="row ai-mini" href="#/ai/analyze/${x.code}"><div class="sname"><b>${esc(x.name)}</b><small>${x.code}</small></div><span class="tag tag-brand">${x.score}</span></a>`).join('') || '<div class="empty">해당 종목 없음</div>'}${lock && A2.length > 2 ? `<a class="row ai-mini locked" href="#/ai/sub"><span class="muted">+ ${A2.length - 2}종목 더 보기 (구독)</span></a>` : ''}</div></section>`; };
        el.innerHTML = `<div class="seg" id="aiMk" style="margin-bottom:12px"><button data-v="kr" class="${mk === 'kr' ? 'on' : ''}">국내</button><button data-v="us" class="${mk === 'us' ? 'on' : ''}">미국</button></div>
          <p class="dim" style="font-size:12px;margin:0 0 12px">${U.dt(P.updatedAt)} 기준 · 국내 ${n0(P.analyzed.kr)}종목 · 미국 ${n0(P.analyzed.us)}종목을 전부 분석해 점수 상위 종목을 골랐습니다 (손익비 1 이상).</p>
          <div class="grid g-main" style="gap:16px"><section class="panel"><div class="panel-h"><h3>AI 점수 상위 ${L.length}</h3>${lock ? '<a class="btn btn-sm btn-brand" href="#/ai/sub">전체 보기 · 구독</a>' : ''}</div><div class="panel-b flush">${L.map(row).join('') || '<div class="empty">조건에 맞는 종목이 없습니다</div>'}</div></section>
          <div style="display:grid;gap:16px;align-content:start">${themeBox('breakout', '돌파 · 신고가', '박스권 상단·52주 고점 돌파')}${themeBox('supply', '수급 강세', '외국인·기관 동반 매수')}${themeBox('rebound', '낙폭 과대 · 가치', 'RSI 과매도 + 저평가')}</div></div>`;
        $$('#aiMk button').forEach((b) => (b.onclick = () => { mk = b.dataset.v; draw(); }));
      } else if (tab === 'analyze') {
        el.innerHTML = `<section class="panel" style="margin-bottom:16px"><div class="panel-b"><div class="search ai-search">${ICON.search}<input id="aiQ" placeholder="분석할 종목명·코드 (예: 삼성전자, NVDA)" autocomplete="off"><div class="search-results hidden" id="aiQr"></div></div><div class="ai-quick">${['005930', '000660', '035420', '005380', 'NVDA', 'AAPL', 'TSLA'].filter((c) => Market.quote(c)).map((c) => `<button class="btn btn-sm" data-ac="${c}">${esc(Market.quote(c).name)}</button>`).join('')}</div></div></section><section class="panel"><div class="panel-b" id="aiRep"><div class="empty">종목을 선택하면 AI가 차트·수급·뉴스를 분석합니다.</div></div></section>`;
        const go = (code) => { history.replaceState(null, '', '#/ai/analyze/' + code); arg = code; one(code); };
        bindSearch($('#aiQ'), $('#aiQr'), go);
        $$('[data-ac]').forEach((b) => (b.onclick = () => go(b.dataset.ac)));
        if (arg) one(arg);
      } else if (tab === 'holdings') {
        const H = S.v.holdings;
        if (!H.length) { el.innerHTML = '<div class="empty">보유 종목이 없습니다.</div>'; return; }
        el.innerHTML = `<p class="muted" style="margin:0 0 12px">보유 종목 ${H.length}개를 한 번에 진단합니다. 종목마다 분석 횟수가 1회씩 차감됩니다 (오늘 이미 분석한 종목은 제외).</p><button class="btn btn-brand" id="aiHGo">${ICON.spark} 보유종목 전체 진단</button><div id="aiH" style="margin-top:16px"></div>`;
        $('#aiHGo').onclick = async () => {
          const box = $('#aiH'); box.innerHTML = '<div class="empty">진단 중…</div>'; const out = [];
          for (const h of H) { try { const R = await AI.run(h.code); out.push({ h, R }); } catch (e) { out.push({ h, err: e.message }); if (/한도|무료/.test(e.message)) break; } }
          stLine(true);
          box.innerHTML = `<section class="panel"><div class="table-wrap"><table class="t"><thead><tr><th class="l">종목</th><th>수익률</th><th>AI 점수</th><th>의견</th><th>손절 기준</th><th>1차 저항</th><th class="l hide-m">핵심 근거</th><th></th></tr></thead><tbody>${out.map(({ h, R, err }) => `<tr><td class="l"><div class="sname"><b>${esc(h.name)}</b><small>${h.code}</small></div></td><td class="${cls(h.pnlPct)}">${pct(h.pnlPct)}</td>${R && R.ok ? `<td><b>${R.score}</b></td><td><span class="ai-badge sm ${R.tone}">${R.opinion}</span></td><td class="down">${AI.px(R.levels.stop, R.currency)}${R.price < R.levels.stop ? ' <span class="tag tag-sell">이탈</span>' : ''}</td><td>${AI.px(R.levels.resist, R.currency)}</td><td class="l hide-m muted" style="font-size:12px">${esc((R.factors[0] || ['', ''])[1])}</td><td><a class="btn btn-sm" href="#/ai/analyze/${h.code}">상세</a></td>` : `<td colspan="6" class="muted">${esc(err || (R && R.reason) || '-')}</td>`}</tr>`).join('')}</tbody></table></div></section>`;
        };
      } else {
        el.innerHTML = '<div class="empty">불러오는 중…</div>';
        const [st, subs] = await Promise.all([AI.status(true), Store.mySubs().catch(() => [])]);
        const plans = S.st.aiPlans || []; let plan = (plans[1] || plans[0] || {}).id, meth = 'card';
        const stt = { pending: ['승인 대기', 'tag-wait'], active: ['이용 중', 'tag-ok'], rejected: ['반려', 'tag-sell'], cancelled: ['취소', 'tag-no'], expired: ['만료', 'tag-no'] };
        el.innerHTML = `<div class="ai-plans">${[{ id: '_free', name: '무료', price: 0, daily: S.st.aiFreeDaily ?? 3, free: true }, ...plans].map((p) => `<div class="ai-plan ${p.free ? 'free' : ''} ${p.id === plan ? 'on' : ''}" data-plan="${p.id}"><b>${esc(p.name)}</b><div class="pr">${p.price ? n0(p.price) + '<small>원 / ' + (p.days || 30) + '일</small>' : '0<small>원</small>'}</div><ul><li>종목 분석 ${p.daily ? `하루 ${p.daily}회` : '<b>무제한</b>'}</li><li>${p.free ? 'AI 추천종목 상위 3개' : 'AI 추천종목 전체 (국내·미국 60종목 + 테마)'}</li><li>보유종목 일괄 진단</li><li>${p.free ? '-' : '지지·저항·손절 구간 · 손익비'}</li></ul>${p.free ? `<span class="tag tag-no">${st && st.source === 'free' ? '현재 이용 중' : '기본 제공'}</span>` : ''}</div>`).join('')}</div>
          ${S.st.aiCardFree ? '<p class="muted" style="font-size:13px">MAX DAY LIFE 카드 회원은 베이직 혜택이 무료로 적용됩니다.</p>' : ''}
          <div class="grid g-main" style="margin-top:16px"><section class="panel"><div class="panel-h"><h3>구독 신청</h3></div><div class="panel-b">
            <div class="field"><label>결제 수단</label><div class="pay-grid" id="sbM">${PAY.map((m) => `<button class="pay-opt ${m.k === meth ? 'on' : ''}" data-m="${m.k}" ${S.st.payMethods && S.st.payMethods[m.k] === false ? 'disabled' : ''}><b>${m.n}</b><small>${m.d}</small></button>`).join('')}</div></div>
            <div class="field"><label>메모 (입금자명, 지갑 주소 등)</label><input class="input" id="sbMemo" maxlength="200"></div>
            <div class="order-sum" id="sbSum"></div>
            <button class="btn btn-brand btn-block btn-lg" id="sbGo">구독 신청</button><p class="dim" style="font-size:12px;margin-top:8px">결제 확인 후 관리자가 승인하면 바로 적용됩니다. 이용 중인 구독이 있으면 종료일 다음 날부터 이어집니다.</p></div></section>
          <section class="panel"><div class="panel-h"><h3>내 구독 내역</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>신청일</th><th>요금제</th><th>금액</th><th>상태</th><th>기간</th><th></th></tr></thead><tbody>${subs.map((x) => `<tr><td class="dim">${U.date(x.createdAt)}</td><td>${esc(x.planName)}</td><td>${x.method === 'grant' ? '지급' : won(x.price)}</td><td><span class="tag ${stt[x.status][1]}">${stt[x.status][0]}</span></td><td class="dim">${x.startsAt ? U.date(x.startsAt) + ' ~ ' + U.date(x.endsAt) : '-'}</td><td>${x.status === 'pending' ? `<button class="btn btn-sm" data-sc="${x.id}">취소</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">구독 내역이 없습니다</div></td></tr>'}</tbody></table></div></section></div>`;
        const sum = () => { const p = plans.find((x) => x.id === plan); $('#sbSum').innerHTML = p ? `<dl class="kv"><dt>요금제</dt><dd>${esc(p.name)} · ${p.days || 30}일</dd><dt>결제 수단</dt><dd>${PAYN(meth)}</dd><dt><b style="color:var(--text)">결제 금액</b></dt><dd style="font-size:16px" class="brand">${won(p.price)}</dd></dl>` : ''; $$('.ai-plan').forEach((x) => x.classList.toggle('on', x.dataset.plan === plan)); };
        $$('.ai-plan:not(.free)').forEach((x) => (x.onclick = () => { plan = x.dataset.plan; sum(); }));
        $$('#sbM [data-m]').forEach((b) => (b.onclick = () => { meth = b.dataset.m; $$('#sbM [data-m]').forEach((x) => x.classList.toggle('on', x === b)); sum(); }));
        $('#sbGo').onclick = async () => { try { await Store.requestSub(plan, meth, $('#sbMemo').value); U.toast('구독 신청이 접수되었습니다. 승인되면 알림으로 알려드립니다.'); Voice.say('AI 구독 신청이 접수되었습니다.'); draw(); } catch (e) { U.toast(e.message, true); } };
        $$('[data-sc]').forEach((b) => (b.onclick = async () => { try { await Store.cancelSub(b.dataset.sc); U.toast('취소되었습니다.'); draw(); } catch (e) { U.toast(e.message, true); } }));
        sum();
      }
    }
    async function one(code) {
      const box = $('#aiRep'); box.innerHTML = '<div class="empty">AI가 차트·수급·뉴스를 분석하는 중…</div>';
      try { const R = await AI.run(code); box.innerHTML = AI.report(R); stLine(); } catch (e) { box.innerHTML = AI.gate(e.message); }
    }
    draw();
    return { data: () => {} };
  }

  // ═════════ 고객센터 (1:1 문의 · 쪽지) ═════════
  function Help(main) {
    const CAT = { cash: '입출금', buff: 'MAX 버프', order: '주문·체결', account: '계정·등급', lead: 'MAX 리딩', etc: '기타', notice: '운영 쪽지' };
    main.innerHTML = `${head('고객센터', '궁금한 점을 1:1로 문의하면 관리자가 답변합니다. 운영 쪽지도 여기에서 확인합니다.')}
      <div class="grid g-main" style="margin-bottom:16px"><section class="panel"><div class="panel-h"><h3>1:1 문의하기</h3></div><div class="panel-b">
        <div class="field"><label>분류</label><select class="input" id="hqC">${Object.entries(CAT).filter(([k]) => k !== 'notice').map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
        <div class="field"><label>제목</label><input class="input" id="hqT" maxlength="100" placeholder="예: USDT 충전 신청이 아직 승인되지 않았어요"></div>
        <div class="field"><label>내용</label><textarea class="input" id="hqB" rows="6" maxlength="3000" placeholder="신청 시각, 금액, 종목 등 자세히 적어주시면 빠르게 확인합니다."></textarea></div>
        <button class="btn btn-brand btn-block btn-lg" id="hqGo">문의 등록</button></div></section>
      <section class="panel"><div class="panel-h"><h3>자주 묻는 질문</h3></div><div class="panel-b faq" id="hFaq">${[['충전은 어떻게 하나요?', '입출금 메뉴에서 계좌이체·카드·MOA 토큰·USDT·USDC·USD1·MAX 포인트 중 수단을 고르고 신청하면 관리자 승인 후 예수금에 반영됩니다.'], ['MAX 버프는 무엇인가요?', '순자산의 1~3배를 지원받아 더 크게 투자하는 신용 기능입니다. 담보비율이 등급별 청산 기준 아래로 내려가면 보유 종목이 자동 매도되어 상환됩니다.'], ['감시주문은 어떻게 쓰나요?', '종목 주문 화면에서 「감시주문」을 고르고 가격과 조건(이하·이상)을 정하면, 현재가가 그 가격에 닿을 때 시장가로 자동 매수·매도됩니다. 손절·익절·돌파 매수에 씁니다.'], ['등급은 어떻게 올라가나요?', '거래 실적과 운영 정책에 따라 관리자가 조정합니다. 등급이 높을수록 버프 한도가 크고 이자율이 낮습니다.'], ['시세는 실시간인가요?', '국내·미국 전 종목 시세가 장중 5분 간격으로 갱신됩니다.']].map(([q, a]) => `<details><summary>${q}</summary><p class="muted">${a}</p></details>`).join('')}</div></section></div>
      <section class="panel"><div class="panel-h"><h3>내 문의 · 쪽지</h3></div><div class="panel-b flush" id="hqL"></div></section>`;
    $('#hqGo').onclick = async () => { const t = $('#hqT').value.trim(); if (!t) return U.toast('제목을 입력해 주세요.', true); try { await Store.createInquiry($('#hqC').value, t, $('#hqB').value); $('#hqT').value = ''; $('#hqB').value = ''; U.toast('문의가 등록되었습니다. 답변이 달리면 알림으로 알려드립니다.'); } catch (e) { U.toast(e.message, true); } };
    function data() {
      const L = S.d.inquiries || [];
      $('#hqL').innerHTML = L.length ? L.map((q) => `<div class="inq ${q.fromAdmin ? 'msg' : ''}"><div class="inq-h"><span class="tag ${q.fromAdmin ? 'tag-brand' : 'tag-no'}">${CAT[q.category] || '기타'}</span><b>${esc(q.title)}</b><span class="tag ${q.status === 'open' ? 'tag-wait' : 'tag-ok'}">${q.fromAdmin ? '쪽지' : q.status === 'open' ? '답변 대기' : q.status === 'answered' ? '답변 완료' : '종료'}</span><small class="dim">${U.dt(q.createdAt)}</small></div>${q.body ? `<p class="muted" style="white-space:pre-wrap;margin:8px 0 0">${esc(q.body)}</p>` : ''}${q.answer ? `<div class="inq-a"><b>${q.fromAdmin ? '운영팀' : '답변'}</b> <small class="dim">${q.answeredAt ? U.dt(q.answeredAt) : ''}</small><p style="white-space:pre-wrap;margin:6px 0 0">${esc(q.answer)}</p></div>` : ''}</div>`).join('') : '<div class="empty">문의 내역이 없습니다</div>';
      if (L.some((q) => !q.readByUser)) Store.readInquiries().catch(() => {});
    }
    data(); window.MLSX && MLSX.faq($('#hFaq'));
    return { data };
  }

  // ═════════ 마이페이지 ═════════
  function My(main) {
    let tab = (location.hash.split('/')[2]) || 'home', per = 'month';
    const TABS = [['home', '내 정보'], ['asset', '자산 현황'], ['settle', '정산 내역'], ['trade', '매수·매도 내역'], ['cash', '입출금 내역'], ['buff', 'MAX 버프'], ['alert', '알림'], ['money', '자산 변동 로그'], ['set', '설정']];
    main.innerHTML = `${head('마이페이지', '내 계좌·정산·입출금·매매 내역과 계정 설정을 한 곳에서 관리합니다.')}
      <div class="my-head panel panel-b" id="myHead"></div>
      <div class="tabs my-tabs" id="myT">${TABS.map(([k, n]) => `<button data-v="${k}">${n}</button>`).join('')}</div>
      <div id="myB" style="margin-top:16px"></div>`;
    $('#myT').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.v; history.replaceState(null, '', '#/my/' + tab); draw(); };
    const stt = { pending: ['대기', 'tag-wait'], approved: ['완료', 'tag-ok'], rejected: ['반려', 'tag-sell'], cancelled: ['취소', 'tag-no'] };
    const dkey = (t, p) => { const d = new Date(t); return p === 'day' ? U.date(t) : p === 'month' ? d.getFullYear() + '.' + U.two(d.getMonth() + 1) : d.getFullYear() + '년'; };
    function head2() {
      const u = S.user, v = S.v, g = GRADE(u.grade);
      $('#myHead').innerHTML = `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><span class="avatar" style="width:56px;height:56px;font-size:22px">${esc(u.name.slice(0, 1))}</span>
        <div style="flex:1;min-width:180px"><b style="font-size:19px">${esc(u.name)}</b> <span class="tag tag-brand">${esc(g.name)} 등급</span>${u.cardTier ? ` <span class="tag card-${u.cardTier}">MAX DAY LIFE ${CARD[u.cardTier] || ''} 카드</span>` : ''}<div class="dim" style="font-size:12px;margin-top:4px">${esc(u.username)} · 가입 ${U.date(u.createdAt)}${u.role !== 'user' ? ' · ' + ({ instructor: 'MAX 리딩', admin: '관리자' })[u.role] : ''}</div></div>
        <div class="my-kpi"><div><small>순자산</small><b>${won(v.net)}</b></div><div><small>누적 수익</small><b class="${cls(v.netPnl)}">${signedWon(v.netPnl)} (${pct(v.netPct)})</b></div><div><small>예수금</small><b>${won(v.cash)}</b></div>${v.loan ? `<div><small>담보비율</small><b style="color:${v.ratio < (v.maintain || 120) ? 'var(--up)' : v.ratio < (S.st.buffWarn || 140) ? 'var(--warn)' : 'var(--ok)'}">${v.ratio.toFixed(1)}%</b></div>` : ''}</div></div>`;
    }
    function draw() {
      head2(); $$('#myT button').forEach((x) => x.classList.toggle('on', x.dataset.v === tab));
      const el = $('#myB'), u = S.user, v = S.v, g = GRADE(u.grade);
      if (tab === 'money') { window.MLSX ? MLSX.moneyLog(el) : (el.innerHTML = ''); return; }
      if (tab === 'home') {
        el.innerHTML = `<div class="grid g-2 stack">
          <section class="panel"><div class="panel-h"><h3>내 정보</h3></div><div class="panel-b"><form id="pfF"><div class="field"><label>닉네임 <span class="dim">랭킹·리딩 댓글에 표시</span></label><input class="input" name="name" value="${esc(u.name)}" maxlength="20"></div><div class="field"><label>휴대폰</label><input class="input" name="phone" value="${esc(u.phone || '')}"></div><div class="field"><label>이메일</label><input class="input" name="email" value="${esc(u.email || '')}"></div><button class="btn btn-brand">저장</button></form></div></section>
          <section class="panel"><div class="panel-h"><h3>등급 · 카드 혜택</h3></div><div class="panel-b"><dl class="kv"><dt>이용자 등급</dt><dd><b>${esc(g.name)}</b></dd><dt>MAX 버프 최대</dt><dd>순자산 ${g.maxMult}배</dd><dt>버프 이자 (연)</dt><dd>${g.rate}%</dd><dt>청산 기준 담보비율</dt><dd>${g.maintain}%</dd><dt>MAX DAY LIFE 카드</dt><dd>${u.cardTier ? CARD[u.cardTier] + ' 카드 연동' : '미연동'}</dd></dl>
            <div class="divider"></div><p class="muted" style="font-size:13px;line-height:1.7">MAX DAY LIFE 카드 회원은 MAX 리딩 무료, 충전 수수료 할인, MAX 포인트 적립 혜택이 있습니다. 등급은 거래 실적과 운영 정책에 따라 관리자가 조정합니다.</p>
            <a class="btn" href="https://whaleguard.github.io/maxdaylife/#cards" target="_blank" rel="noopener" style="margin-top:8px">MAX DAY LIFE 카드 안내 ↗</a></div></section></div>`;
        $('#pfF').onsubmit = async (e) => { e.preventDefault(); try { await Store.updateProfile(Object.fromEntries(new FormData(e.target))); U.toast('저장되었습니다.'); } catch (er) { U.toast(er.message, true); } };
      } else if (tab === 'asset') {
        el.innerHTML = `<div class="grid g-4" style="margin-bottom:16px">${[['총 평가자산', won(v.total)], ['순자산 (버프 차감)', won(v.net)], ['주식 평가금액', won(v.evalKrw)], ['예수금', won(v.cash)], ['투자원금', won(v.principal)], ['누적 수익', `<span class="${cls(v.netPnl)}">${signedWon(v.netPnl)}</span>`], ['평가손익', `<span class="${cls(v.pnl)}">${signedWon(v.pnl)}</span>`], ['실현손익 (누적)', `<span class="${cls(v.realized)}">${signedWon(v.realized)}</span>`]].map(([k, x]) => `<div class="panel panel-b stat"><div class="k">${k}</div><div class="v" style="font-size:20px">${x}</div></div>`).join('')}</div>
          ${v.loan ? `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>MAX 버프 담보 현황</h3><a class="btn btn-sm" href="#/buff">관리</a></div><div class="panel-b"><dl class="kv" style="margin-bottom:12px"><dt>지원금</dt><dd>${won(v.loan)}</dd><dt>이자</dt><dd>${won(v.interest)}</dd><dt>청산 기준</dt><dd>${v.maintain}%</dd></dl>${gauge(v)}</div></section>` : ''}
          <section class="panel"><div class="panel-h"><h3>보유 종목</h3><a class="btn btn-sm" href="#/balance">잔고 화면</a></div><div class="table-wrap"><table class="t"><thead><tr><th class="l">종목</th><th>수량</th><th>평균단가</th><th>현재가</th><th>평가금액</th><th>평가손익</th><th>수익률</th></tr></thead><tbody>${v.holdings.map((h) => `<tr class="click" data-go="${h.code}"><td class="l"><b>${esc(h.name)}</b><div class="dim" style="font-size:11px">${h.code}</div></td><td>${n0(h.qty)}</td><td>${px(h.avg, h.currency)}</td><td>${px(h.price, h.currency)}</td><td>${won(h.evalKrw)}</td><td class="${cls(h.pnl)}">${signedWon(h.pnl)}</td><td class="${cls(h.pnl)}">${pct(h.pnlPct)}</td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">보유 종목이 없습니다</div></td></tr>'}</tbody></table></div></section>`;
        bindGo(el);
      } else if (tab === 'settle') {
        const F = S.d.fills || [];
        const G = {}; for (const f of F) { const k = dkey(f.at, per); const r = (G[k] = G[k] || { buy: 0, sell: 0, fee: 0, tax: 0, pnl: 0, n: 0 }); r[f.side] += f.amount; r.fee += f.fee; r.tax += f.tax; r.pnl += f.pnl || 0; r.n++; }
        const keys = Object.keys(G).sort().reverse(); const T = keys.reduce((t, k) => { for (const x in G[k]) t[x] = (t[x] || 0) + G[k][x]; return t; }, {});
        const cf = (S.d.cashflows || []).filter((c) => c.status === 'approved');
        el.innerHTML = `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>매매 정산</h3><div class="seg" id="myPer"><button data-v="day">일별</button><button data-v="month">월별</button><button data-v="year">연도별</button></div></div>
          <div class="grid g-4 panel-b" style="padding-bottom:0">${[['총 매수금액', won(T.buy || 0)], ['총 매도금액', won(T.sell || 0)], ['수수료 + 세금', won((T.fee || 0) + (T.tax || 0))], ['실현손익 합계', `<span class="${cls(T.pnl || 0)}">${signedWon(T.pnl || 0)}</span>`]].map(([k, x]) => `<div class="stat"><div class="k">${k}</div><div class="v" style="font-size:18px">${x}</div></div>`).join('')}</div>
          <div class="table-wrap"><table class="t"><thead><tr><th>기간</th><th>체결</th><th>매수금액</th><th>매도금액</th><th>수수료</th><th>세금</th><th>실현손익</th></tr></thead><tbody>${keys.map((k) => { const r = G[k]; return `<tr><td>${k}</td><td>${r.n}건</td><td>${won(r.buy)}</td><td>${won(r.sell)}</td><td>${won(r.fee)}</td><td>${won(r.tax)}</td><td class="${cls(r.pnl)}"><b>${signedWon(r.pnl)}</b></td></tr>`; }).join('') || '<tr><td colspan="7"><div class="empty">정산할 체결 내역이 없습니다</div></td></tr>'}</tbody></table></div></section>
          <section class="panel"><div class="panel-h"><h3>계좌 정산 요약</h3></div><div class="panel-b"><dl class="kv"><dt>최초 지급액</dt><dd>${won(u.initial)}</dd><dt>승인된 입금</dt><dd class="up">+${won(cf.filter((c) => c.type === 'deposit').reduce((t, c) => t + c.amount, 0))}</dd><dt>승인된 출금</dt><dd class="down">−${won(cf.filter((c) => c.type === 'withdraw').reduce((t, c) => t + c.amount, 0))}</dd><dt>투자원금</dt><dd>${won(v.principal)}</dd><dt>버프 지원금 (현재)</dt><dd>${won(v.loan)}</dd><dt>버프 이자 누적 (현재)</dt><dd>${won(v.interest)}</dd><dt>종료된 버프 이자</dt><dd>${won((S.d.buffs || []).filter((b) => b.status !== 'active').reduce((t, b) => t + (b.interest || 0), 0))}</dd><dt><b>순자산</b></dt><dd><b>${won(v.net)}</b></dd><dt><b>누적 수익</b></dt><dd class="${cls(v.netPnl)}"><b>${signedWon(v.netPnl)} (${pct(v.netPct)})</b></dd></dl></div></section>`;
        $$('#myPer button').forEach((x) => x.classList.toggle('on', x.dataset.v === per));
        $('#myPer').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; per = b.dataset.v; draw(); };
      } else if (tab === 'trade') {
        const F = (S.d.fills || []).slice().sort((a, b) => b.at.localeCompare(a.at));
        el.innerHTML = `<section class="panel"><div class="panel-h"><h3>매수·매도 체결 내역 (${F.length}건)</h3><a class="btn btn-sm" href="#/history">주문 내역</a></div><div class="table-wrap"><table class="t"><thead><tr><th>체결일시</th><th class="l">종목</th><th>구분</th><th>체결가</th><th>수량</th><th>체결금액</th><th class="hide-m">수수료</th><th class="hide-m">세금</th><th>실현손익</th></tr></thead><tbody>${F.slice(0, 500).map((f) => `<tr><td class="dim">${U.dt(f.at)}</td><td class="l"><b>${esc(f.name)}</b><div class="dim" style="font-size:11px">${f.code}</div></td><td><span class="tag ${f.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${f.side === 'buy' ? '매수' : '매도'}</span></td><td>${px(f.price, f.currency)}</td><td>${n0(f.qty)}</td><td>${won(f.amount)}</td><td class="hide-m">${won(f.fee)}</td><td class="hide-m">${won(f.tax)}</td><td class="${cls(f.pnl)}">${f.side === 'sell' ? signedWon(f.pnl) : '-'}</td></tr>`).join('') || '<tr><td colspan="9"><div class="empty">체결 내역이 없습니다</div></td></tr>'}</tbody></table></div></section>`;
      } else if (tab === 'cash') {
        const C = (S.d.cashflows || []).slice().sort((a, b) => b.at.localeCompare(a.at));
        const sum = (t) => C.filter((c) => c.type === t && c.status === 'approved').reduce((x, c) => x + c.amount, 0);
        el.innerHTML = `<div class="grid g-3" style="margin-bottom:16px">${[['승인된 입금 합계', won(sum('deposit'))], ['승인된 출금 합계', won(sum('withdraw'))], ['대기 중', C.filter((c) => c.status === 'pending').length + '건']].map(([k, x]) => `<div class="panel panel-b stat"><div class="k">${k}</div><div class="v" style="font-size:20px">${x}</div></div>`).join('')}</div>
          <section class="panel"><div class="panel-h"><h3>입출금 내역</h3><a class="btn btn-sm btn-brand" href="#/cash">입출금 신청</a></div><div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th>구분</th><th>수단</th><th>금액</th><th>상태</th><th class="hide-m">처리일시</th><th class="l hide-m">메모</th></tr></thead><tbody>${C.map((c) => `<tr><td class="dim">${U.dt(c.at)}</td><td><span class="tag ${c.type === 'deposit' ? 'tag-buy' : 'tag-sell'}">${c.type === 'deposit' ? '입금' : '출금'}</span></td><td>${PAYN(c.method)}</td><td><b>${won(c.amount)}</b></td><td><span class="tag ${stt[c.status][1]}">${stt[c.status][0]}</span></td><td class="hide-m dim">${c.processedAt ? U.dt(c.processedAt) : '-'}</td><td class="l hide-m muted">${esc(c.memo || '')}${c.adminMemo ? ' · ' + esc(c.adminMemo) : ''}</td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">입출금 내역이 없습니다</div></td></tr>'}</tbody></table></div></section>`;
      } else if (tab === 'buff') {
        const B = S.d.buffs || [];
        el.innerHTML = `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>MAX 버프</h3><a class="btn btn-sm btn-brand" href="#/buff">${v.loan ? '버프 관리 · 상환' : '버프 신청'}</a></div><div class="panel-b">${v.loan ? `<dl class="kv" style="margin-bottom:12px"><dt>사용 중</dt><dd>${v.buff.mult}배 · ${won(v.loan)}</dd><dt>이자 (연 ${v.buff.rate}%)</dt><dd>${won(v.interest)}</dd><dt>승인일</dt><dd>${U.dt(v.buff.approvedAt)}</dd></dl>${gauge(v)}` : `<p class="muted">사용 중인 버프가 없습니다. ${g.name} 등급은 순자산의 최대 ${g.maxMult}배까지 신청할 수 있습니다.</p>`}</div></section>
          <section class="panel"><div class="panel-h"><h3>신청·사용 내역</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>신청일시</th><th>배수</th><th>지원금</th><th>상태</th><th>이자</th><th class="hide-m">종료</th></tr></thead><tbody>${B.map((b) => `<tr><td class="dim">${U.dt(b.createdAt)}</td><td>${b.mult}배</td><td>${won(b.amount)}</td><td>${({ pending: '심사 중', active: '사용 중', rejected: '반려', cancelled: '취소', repaid: '상환 완료', liquidated: '자동 청산' })[b.status]}</td><td>${won(b.status === 'active' ? b.interestNow || 0 : b.interest || 0)}</td><td class="hide-m dim">${b.closedAt ? U.dt(b.closedAt) : '-'}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">내역이 없습니다</div></td></tr>'}</tbody></table></div></section>`;
      } else if (tab === 'alert') {
        const L = Alerts.list();
        el.innerHTML = `<section class="panel"><div class="panel-h"><h3>가격 알림 (${L.length})</h3></div><div class="panel-b"><p class="dim" style="font-size:12px;margin-bottom:10px">종목 화면의 「가격알림」 탭에서 등록합니다. 조건에 닿으면 화면 알림과 휴대폰·PC 알림이 옵니다.</p>
          <div class="table-wrap"><table class="t"><thead><tr><th class="l">종목</th><th>조건</th><th>현재가</th><th>상태</th><th></th></tr></thead><tbody>${L.map((a) => { const q = Market.quote(a.code); return `<tr><td class="l"><a href="#/stock/${a.code}"><b>${esc(q ? q.name : a.code)}</b></a></td><td>${q ? px(a.price, q.currency) : a.price} ${a.cond === 'ge' ? '이상' : '이하'}</td><td>${q ? px(q.price, q.currency) : '-'}</td><td>${a.hit ? '<span class="tag tag-ok">도달 ' + U.dt(a.hit) + '</span>' : '<span class="tag tag-wait">대기</span>'}</td><td><button class="btn btn-sm" data-aldel="${a.id}">삭제</button></td></tr>`; }).join('') || '<tr><td colspan="5"><div class="empty">등록된 알림이 없습니다</div></td></tr>'}</tbody></table></div>
          <div class="divider"></div><div class="setting-row"><div><b>휴대폰·PC 알림 권한</b><small>${window.Notification ? (Notification.permission === 'granted' ? '허용됨' : Notification.permission === 'denied' ? '차단됨 · 브라우저 설정에서 허용해 주세요' : '아직 허용하지 않음') : '이 브라우저는 알림을 지원하지 않습니다'}</small></div>${window.Notification && Notification.permission === 'default' ? '<button class="btn btn-sm" id="nPerm">알림 허용</button>' : '<span></span>'}</div></div></section>`;
        $$('[data-aldel]', el).forEach((b) => (b.onclick = () => { Alerts.remove(b.dataset.aldel); draw(); }));
        const np = $('#nPerm'); if (np) np.onclick = () => Notification.requestPermission().then(draw);
      } else {
        el.innerHTML = `<div class="grid g-2 stack">
          <section class="panel"><div class="panel-h"><h3>화면 테마</h3></div><div class="panel-b"><div class="theme-pick"><button data-th="dark" class="${theme.get() === 'dark' ? 'on' : ''}"><span class="tp tp-dark"></span><b>다크</b></button><button data-th="light" class="${theme.get() === 'light' ? 'on' : ''}"><span class="tp tp-light"></span><b>화이트</b></button></div><div class="setting-row" style="margin-top:12px"><div><b>시세 상태</b><small>${statusLine()}</small></div><span></span></div><div class="setting-row"><div><b>음성 안내</b><small>주문 접수·체결·취소, 입출금 처리, 버프, 문의 답변을 음성으로 알려줍니다</small></div><label class="sw"><input type="checkbox" id="myVoice" ${Voice.on() ? 'checked' : ''}><span></span></label></div><div class="setting-row"><div><b>알림 소리</b><small>체결·입출금 처리·버프·문의 답변 시 알림음</small></div><label class="sw"><input type="checkbox" id="mySnd" ${(() => { try { return localStorage.getItem('mls.snd') !== '0'; } catch { return true; } })() ? 'checked' : ''}><span></span></label></div></div></section>
          <section class="panel"><div class="panel-h"><h3>비밀번호 변경</h3></div><div class="panel-b"><form id="pwF"><div class="field"><label>현재 비밀번호</label><input class="input" type="password" name="o" autocomplete="current-password"></div><div class="field"><label>새 비밀번호 (6자 이상)</label><input class="input" type="password" name="n" autocomplete="new-password"></div><div class="field"><label>새 비밀번호 확인</label><input class="input" type="password" name="n2" autocomplete="new-password"></div><button class="btn btn-brand">변경</button></form></div></section>
          <section class="panel"><div class="panel-h"><h3>거래 조건</h3></div><div class="panel-b"><dl class="kv"><dt>국내 수수료</dt><dd>${S.st.feeKr}%</dd><dt>국내 매도 세금</dt><dd>${S.st.taxKr}%</dd><dt>미국 수수료</dt><dd>${S.st.feeUs}%</dd><dt>적용 환율</dt><dd>${U.n2(Market.fx())}원</dd><dt>장외시간 체결</dt><dd>${S.st.enforceHours ? '불가 (실제 장시간만)' : '허용'}</dd></dl></div></section>
          <section class="panel"><div class="panel-h"><h3>계좌</h3></div><div class="panel-b"><p class="muted" style="font-size:13px;margin-bottom:10px">계좌를 초기화하면 보유종목·주문·거래내역이 모두 삭제되고 예수금이 ${won(S.st.initialCash)}으로 다시 지급됩니다.${v.loan ? ' (버프 사용 중에는 먼저 상환해 주세요)' : ''}</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-danger" id="rstBtn" ${v.loan ? 'disabled' : ''}>계좌 초기화</button><button class="btn" id="outBtn">로그아웃</button>${u.role !== 'user' ? '<a class="btn" href="admin.html">관리자 페이지</a>' : ''}</div></div></section>
          ${u.role !== 'admin' ? `<section class="panel"><div class="panel-h"><h3>회원 탈퇴</h3></div><div class="panel-b"><p class="muted" style="font-size:13px;margin-bottom:10px">탈퇴하면 계좌·보유종목·주문·거래·입출금·문의·AI 구독 기록이 모두 삭제되고 되돌릴 수 없습니다.${v.loan ? ' MAX 버프를 먼저 상환해 주세요.' : ''}</p><button class="btn btn-danger" id="wdBtn" ${v.loan ? 'disabled' : ''}>회원 탈퇴</button></div></section>` : ''}</div>`;
        { const mv = $('#myVoice', el); if (mv) mv.onchange = () => { Voice.set(mv.checked); if (mv.checked) Voice.say('음성 안내를 켰습니다.'); }; }
        { const ms = $('#mySnd', el); if (ms) ms.onchange = () => { try { localStorage.setItem('mls.snd', ms.checked ? '1' : '0'); } catch {} if (ms.checked) chime(); }; }
        $$('[data-th]', el).forEach((b) => (b.onclick = () => { theme.set(b.dataset.th); const tb = $('#themeBtn'); if (tb) tb.innerHTML = theme.get() === 'dark' ? ICON.sun : ICON.moon; draw(); }));
        $('#pwF').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (f.n !== f.n2) return U.toast('새 비밀번호가 일치하지 않습니다.', true); try { await Store.changePassword(f.o, f.n); e.target.reset(); U.toast('비밀번호가 변경되었습니다.'); } catch (er) { U.toast(er.message, true); } };
        { const wd = $('#wdBtn', el); if (wd) wd.onclick = () => U.modal({ title: '회원 탈퇴', body: '<p class="muted" style="margin-top:0">모든 기록이 삭제되고 되돌릴 수 없습니다. 본인 확인을 위해 비밀번호를 입력하세요.</p><div class="field"><label>비밀번호</label><input class="input" type="password" id="wdPw" autocomplete="current-password"></div><div class="field"><label>탈퇴 사유 (선택)</label><input class="input" id="wdWhy" maxlength="100"></div>', foot: '<button class="btn" data-x>취소</button><button class="btn btn-danger" id="wdOk">탈퇴</button>', onMount: (m, close) => { $('#wdOk', m).onclick = async () => { try { await Store.deleteMe($('#wdPw', m).value, $('#wdWhy', m).value); close(); try { await Store.logout(); } catch {} U.toast('탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.'); setTimeout(() => location.reload(), 1200); } catch (e) { U.toast(e.message, true); } }; } }); }
        $('#rstBtn').onclick = async () => { if (await U.confirmBox('계좌 초기화', '<p>정말 초기화할까요? 되돌릴 수 없습니다.</p>', '초기화', 'btn-danger')) { await Store.resetAccount(); U.toast('계좌가 초기화되었습니다.'); } };
        $('#outBtn').onclick = async () => { await Store.logout(); location.hash = ''; location.reload(); };
      }
    }
    draw();
    let t = 0;
    return { data: draw, tick: () => { if ((tab === 'asset' || tab === 'buff') && Date.now() - t > 5000) { t = Date.now(); draw(); } else head2(); } };
  }
  // 모바일 전체 메뉴
  function Menu(main) {
    main.innerHTML = `${head('전체 메뉴')}<section class="panel"><nav class="nav" style="padding:8px">${NAV.map(([r, l, i]) => `<a href="#/${r}">${i}<span>${l}</span></a>`).join('')}${S.user.role !== 'user' ? `<a href="admin.html">${ICON.shield}<span>관리자</span></a>` : ''}</nav></section>
      <section class="panel panel-b" style="margin-top:12px;font-size:12px" class="muted">${statusLine()}</section>`;
    return {};
  }

  boot().catch((e) => { console.error(e); root.innerHTML = `<div class="empty" style="padding:80px 20px">앱을 시작하지 못했습니다: ${esc(e.message)}<br><button class="btn" style="margin-top:16px" onclick="location.reload()">다시 시도</button></div>`; });
})();
