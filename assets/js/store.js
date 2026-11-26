// 데이터 저장소 — LocalStore(데모 모드) / ApiStore(운영 모드: server/api.php)
const Store = (() => {
  // 기기 식별값(차단·접속 기록용) · 추천 코드(?ref=)
  const deviceId = () => { try { let d = localStorage.getItem('mls.dev'); if (!d) { d = 'd' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('mls.dev', d); } return d; } catch { return ''; } };
  const refCode = () => { try { const m = (location.search + location.hash).match(/[?&]ref=([A-Za-z0-9]+)/); if (m) localStorage.setItem('mls.ref', m[1].toUpperCase()); return localStorage.getItem('mls.ref') || ''; } catch { return ''; } };
  const C = window.MLS_CONFIG;
  const KEY = 'mls.db.v2', SKEY = 'mls.session.v1';

  // ─────────────── LocalStore ───────────────
  const Local = (() => {
    let db = null;
    const ev = U.emitter();
    const load = () => { try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; } };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { U.toast('브라우저 저장공간이 부족합니다.', true); } };
    const sess = () => { try { return JSON.parse(localStorage.getItem(SKEY)); } catch { return null; } };
    window.addEventListener('storage', (e) => { if (e.key === KEY) { load(); ev.emit('change'); } });

    const pubUser = (u) => { if (!u) return null; const { pw, ...r } = u; return r; };
    const userById = (id) => db.users.find((u) => u.id === id);

    function bundle(uid) {
      const user = userById(uid);
      db.positions[uid] = db.positions[uid] || {};
      return {
        user, positions: db.positions[uid],
        orders: db.orders.filter((o) => o.userId === uid),
        fills: db.fills.filter((f) => f.userId === uid),
        cashflows: db.cashflows.filter((c) => c.userId === uid),
        snapshots: db.snapshots[uid] || [],
      };
    }
    function commit(d) {
      const oIds = new Set(db.orders.map((o) => o.id)); for (const o of d.orders) if (!oIds.has(o.id)) db.orders.push(o);
      const fIds = new Set(db.fills.map((f) => f.id)); for (const f of d.fills) if (!fIds.has(f.id)) db.fills.push(f);
      db.positions[d.user.id] = d.positions;
      save(); ev.emit('change');
    }
    const view = (d) => ({ ...d, user: pubUser(d.user) });
    const me = () => { const s = sess(); return s && userById(s.uid); };
    const needUser = () => { const u = me(); if (!u) throw new Error('로그인이 필요합니다.'); return u; };
    const needAdmin = () => { const u = needUser(); if (u.role !== 'admin') throw new Error('관리자 권한이 필요합니다.'); return u; };
    const needStaff = () => { const u = needUser(); if (u.role !== 'admin' && u.role !== 'instructor') throw new Error('MAX 리딩/관리자 권한이 필요합니다.'); return u; };

    async function seed() {
      const now = Date.now();
      const st = { ...Engine.DEF };
      const mk = async (username, pw, name, role, extra = {}) => ({ id: U.uid('u'), username, pw: await U.sha256(username + ':' + pw), name, role, status: 'active', phone: '', email: '', createdAt: new Date(now - (extra.days || 30) * 86400000).toISOString(), lastLogin: null, cash: st.initialCash, initial: st.initialCash, watch: ['005930', '000660', 'NVDA', 'AAPL', '035420'], demo: true, ...extra });
      db = { v: 1, users: [], positions: {}, orders: [], fills: [], cashflows: [], posts: [], notices: [], snapshots: {}, logins: [], settings: { ...st, overrides: { hidden: [], base: {} } }, audit: [] };
      db.users.push(await mk('admin', 'admin1234', '관리자', 'admin', { days: 60, initial: 0, cash: 0, watch: [] }));
      const teacher = await mk('teacher', 'teacher1234', 'MAX 리딩', 'instructor', { days: 60 });
      db.users.push(teacher);
      const names = [['demo', '김민수'], ['kim01', '김민준'], ['lee02', '이서연'], ['park03', '박도윤'], ['choi04', '최지우'], ['jung05', '정하준'], ['kang06', '강수아'], ['yoon07', '윤시우']];
      const codes = Market.list().slice(0, 60).map((q) => q.code);
      let k = 0;
      for (const [un, nm] of names) {
        const u = await mk(un, un === 'demo' ? 'demo1234' : 'pass1234', nm, 'user', { days: 10 + k * 5 });
        db.users.push(u);
        const r = U.rng(un);
        const d = { user: u, positions: {}, orders: [], fills: [], cashflows: [] };
        // 입금 이력
        if (r() > 0.4) { const amt = Math.round(r() * 5 + 1) * 1000000; db.cashflows.push({ id: U.uid('c'), userId: u.id, type: 'deposit', amount: amt, status: 'approved', memo: '추가 가상 예수금', at: new Date(now - 8 * 86400000).toISOString(), processedAt: new Date(now - 8 * 86400000 + 3600000).toISOString(), processedBy: 'admin' }); u.cash += amt; d.cashflows.push(db.cashflows[db.cashflows.length - 1]); }
        // 과거 매매
        const n = 3 + Math.floor(r() * 5);
        for (let i = 0; i < n; i++) {
          const code = codes[Math.floor(r() * codes.length)]; const q = Market.quote(code); if (!q) continue;
          const back = 1 + (r() - 0.55) * 0.14;
          const p = q.currency === 'USD' ? +(q.price * back).toFixed(2) : U.roundTick(q.price * back, 'KRW');
          const budget = u.cash * (0.08 + r() * 0.15);
          const qty = Math.max(1, Math.floor(budget / Market.toKrw(p, q.currency)));
          const at = new Date(now - (n - i) * 86400000 * (1 + r() * 2)).toISOString();
          const o = { id: U.uid('o'), userId: u.id, code, name: q.name, side: 'buy', type: 'limit', price: p, qty, filled: 0, status: 'pending', createdAt: at, currency: q.currency };
          d.orders.push(o); Engine.execute(d, st, o, p, at);
          if (r() > 0.65) { // 일부 매도
            const sq = Math.max(1, Math.floor(qty / 2)); const sp = q.currency === 'USD' ? +(p * (1 + (r() - 0.4) * 0.1)).toFixed(2) : U.roundTick(p * (1 + (r() - 0.4) * 0.1), 'KRW');
            const so = { id: U.uid('o'), userId: u.id, code, name: q.name, side: 'sell', type: 'limit', price: sp, qty: sq, filled: 0, status: 'pending', createdAt: new Date(new Date(at).getTime() + 86400000).toISOString(), currency: q.currency };
            d.orders.push(so); Engine.execute(d, st, so, sp, so.createdAt);
          }
        }
        db.orders.push(...d.orders); db.fills.push(...d.fills); db.positions[u.id] = d.positions;
        // 수익률 추이 (데모 계정 30일)
        const v = Engine.valuate(d, st); const snaps = []; let val = v.principal;
        for (let i = 29; i >= 1; i--) { val = val * (1 + (r() - 0.48) * 0.02); snaps.push([new Date(now - i * 86400000).toISOString().slice(0, 10), Math.round(val + (v.total - val) * ((30 - i) / 30))]); }
        snaps.push([U.today(), Math.round(v.total)]);
        db.snapshots[u.id] = snaps;
        for (let i = 0; i < 6; i++) if (r() > 0.4) db.logins.push({ userId: u.id, at: new Date(now - i * 86400000 - r() * 36000000).toISOString() });
        k++;
      }
      db.cashflows.push({ id: U.uid('c'), userId: db.users[3].id, type: 'deposit', amount: 5000000, status: 'pending', memo: '추가 연습자금 요청', at: new Date(now - 3600000).toISOString() });
      db.cashflows.push({ id: U.uid('c'), userId: db.users[4].id, type: 'withdraw', amount: 1000000, status: 'pending', memo: '', at: new Date(now - 7200000).toISOString() });
      // 리딩 · 공지
      const pq = (c) => Market.quote(c) || { price: 0, currency: 'KRW' };
      const p1 = pq('005930'), p2 = pq('NVDA'), p3 = pq('000660');
      const R = (q, m) => (q.currency === 'USD' ? +(q.price * m).toFixed(2) : U.roundTick(q.price * m, 'KRW'));
      db.posts.push(
        { id: U.uid('p'), authorId: teacher.id, authorName: teacher.name, kind: 'trade', title: '[실전 리딩] 20일선 눌림목 매수 — 이렇게 들어갑니다', code: '005930', side: 'buy', entry: R(p1, 0.99), target: R(p1, 1.08), stop: R(p1, 0.955), result: 'open', resultPct: 0,
          body: '진입 근거\n① 일봉 20일 이동평균선까지 거래량 줄면서 눌림 (매도세 약화)\n② 직전 저점 이탈 없음 → 상승 추세 유지\n③ 분봉에서 첫 양봉 장대 출현 시 1차 진입\n\n분할 매수: 1차 50% / 20일선 이탈 없이 재지지 시 2차 50%\n손절: 직전 저점 하향 이탈 (-4.5%) 기계적으로 실행\n목표: 전고점 부근 1차 익절 (+8%)\n\n※ 가상계좌 시연입니다. 직접 차트를 보면서 근거가 맞는지 확인하고 따라해 보세요.', video: '', at: new Date(now - 5400000).toISOString(), comments: [], likes: [] },
        { id: U.uid('p'), authorId: teacher.id, authorName: teacher.name, kind: 'trade', title: '[2강 미국주식] 실적 발표 전후 변동성 대응법', code: 'NVDA', side: 'buy', entry: R(p2, 0.985), target: R(p2, 1.12), stop: R(p2, 0.94), result: 'open', resultPct: 0,
          body: '실적 발표 전에는 비중을 30% 이하로 제한합니다.\n\n체크리스트\n- 발표일/시간 확인 (한국시간 새벽)\n- 옵션 내재변동성 → 예상 변동폭 파악\n- 발표 후 갭 방향 확인 뒤 추가 진입\n\n오늘 시연: 30% 선진입 → 발표 후 지지 확인 시 추가.', video: '', at: new Date(now - 86400000).toISOString(), comments: [], likes: [] },
        { id: U.uid('p'), authorId: teacher.id, authorName: teacher.name, kind: 'trade', title: '[복기] SK하이닉스 돌파 매매 — 목표가 도달', code: '000660', side: 'buy', entry: R(p3, 0.92), target: R(p3, 0.99), stop: R(p3, 0.89), result: 'target', resultPct: 7.6,
          body: '박스권 상단 돌파 + 거래량 2배 이상 동반 시 진입했던 시연입니다.\n목표가 도달로 전량 익절, +7.6%.\n\n복기 포인트: 돌파 당일 거래량이 핵심. 거래량 없는 돌파는 속임수(페이크)일 확률이 높습니다.', video: '', at: new Date(now - 3 * 86400000).toISOString(), comments: [], likes: [] },
        { id: U.uid('p'), authorId: teacher.id, authorName: teacher.name, kind: 'lesson', title: '[기초 해설] 호가창 읽는 법 — 매수·매도 잔량의 의미', code: '', side: '', entry: 0, target: 0, stop: 0, result: '', resultPct: 0,
          body: '호가창은 지금 이 순간 시장 참여자들이 어디에 주문을 걸어두었는지 보여줍니다.\n\n· 위쪽(파랑) = 매도 대기 물량, 아래쪽(빨강) = 매수 대기 물량\n· 시장가 매수는 가장 낮은 매도호가에 즉시 체결됩니다\n· 지정가 주문은 그 가격까지 와야 체결 — 미체결 상태로 대기\n\n종목 화면에서 호가를 클릭하면 주문 가격이 자동 입력됩니다. 직접 해보세요.', video: '', at: new Date(now - 5 * 86400000).toISOString(), comments: [], likes: [] },
      );
      const lee = db.users.find((u) => u.username === 'lee02'), kim = db.users.find((u) => u.username === 'kim01');
      db.posts[0].comments.push({ id: U.uid('m'), userId: lee.id, name: lee.name, text: '20일선 기준 잡는 법 이해됐습니다. 저도 1차 진입 했어요!', at: new Date(now - 3000000).toISOString() });
      db.posts[0].comments.push({ id: U.uid('m'), userId: teacher.id, name: teacher.name, text: '좋습니다. 손절 라인은 미리 지정가로 걸어두는 습관 들이세요.', at: new Date(now - 2400000).toISOString() });
      db.posts[2].comments.push({ id: U.uid('m'), userId: kim.id, name: kim.name, text: '거래량 확인하는 게 제일 중요하네요', at: new Date(now - 2 * 86400000).toISOString() });
      db.notices.push(
        { id: U.uid('n'), title: '오늘 밤 9시 라이브 리딩: 미국장 개장 대응 전략', body: '리딩룸에서 실시간으로 진행합니다. 가상계좌로 함께 따라해 보세요.', pinned: true, at: new Date(now - 1800000).toISOString() },
        { id: U.uid('n'), title: 'MAX라이프 주식 오픈 안내', body: '가입 시 가상 예수금 1,000만원이 지급됩니다. 실제 시세 기준으로 체결되며 실제 돈은 오가지 않습니다.', pinned: false, at: new Date(now - 7 * 86400000).toISOString() },
      );
      save();
    }

    async function init() {
      load();
      if (!db || db.v !== 1) await seed();
      return true;
    }

    const api = {
      mode: 'local',
      on: ev.on,
      init,
      async current() { const u = me(); return pubUser(u); },
      async login(username, pw) {
        const u = db.users.find((x) => x.username === username.trim());
        if (!u || u.pw !== (await U.sha256(u.username + ':' + pw))) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
        if (u.status === 'suspended') throw new Error('정지된 계정입니다. 관리자에게 문의하세요.');
        u.lastLogin = new Date().toISOString(); db.logins.push({ userId: u.id, at: u.lastLogin });
        localStorage.setItem(SKEY, JSON.stringify({ uid: u.id })); save();
        return pubUser(u);
      },
      async signup({ username, pw, name, phone }) {
        if (!db.settings.allowSignup) throw new Error('현재 신규 가입이 중단되었습니다.');
        username = (username || '').trim();
        if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) throw new Error('아이디는 영문/숫자 4~20자입니다.');
        if ((pw || '').length < 6) throw new Error('비밀번호는 6자 이상입니다.');
        if (!(name || '').trim()) throw new Error('닉네임을 입력해 주세요.');
        if (db.users.some((u) => u.username === username)) throw new Error('이미 사용 중인 아이디입니다.');
        const init = db.settings.initialCash;
        const u = { id: U.uid('u'), username, pw: await U.sha256(username + ':' + pw), name: name.trim(), phone: phone || '', email: '', role: 'user', status: 'active', createdAt: new Date().toISOString(), lastLogin: new Date().toISOString(), cash: init, initial: init, watch: ['005930', '000660', 'NVDA', 'AAPL'] };
        db.users.push(u); db.logins.push({ userId: u.id, at: u.lastLogin });
        localStorage.setItem(SKEY, JSON.stringify({ uid: u.id })); save();
        return pubUser(u);
      },
      async logout() { localStorage.removeItem(SKEY); },
      async me() { const u = needUser(); return view(bundle(u.id)); },
      async settings() { return { ...Engine.DEF, ...db.settings }; },
      async saveSettings(s) { needAdmin(); db.settings = { ...db.settings, ...s }; db.audit.push({ at: new Date().toISOString(), by: me().username, action: 'settings', detail: JSON.stringify(s) }); save(); ev.emit('change'); return db.settings; },
      async placeOrder(o) { const u = needUser(); const d = bundle(u.id); const r = Engine.place(d, db.settings, o); commit(d); if (r.error) throw new Error(r.error); return r; },
      async cancelOrder(id) { const u = needUser(); const d = bundle(u.id); const r = Engine.cancel(d, id); if (r.error) throw new Error(r.error); commit(d); return r; },
      async amendOrder(id, price, qty) { const u = needUser(); const d = bundle(u.id); const r = Engine.amend(d, db.settings, id, price, qty); if (r.error) throw new Error(r.error); commit(d); return r; },
      async matchAll() { // 데모 모드: 모든 회원의 미체결 주문 체결 검사
        const fills = [];
        const pend = db.orders.filter((o) => o.status === 'pending'); if (!pend.length) return fills;
        const uids = [...new Set(pend.map((o) => o.userId))];
        for (const uid of uids) { const d = bundle(uid); for (const o of d.orders) { const f = Engine.tryFill(d, db.settings, o); if (f) fills.push(f); } if (fills.length) commit(d); }
        return fills;
      },
      async requestCash(type, amount, memo, method) {
        const u = needUser(); amount = Math.floor(+amount);
        if (!(amount >= 10000)) throw new Error('최소 10,000원 이상 신청 가능합니다.');
        if (type === 'deposit' && amount > db.settings.maxDeposit) throw new Error(`1회 최대 ${U.won(db.settings.maxDeposit)}까지 신청 가능합니다.`);
        if (type === 'withdraw') { const v = Engine.valuate(bundle(u.id), db.settings); if (amount > v.withdrawable) throw new Error(`출금가능금액(${U.won(v.withdrawable)})을 초과했습니다.`); }
        if (db.cashflows.filter((c) => c.userId === u.id && c.status === 'pending').length >= 3) throw new Error('처리 대기 중인 신청이 3건 이상입니다.');
        const c = { id: U.uid('c'), userId: u.id, type, amount, memo: memo || '', method: method || 'cash', status: 'pending', at: new Date().toISOString() };
        db.cashflows.push(c);
        if (db.settings.autoApprove) applyCash(c, true, 'auto');
        save(); ev.emit('change'); return c;
      },
      async cancelCash(id) { const u = needUser(); const c = db.cashflows.find((x) => x.id === id && x.userId === u.id); if (!c || c.status !== 'pending') throw new Error('취소할 수 없습니다.'); c.status = 'cancelled'; c.processedAt = new Date().toISOString(); save(); ev.emit('change'); },
      async margin() { return null; },
      async deleteUsers(ids) { needAdmin(); let n = 0; for (const id of ids || []) { const u = db.users.find((x) => x.id === id); if (!u || u.role === 'admin') continue; db.users = db.users.filter((x) => x.id !== id); n++; } save(); ev.emit('change'); return n; },
      async deleteMe() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); }, async deleteInquiries() { return 0; },
      async rt() { return {}; }, async finance() { return null; }, async industries() { return null; }, async industry() { return null; }, async orderPinStatus() { return false; }, async myReserves() { return []; }, async riskGet() { return null; }, async riskSave() { return true; }, async memberAccess() { return {}; }, async riskList() { return []; }, async disclosures() { return []; }, async disclosure() { return {}; }, async publicInfo() { return { popups: [], faqs: [], terms: {}, service: {} }; }, async pv() { return null; }, async consents() { return []; }, async consent() { return true; },
      async missions() { return []; }, async contests() { return []; }, async contestRank() { return []; }, async myMoneyLog() { return []; }, async online() { return []; }, async moneyLog() { return []; },
      async blocks() { return []; }, async handover() { return []; }, async templates() { return []; }, async noticeConsents() { return []; }, async dailyStats() { return []; }, async userStats() { return []; },
      async pageStats() { return { pages: [], daily: [] }; }, async partners() { return []; }, async partnerComm() { return []; }, async partnerWds() { return []; }, async partnerInqs() { return []; },
      async cfMarkets() { return []; }, async cfState() { throw new Error('코인 선물은 운영 서버 연결 후 사용할 수 있습니다.'); }, async stakeProducts() { return []; },
      async aiStatus() { return { source: 'free', planName: '무료', used: 0, limit: 999, unlimited: true, picks: true, enabled: true, pending: 0 }; }, async aiUse() { return this.aiStatus(); },
      async requestSub() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); }, async cancelSub() { return true; }, async mySubs() { return []; }, async adminSubs() { return []; },
      async processSub() { return true; }, async grantSub() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); }, async revokeSub() { return true; }, async userLogins() { return []; }, async memberSummary() { return {}; },
      async myInquiries() { return []; }, async createInquiry() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); }, async readInquiries() { return true; },
      async adminInquiries() { return []; }, async answerInquiry() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); }, async closeInquiry() { return true; },
      async sendMessage() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); }, async bulkCash() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); },
      async adminPoll() { return { cash: db.cashflows.filter((c) => c.status === 'pending').map((c) => ({ id: c.id, at: c.at, type: c.type, amount: c.amount, method: c.method, name: (db.users.find((u) => u.id === c.userId) || {}).name })), buffs: [], inquiries: [], signups: [], liquidations: [], danger: [] }; },
      async revenue() { return { total: { fee: db.fills.reduce((t, f) => t + f.fee, 0), tax: db.fills.reduce((t, f) => t + f.tax, 0), interest: 0, volume: db.fills.reduce((t, f) => t + f.amount, 0), loan: 0 }, daily: [], signups: [] }; },
      async requestBuff() { throw new Error('MAX 버프는 운영 서버 연결 후 사용할 수 있습니다.'); },
      async cancelBuff() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); },
      async repayBuff() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); },
      async buffs() { return []; },
      async processBuff() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); },
      async forceLiquidate() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); },
      async adjustBuff() { throw new Error('운영 서버 연결 후 사용할 수 있습니다.'); },
      async setGrade(id, grade) { needAdmin(); const u = db.users.find((x) => x.id === id); if (u) u.grade = grade; save(); ev.emit('change'); return true; },
      async setCardTier(id, tier) { needAdmin(); const u = db.users.find((x) => x.id === id); if (u) u.cardTier = tier; save(); ev.emit('change'); return true; },
      async watchGroups() { const u = needUser(); db.wg = db.wg || {}; return JSON.parse(JSON.stringify(db.wg[u.id] || [{ id: 'g1', name: '관심종목', codes: [...(u.watch || [])] }])); },
      async saveWatchGroups(groups) { const u = needUser(); db.wg = db.wg || {}; const g = (groups || []).slice(0, 20).map((x, i) => ({ id: String(x.id || 'g' + (i + 1)).slice(0, 24), name: String(x.name || '그룹').slice(0, 20), codes: [...new Set((x.codes || []).map(String))].slice(0, 100) })); db.wg[u.id] = g; u.watch = [...new Set(g.flatMap((x) => x.codes))].slice(0, 200); save(); ev.emit('change'); return g; },
      async toggleWatch(code) { const u = needUser(); u.watch = u.watch || []; u.watch = u.watch.includes(code) ? u.watch.filter((c) => c !== code) : [...u.watch, code]; save(); ev.emit('change'); return u.watch; },
      async updateProfile(p) { const u = needUser(); for (const k of ['name', 'phone', 'email']) if (p[k] !== undefined) u[k] = String(p[k]).slice(0, 60); save(); ev.emit('change'); return pubUser(u); },
      async changePassword(oldPw, newPw) { const u = needUser(); if (u.pw !== (await U.sha256(u.username + ':' + oldPw))) throw new Error('현재 비밀번호가 올바르지 않습니다.'); if ((newPw || '').length < 6) throw new Error('새 비밀번호는 6자 이상입니다.'); u.pw = await U.sha256(u.username + ':' + newPw); save(); },
      async resetAccount() {
        const u = needUser();
        db.orders = db.orders.filter((o) => o.userId !== u.id); db.fills = db.fills.filter((f) => f.userId !== u.id);
        db.cashflows = db.cashflows.filter((c) => c.userId !== u.id); db.positions[u.id] = {}; db.snapshots[u.id] = [];
        u.cash = db.settings.initialCash; u.initial = db.settings.initialCash; save(); ev.emit('change');
      },
      async recordSnapshot(total) { const u = me(); if (!u) return; const s = (db.snapshots[u.id] = db.snapshots[u.id] || []); const t = U.today(); if (s.length && s[s.length - 1][0] === t) s[s.length - 1][1] = Math.round(total); else s.push([t, Math.round(total)]); if (s.length > 400) s.splice(0, s.length - 400); save(); },
      // 리딩 · 공지
      async posts() { return db.posts.slice().sort((a, b) => b.at.localeCompare(a.at)); },
      async savePost(p) {
        const u = needStaff();
        if (!(p.title || '').trim()) throw new Error('제목을 입력해 주세요.');
        if (p.id) { const x = db.posts.find((y) => y.id === p.id); if (!x) throw new Error('게시물이 없습니다.'); Object.assign(x, p, { updatedAt: new Date().toISOString() }); }
        else db.posts.push({ ...p, id: U.uid('p'), authorId: u.id, authorName: u.name, at: new Date().toISOString(), comments: [], likes: [] });
        save(); ev.emit('change');
      },
      async deletePost(id) { needStaff(); db.posts = db.posts.filter((p) => p.id !== id); save(); ev.emit('change'); },
      async comment(postId, text) { const u = needUser(); text = (text || '').trim(); if (!text) throw new Error('내용을 입력해 주세요.'); const p = db.posts.find((x) => x.id === postId); p.comments.push({ id: U.uid('m'), userId: u.id, name: u.name, text: text.slice(0, 500), at: new Date().toISOString() }); save(); ev.emit('change'); },
      async deleteComment(postId, cid) { const u = needUser(); const p = db.posts.find((x) => x.id === postId); const c = p && p.comments.find((x) => x.id === cid); if (!c) return; if (c.userId !== u.id && u.role === 'user') throw new Error('권한이 없습니다.'); p.comments = p.comments.filter((x) => x.id !== cid); save(); ev.emit('change'); },
      async like(postId) { const u = needUser(); const p = db.posts.find((x) => x.id === postId); p.likes = p.likes.includes(u.id) ? p.likes.filter((x) => x !== u.id) : [...p.likes, u.id]; save(); ev.emit('change'); },
      async notices() { return db.notices.slice().sort((a, b) => (b.pinned - a.pinned) || b.at.localeCompare(a.at)); },
      async saveNotice(n) { needStaff(); if (!(n.title || '').trim()) throw new Error('제목을 입력해 주세요.'); if (n.id) Object.assign(db.notices.find((x) => x.id === n.id), n); else db.notices.push({ ...n, id: U.uid('n'), at: new Date().toISOString() }); save(); ev.emit('change'); },
      async deleteNotice(id) { needStaff(); db.notices = db.notices.filter((n) => n.id !== id); save(); ev.emit('change'); },
      async ranking() { // 회원별 평가에 필요한 원자료
        return db.users.filter((u) => u.role === 'user' && u.status === 'active').map((u) => ({ ...view(bundle(u.id)), user: { id: u.id, name: u.name, username: u.username, initial: u.initial, cash: u.cash, status: u.status } }));
      },
      // 관리자
      async users() { needAdmin(); return db.users.map(pubUser); },
      async userBundle(id) { needAdmin(); return view(bundle(id)); },
      async allBundles() { needAdmin(); return db.users.filter((u) => u.role !== 'admin').map((u) => view(bundle(u.id))); },
      async setUserStatus(id, status) { needAdmin(); const u = userById(id); u.status = status; db.audit.push({ at: new Date().toISOString(), by: me().username, action: 'status', detail: u.username + '→' + status }); save(); ev.emit('change'); },
      async setUserRole(id, role) { needAdmin(); const u = userById(id); if (u.id === me().id) throw new Error('본인 권한은 변경할 수 없습니다.'); u.role = role; save(); ev.emit('change'); },
      async adjustCash(id, amount, memo) {
        needAdmin(); amount = Math.round(+amount); if (!amount) throw new Error('금액을 입력해 주세요.');
        const c = { id: U.uid('c'), userId: id, type: amount > 0 ? 'deposit' : 'withdraw', amount: Math.abs(amount), memo: '[관리자 조정] ' + (memo || ''), status: 'pending', at: new Date().toISOString() };
        db.cashflows.push(c); applyCash(c, true, me().username); save(); ev.emit('change');
      },
      async cashflows() { needAdmin(); return db.cashflows.map((c) => ({ ...c, username: (userById(c.userId) || {}).username, name: (userById(c.userId) || {}).name })).sort((a, b) => b.at.localeCompare(a.at)); },
      async processCash(id, approve, memo) { needAdmin(); const c = db.cashflows.find((x) => x.id === id); if (!c || c.status !== 'pending') throw new Error('처리할 수 없는 신청입니다.'); applyCash(c, approve, me().username, memo); save(); ev.emit('change'); },
      async stats() { needAdmin(); return { logins: db.logins.slice(-2000), audit: db.audit.slice(-200) }; },
      async resetDemo() { needAdmin(); localStorage.removeItem(KEY); localStorage.removeItem(SKEY); },
      async exportDB() { needAdmin(); return JSON.stringify(db); },
    };
    function applyCash(c, approve, by, memo) {
      const u = userById(c.userId);
      if (approve && c.type === 'withdraw') {
        const v = Engine.valuate(bundle(u.id), db.settings);
        if (c.amount > v.cash - v.reserved) { c.status = 'rejected'; c.adminMemo = '출금가능금액 부족'; c.processedAt = new Date().toISOString(); c.processedBy = by; return; }
      }
      c.status = approve ? 'approved' : 'rejected'; c.processedAt = new Date().toISOString(); c.processedBy = by; if (memo) c.adminMemo = memo;
      if (approve) u.cash += c.type === 'deposit' ? c.amount : -c.amount;
    }
    return api;
  })();

  // ─────────────── ApiStore (운영 모드) ───────────────
  const Remote = (() => {
    const ev = U.emitter();
    let token = localStorage.getItem('mls.token') || '';
    // 주문 비밀번호: 이번 접속 동안 기억, 틀리거나 없으면 입력 창을 띄우고 한 번 다시 시도
    const PIN_ACTIONS = ['placeOrder', 'amendOrder', 'cfOrder', 'cfClose', 'reserveOrder'];
    async function call(action, body, retried) {
      if (PIN_ACTIONS.includes(action)) { let pin = ''; try { pin = sessionStorage.getItem('mls.pin') || ''; } catch {} if (pin) body = { ...(body || {}), pin }; }
      try { return await call0(action, body); } catch (e) {
        if (e.code === 'PIN' && !retried && window.MLS_PIN_PROMPT) { const pin = await window.MLS_PIN_PROMPT(); if (pin) { try { sessionStorage.setItem('mls.pin', pin); } catch {} return call(action, { ...(body || {}), pin }, true); } }
        if (e.code === 'PIN') { try { sessionStorage.removeItem('mls.pin'); } catch {} }
        throw e;
      }
    }
    async function call0(action, body) {
      if (C.SUPABASE_URL) {
        const r = await fetch(C.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/mls_api', {
          method: 'POST', headers: { 'Content-Type': 'application/json', apikey: C.SUPABASE_KEY, ...(C.SUPABASE_KEY && C.SUPABASE_KEY.startsWith('eyJ') ? { Authorization: 'Bearer ' + C.SUPABASE_KEY } : {}) },
          body: JSON.stringify({ p_action: action, p_body: body || {}, p_token: token || null }),
        });
        let j; try { j = await r.json(); } catch { throw new Error('서버 응답 오류 (' + r.status + ')'); }
        if (!r.ok) throw new Error((j && (j.message || j.error)) || '서버 응답 오류 (' + r.status + ')');
        if (!j || !j.ok) { const er = new Error((j && j.error) || '요청 실패'); er.code = j && j.code; throw er; }
        return j.data;
      }
      const r = await fetch(C.API_BASE + '?action=' + encodeURIComponent(action), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({ ...(body || {}), ...(token ? { _t: token } : {}) }),
      });
      let j; try { j = await r.json(); } catch { throw new Error('서버 응답 오류 (' + r.status + ')'); }
      if (!j.ok) throw new Error(j.error || '요청 실패');
      return j.data;
    }
    const mut = (a) => async (...args) => { const r = await a(...args); ev.emit('change'); return r; };
    return {
      mode: 'server', on: ev.on,
      async init() { return true; },
      async current() { if (!token) return null; try { return await call('current'); } catch { return null; } },
      async login(username, pw) { const r = await call('login', { username, pw, device: deviceId() }); token = r.token; localStorage.setItem('mls.token', token); return r.user; },
      async signup(p) { const r = await call('signup', { ...p, device: deviceId(), ref: p.ref || refCode() || undefined }); token = r.token; localStorage.setItem('mls.token', token); return r.user; },
      async logout() { try { await call('logout'); } catch {} token = ''; localStorage.removeItem('mls.token'); try { sessionStorage.removeItem('mls.pin'); } catch {} },
      me: () => call('me'),
      settings: () => call('settings'),
      saveSettings: mut((s) => call('saveSettings', s)),
      placeOrder: mut((o) => call('placeOrder', o)),
      cancelOrder: mut((id) => call('cancelOrder', { id })),
      amendOrder: mut((id, price, qty, extra) => call('amendOrder', { id, price, qty, ...(extra || {}) })),
      matchAll: async () => [], // 서버가 시세 갱신 시 처리
      requestCash: mut((type, amount, memo, method) => call('requestCash', { type, amount, memo, method })),
      margin: () => call('margin'),
      requestBuff: mut((mult, memo) => call('requestBuff', { mult, memo })),
      cancelBuff: mut((id) => call('cancelBuff', { id })),
      repayBuff: mut(() => call('repayBuff')),
      buffs: () => call('buffs'),
      processBuff: mut((id, approve, mult, memo) => call('processBuff', { id, approve, mult, memo })),
      forceLiquidate: mut((userId) => call('forceLiquidate', { userId })),
      adjustBuff: mut((id, maintain, rate) => call('adjustBuff', { id, maintain, rate })),
      setGrade: mut((id, grade) => call('setGrade', { id, grade })),
      setCardTier: mut((id, tier) => call('setCardTier', { id, tier })),
      myInquiries: () => call('myInquiries'),
      createInquiry: mut((category, title, body) => call('createInquiry', { category, title, body })),
      readInquiries: () => call('readInquiries'),
      adminInquiries: () => call('adminInquiries'),
      answerInquiry: mut((id, answer) => call('answerInquiry', { id, answer })),
      closeInquiry: mut((id) => call('closeInquiry', { id })),
      sendMessage: mut((title, body, userIds) => call('sendMessage', { title, body, userIds })),
      bulkCash: mut((userIds, amount, memo) => call('bulkCash', { userIds, amount, memo })),
      adminPoll: () => call('adminPoll'),
      revenue: () => call('revenue'),
      deleteUsers: mut((ids, reason) => call('deleteUsers', { ids, reason })),
      deleteMe: (pw, reason) => call('deleteMe', { pw, reason }),
      deleteInquiries: mut((ids) => call('deleteInquiries', { ids })),
      cfMarkets: () => call('cfMarkets'),
      cfState: () => call('cfState'),
      cfConvert: mut((dir, amount) => call('cfConvert', { dir, amount })),
      cfOrder: (o) => call('cfOrder', o),
      cfCancel: (id, all) => call('cfCancel', all ? { all: '1' } : { id }),
      cfClose: (sym, qty) => call('cfClose', { sym, qty }),
      cfTpSl: (sym, tp, sl) => call('cfTpSl', { sym, tp, sl }),
      stakeProducts: (all) => call('stakeProducts', all ? { all: '1' } : {}),
      stakeStart: (productId, amount) => call('stakeStart', { productId, amount }),
      stakeRedeem: (id) => call('stakeRedeem', { id }),
      cfAdmin: () => call('cfAdmin'),
      stakeAdmin: () => call('stakeAdmin'),
      stakeSave: (products) => call('stakeSave', { products }),
      // v8 — 공개 정보 · 이벤트 · 대회 · 관리자 운영 도구 · 파트너
      publicInfo: () => call('publicInfo'),
      rt: (codes) => call('rt', { codes }),
      finance: (code, period) => call('finance', { code, period }), industries: () => call('industries'), industry: (no) => call('industry', { no }),
      orderPinStatus: () => call('orderPinStatus'), setOrderPin: (pw, pin) => call('setOrderPin', { pw, pin }),
      reserveOrder: mut((o) => call('reserveOrder', o)), myReserves: () => call('myReserves'), cancelReserve: (id) => call('cancelReserve', { id }), adminReserves: () => call('adminReserves'),
      riskSave: (answers, score, type) => call('riskSave', { answers, score, type }), riskGet: (userId) => call('riskGet', userId ? { userId } : {}),
      suspendUser: (userId, until, reason) => call('suspendUser', { userId, until, reason }), kickUser: (userId) => call('kickUser', { userId }),
      accessHours: (userId, hours) => call('accessHours', { userId, hours }), memberAccess: (userId) => call('memberAccess', { userId }), riskList: () => call('riskList'),
      disclosures: (code) => call('disclosures', { code }), disclosure: (code, id) => call('disclosure', { code, id: String(id) }),
      pv: (items) => call('pv', { items }).catch(() => null),
      consents: () => call('consents'), consent: (id) => call('consent', { id }),
      missions: () => call('missions'), claimMission: mut((id) => call('claimMission', { id })),
      contests: () => call('contests'), joinContest: (id) => call('joinContest', { id }), contestRank: (id) => call('contestRank', { id }),
      myMoneyLog: () => call('myMoneyLog'),
      online: () => call('online'), moneyLog: (userId, limit) => call('moneyLog', { userId, limit }),
      blocks: () => call('blocks'), blockSave: (kind, value, memo) => call('blockSave', { kind, value, memo }), blockDelete: (id) => call('blockDelete', { id }),
      handover: () => call('handover'), handoverSave: (body) => call('handoverSave', { body }), handoverDone: (id) => call('handoverDone', { id }),
      popupSave: (p) => call('popupSave', p), popupDelete: (id) => call('popupDelete', { id }),
      faqSave: (faqs) => call('faqSave', { faqs }), termsSave: (k, title, body) => call('termsSave', { k, title, body }),
      templates: () => call('templates'), templateSave: (items) => call('templateSave', { items }),
      setNoticeConsent: (id, need) => call('setNoticeConsent', { id, need }), noticeConsents: () => call('noticeConsents'),
      contestSave: (c) => call('contestSave', c), contestDelete: (id) => call('contestDelete', { id }), contestFinish: (id) => call('contestFinish', { id }),
      missionSave: (items) => call('missionSave', { items }),
      dailyStats: (days) => call('dailyStats', { days }), userStats: () => call('userStats'), pageStats: (days) => call('pageStats', { days }),
      partners: () => call('partners'), partnerSave: (p) => call('partnerSave', p), partnerDelete: (id) => call('partnerDelete', { id }),
      partnerComm: (partnerId) => call('partnerComm', { partnerId }), partnerWds: () => call('partnerWds'), partnerWdProcess: (id, approve, memo) => call('partnerWdProcess', { id, approve, memo }),
      partnerInqs: () => call('partnerInqs'), partnerInqAnswer: (id, answer) => call('partnerInqAnswer', { id, answer }), assignPartner: (userId, partnerId) => call('assignPartner', { userId, partnerId }),
      aiStatus: () => call('aiStatus'),
      aiUse: (code) => call('aiUse', { code }),
      requestSub: mut((plan, method, memo) => call('requestSub', { plan, method, memo })),
      cancelSub: mut((id) => call('cancelSub', { id })),
      mySubs: () => call('mySubs'),
      adminSubs: () => call('adminSubs'),
      processSub: mut((id, approve, memo) => call('processSub', { id, approve, memo })),
      grantSub: mut((userId, plan, days, memo) => call('grantSub', { userId, plan, days, memo })),
      revokeSub: mut((id) => call('revokeSub', { id })),
      userLogins: (userId) => call('userLogins', { userId }),
      memberSummary: () => call('memberSummary'),
      cancelCash: mut((id) => call('cancelCash', { id })),
      toggleWatch: mut((code) => call('toggleWatch', { code })),
      watchGroups: () => call('watchGroups'),
      saveWatchGroups: mut((groups) => call('saveWatchGroups', { groups })),
      updateProfile: mut((p) => call('updateProfile', p)),
      changePassword: (o, n) => call('changePassword', { oldPw: o, newPw: n }),
      resetAccount: mut(() => call('resetAccount')),
      recordSnapshot: (total) => call('recordSnapshot', { total }).catch(() => {}),
      posts: () => call('posts'),
      savePost: mut((p) => call('savePost', p)),
      deletePost: mut((id) => call('deletePost', { id })),
      comment: mut((postId, text) => call('comment', { postId, text })),
      deleteComment: mut((postId, cid) => call('deleteComment', { postId, cid })),
      like: mut((postId) => call('like', { postId })),
      notices: () => call('notices'),
      saveNotice: mut((n) => call('saveNotice', n)),
      deleteNotice: mut((id) => call('deleteNotice', { id })),
      ranking: () => call('ranking'),
      users: () => call('users'),
      userBundle: (id) => call('userBundle', { id }),
      allBundles: () => call('allBundles'),
      setUserStatus: mut((id, status) => call('setUserStatus', { id, status })),
      setUserRole: mut((id, role) => call('setUserRole', { id, role })),
      adjustCash: mut((id, amount, memo) => call('adjustCash', { id, amount, memo })),
      cashflows: () => call('cashflows'),
      processCash: mut((id, approve, memo) => call('processCash', { id, approve, memo })),
      stats: () => call('stats'),
      resetDemo: async () => { throw new Error('운영 모드에서는 사용할 수 없습니다.'); },
      exportDB: () => call('exportDB'),
    };
  })();

  return C.API_BASE || C.SUPABASE_URL ? Remote : Local;
})();
