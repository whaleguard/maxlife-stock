// MAX라이프 주식 — 운영 기능(팝업·필수 동의·점검 안내·약관·FAQ), 이벤트·투자 대회, 이용 가이드,
// 자산 변동 로그, 수익 인증 카드, 시장 심리 지수, 서버 응답 속도, 페이지 방문 집계
(() => {
  const { $, $$, esc, won, n0, cls, pct, ICON } = U;
  const M = () => window.MLS;
  const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  // ───────── 공개 정보 (팝업 · FAQ · 약관 · 점검) ─────────
  const PUB = { d: null, at: 0, async get(force) { if (!force && this.d && Date.now() - this.at < 60000) return this.d; try { this.d = await Store.publicInfo(); this.at = Date.now(); } catch { this.d = this.d || { popups: [], faqs: [], terms: {}, service: {} }; } return this.d; } };
  const TERMS_DEF = {
    terms: ['이용약관', 'MAX라이프 주식은 실제 시세를 바탕으로 가상 계좌에서 주문·체결을 이용하는 서비스입니다.\n\n1. 회원은 정확한 정보로 가입하며, 계정을 타인에게 양도하거나 대여할 수 없습니다.\n2. 앱 안의 예수금·코인·USDT·포인트는 가상 자산이며 실제 돈이나 코인으로 지급·환전되지 않습니다.\n3. 서비스 화면의 분석·리딩·AI 정보는 참고용이며 실제 투자 판단의 책임은 이용자에게 있습니다.\n4. 운영 정책을 어기거나 서비스를 악용하면 이용이 제한될 수 있습니다.\n5. 회사는 점검·장애 시 사전 공지 후 서비스를 일시 중지할 수 있습니다.'],
    privacy: ['개인정보 처리방침', '1. 수집 항목: 아이디, 닉네임, 휴대폰(선택), 접속 IP·기기 정보, 이용 기록\n2. 이용 목적: 회원 식별, 부정 이용 방지, 고객 문의 응대, 서비스 개선\n3. 보관 기간: 회원 탈퇴 시 즉시 삭제 (관련 법령에 따라 보관이 필요한 기록은 해당 기간 동안 보관)\n4. 이용자는 마이페이지에서 언제든 탈퇴하고 개인정보 삭제를 요청할 수 있습니다.'],
    risk: ['거래 위험 안내', '· 주식·코인 선물은 가격 변동이 크며, 레버리지를 쓰면 작은 변동에도 증거금 전부를 잃을 수 있습니다.\n· 이 서비스의 모든 거래는 가상 자산으로만 이뤄지며 실제 수익·손실이 발생하지 않습니다.\n· 실제 투자 전에는 반드시 금융회사의 투자설명서와 위험 고지를 확인하세요.'],
  };
  async function termsModal(k) {
    const d = await PUB.get(); const t = (d.terms || {})[k]; const def = TERMS_DEF[k] || ['약관', ''];
    U.modal({ title: (t && t.title) || def[0], size: 'lg', body: `<div class="terms-body">${esc((t && t.body) || def[1]).replace(/\n/g, '<br>')}</div>${t && t.updatedAt ? `<p class="dim" style="font-size:12px;margin-top:12px">최종 수정 ${U.date(t.updatedAt)}</p>` : ''}`, foot: '<button class="btn btn-brand" data-x>확인</button>' });
  }

  // 점검 시간 확인 (KST HH:MM, 자정 넘김 지원)
  function inService(sb) {
    if (!sb || !sb.enabled) return false;
    const now = new Date(Date.now() + 9 * 3600000); const hm = now.getUTCHours() * 60 + now.getUTCMinutes();
    const t = (s) => { const [h, m] = String(s || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const a = t(sb.start), b = t(sb.end); return a <= b ? hm >= a && hm < b : hm >= a || hm < b;
  }
  async function serviceBanner(cached) {
    const d = await PUB.get(!cached); const sb = d.service || {}; let el = $('#svcBar');
    if (!inService(sb)) { if (el) el.remove(); return; }
    if (!el) { const m = $('#main'); if (!m) return; el = document.createElement('div'); el.id = 'svcBar'; el.className = 'svc-bar'; m.prepend(el); }
    el.innerHTML = `<b>점검 안내</b><span>${esc(sb.message || '서비스 점검 중입니다.')} · ${esc(sb.start)} ~ ${esc(sb.end)} 동안 주문·충전이 잠시 중지됩니다.</span>`;
  }

  // 팝업 (오늘 하루 보지 않기)
  async function popups() {
    const d = await PUB.get(); const ss = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }; const L = (d.popups || []).filter((p) => ls.get('mls.pp.' + p.id) !== today() && !ss('mls.pps.' + p.id));
    const show = (i) => {
      const p = L[i]; if (!p) return;
      U.modal({ title: p.title, body: `${p.image ? `<img src="${esc(p.image)}" alt="" style="width:100%;border-radius:8px;margin-bottom:12px">` : ''}<div style="line-height:1.7">${esc(p.body || '').replace(/\n/g, '<br>')}</div>`,
        foot: `<button class="btn" id="ppNo">오늘 하루 보지 않기</button>${p.link ? `<a class="btn btn-brand" id="ppGo" href="${esc(p.link)}">자세히 보기</a>` : ''}<button class="btn ${p.link ? '' : 'btn-brand'}" data-x>닫기</button>`,
        onMount: (m, close) => {
          const next = () => setTimeout(() => show(i + 1), 250);
          $('#ppNo', m).onclick = () => { ls.set('mls.pp.' + p.id, today()); close(); next(); };
          $$('[data-x]', m).forEach((b) => b.addEventListener('click', () => { try { sessionStorage.setItem('mls.pps.' + p.id, '1'); } catch {} next(); }));
          const g = $('#ppGo', m); if (g) g.addEventListener('click', () => { close(); });
        } });
    };
    show(0);
  }

  // 필수 동의 공지 (동의해야 닫힘)
  async function consents() {
    let L; try { L = await Store.consents(); } catch { return; } if (!L || !L.length) return;
    const n = L[0]; const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><div class="modal-h"><h3>${esc(n.title)}</h3><span class="tag tag-warn">필수 확인</span></div><div class="modal-b"><div class="terms-body">${esc(n.body || '').replace(/\n/g, '<br>')}</div><label class="check" style="margin-top:14px"><input type="checkbox" id="csChk"> 위 내용을 확인했으며 동의합니다.</label></div><div class="modal-f"><button class="btn btn-brand" id="csOk" disabled>동의하고 계속</button></div></div>`;
    document.body.appendChild(bg);
    $('#csChk', bg).onchange = (e) => { $('#csOk', bg).disabled = !e.target.checked; };
    $('#csOk', bg).onclick = async () => { try { await Store.consent(n.id); bg.remove(); consents(); } catch (e) { U.toast(e.message, true); } };
  }

  // 페이지 방문 집계 (30초마다 묶어서 전송)
  const PV = { q: {}, add(p) { this.q[p] = (this.q[p] || 0) + 1; }, flush() { const items = Object.entries(this.q).map(([p, n]) => ({ p, n })); this.q = {}; if (items.length && Store.pv) Store.pv(items); } };
  setInterval(() => PV.flush(), 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) PV.flush(); });

  // 서버 응답 속도 (RPC 호출 시간 측정)
  const LAT = { v: [], add(ms) { this.v.push(ms); if (this.v.length > 20) this.v.shift(); this.show(); }, avg() { return this.v.length ? Math.round(this.v.reduce((a, b) => a + b, 0) / this.v.length) : null; },
    show() { const el = $('#latB'); if (!el) return; const a = this.avg(); if (a == null) return; el.className = 'lat-b ' + (a < 300 ? 'ok' : a < 800 ? 'mid' : 'slow'); el.innerHTML = `<i></i>${a}ms`; el.title = `서버 응답 평균 ${a}ms (최근 ${this.v.length}회)`; } };
  const of = window.fetch.bind(window);
  window.fetch = async (u, o) => { const t0 = performance.now(); const r = await of(u, o); if (typeof u === 'string' && u.includes('/rpc/mls_api')) LAT.add(performance.now() - t0); return r; };

  // ───────── 시장 심리 (상승·하락 종목 비율 + 평균 등락률) ─────────
  function breadth() {
    const L = Market.list().filter((q) => q.price > 0); if (!L.length) return null;
    const kr = L.filter((q) => q.currency === 'KRW'); const S0 = kr.length > 20 ? kr : L;
    const up = S0.filter((q) => q.changePct > 0).length, dn = S0.filter((q) => q.changePct < 0).length;
    const avg = S0.reduce((s, q) => s + (q.changePct || 0), 0) / S0.length;
    const v = Math.max(0, Math.min(100, Math.round(50 + ((up - dn) / S0.length) * 35 + Math.max(-15, Math.min(15, avg * 5)))));
    const label = v < 25 ? '극도의 공포' : v < 45 ? '공포' : v <= 55 ? '중립' : v <= 75 ? '탐욕' : '극도의 탐욕';
    return { v, label, up, dn, flat: S0.length - up - dn, avg, n: S0.length };
  }
  function breadthCard() {
    const b = breadth(); if (!b) return '';
    return `<section class="panel brd-card"><div class="panel-b"><div class="brd-h"><b>시장 심리 지수</b><span class="dim">국내 ${n0(b.n)}종목 상승·하락 비율 기준</span></div>
      <div class="brd-row"><div class="brd-v">${b.v}<small>${b.label}</small></div><div style="flex:1;min-width:0"><div class="fng-bar"><i style="left:${b.v}%"></i></div><div class="brd-l"><span>공포</span><span>중립</span><span>탐욕</span></div></div></div>
      <div class="brd-s"><span class="up">상승 ${n0(b.up)}</span><span class="dim">보합 ${n0(b.flat)}</span><span class="down">하락 ${n0(b.dn)}</span><span>평균 등락 <b class="${cls(b.avg)}">${pct(b.avg)}</b></span></div></div></section>`;
  }

  // ───────── 수익 인증 카드 (이미지 저장) ─────────
  function shareCard() {
    const S = M().S; const v = S.v; const u = S.user; const W = 1080, H = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#13161C'); g.addColorStop(1, '#1D2430'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    const F = (s, w = 700) => `${w} ${s}px 'Pretendard Variable', Pretendard, sans-serif`;
    c.fillStyle = '#B7E77A'; c.font = F(44, 800); c.fillText('MAX라이프 주식', 80, 130);
    c.fillStyle = '#929DAC'; c.font = F(30, 500); c.fillText(`${u.name} 님의 투자 성과 · ${U.date(new Date().toISOString())}`, 80, 190);
    const up = v.netPct >= 0; const col = up ? '#FF626B' : '#619AFF';
    c.fillStyle = '#929DAC'; c.font = F(34, 600); c.fillText('누적 수익률', 80, 330);
    c.fillStyle = col; c.font = F(150, 800); c.fillText((up ? '+' : '') + v.netPct.toFixed(2) + '%', 70, 490);
    c.fillStyle = '#EEF1F5'; c.font = F(44, 700); c.fillText(`손익 ${(v.netPnl >= 0 ? '+' : '') + won(Math.round(v.netPnl))}`, 80, 580);
    c.fillStyle = '#929DAC'; c.font = F(32, 500); c.fillText(`순자산 ${won(Math.round(v.net))}`, 80, 640);
    c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 2; c.beginPath(); c.moveTo(80, 710); c.lineTo(W - 80, 710); c.stroke();
    c.fillStyle = '#EEF1F5'; c.font = F(36, 700); c.fillText('보유 종목 TOP 5', 80, 790);
    const hs = v.holdings.slice().sort((a, b) => b.evalKrw - a.evalKrw).slice(0, 5);
    hs.forEach((h, i) => { const y = 870 + i * 82; c.fillStyle = '#EEF1F5'; c.font = F(34, 600); c.fillText(h.name.length > 14 ? h.name.slice(0, 13) + '…' : h.name, 80, y); c.fillStyle = h.pnlPct >= 0 ? '#FF626B' : '#619AFF'; c.font = F(36, 800); c.textAlign = 'right'; c.fillText((h.pnlPct >= 0 ? '+' : '') + h.pnlPct.toFixed(2) + '%', W - 80, y); c.textAlign = 'left'; });
    if (!hs.length) { c.fillStyle = '#6A7484'; c.font = F(32, 500); c.fillText('보유 종목 없음', 80, 870); }
    c.fillStyle = '#6A7484'; c.font = F(24, 500); c.fillText('실제 시세 기반 가상 계좌 성과이며 실제 수익이 아닙니다.', 80, H - 70);
    const url = cv.toDataURL('image/png');
    U.modal({ title: '수익 인증 카드', body: `<img src="${url}" alt="수익 인증 카드" style="width:100%;border-radius:10px">`, foot: `<button class="btn" data-x>닫기</button><a class="btn btn-brand" download="MAX라이프-수익인증-${today()}.png" href="${url}">이미지 저장</a>` });
  }

  // ───────── FAQ (관리자가 편집) ─────────
  async function faq(el) {
    if (!el) return; const d = await PUB.get(); const L = d.faqs || []; if (!L.length) return;
    const cats = [...new Set(L.map((f) => f.cat))];
    el.innerHTML = `${cats.length > 1 ? `<div class="seg" id="fqC" style="margin-bottom:10px;flex-wrap:wrap"><button data-v="" class="on">전체</button>${cats.map((c) => `<button data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}<div id="fqL"></div><p class="dim" style="font-size:12px;margin-top:12px"><button class="link" data-tm="terms">이용약관</button> · <button class="link" data-tm="privacy">개인정보 처리방침</button> · <button class="link" data-tm="risk">거래 위험 안내</button></p>`;
    const draw = (c) => { $('#fqL', el).innerHTML = L.filter((f) => !c || f.cat === c).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a).replace(/\n/g, '<br>')}</p></details>`).join(''); };
    const sg = $('#fqC', el); if (sg) sg.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; $$('button', sg).forEach((x) => x.classList.toggle('on', x === b)); draw(b.dataset.v); };
    $$('[data-tm]', el).forEach((b) => (b.onclick = () => termsModal(b.dataset.tm)));
    draw('');
  }

  // ───────── 자산 변동 로그 ─────────
  async function moneyLog(el) {
    el.innerHTML = '<section class="panel"><div class="empty">불러오는 중…</div></section>';
    let L; try { L = await Store.myMoneyLog(); } catch (e) { el.innerHTML = `<section class="panel"><div class="empty">${esc(e.message)}</div></section>`; return; }
    const CTX = { placeOrder: '주문 체결', matchAll: '주문 체결', processCash: '입출금 처리', requestCash: '입출금 신청', cfConvert: '원화↔USDT 전환', cfOrder: '코인 선물', cfClose: '코인 선물 청산', stakeStart: '스테이킹 예치', stakeRedeem: '스테이킹 해지', repayBuff: 'MAX 버프 상환', processBuff: 'MAX 버프', bulkCash: '관리자 지급', adjustCash: '관리자 조정', cron: '자동 처리' };
    const lab = (c) => CTX[c] || (c && c.startsWith('미션') ? c : c || '시스템');
    el.innerHTML = `<section class="panel"><div class="panel-h"><h3>자산 변동 로그</h3><span class="dim" style="font-size:12px">예수금·USDT가 바뀐 모든 기록 (최근 300건)</span></div>${L.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>시각</th><th class="l">구분</th><th>자산</th><th>변동</th><th>변동 후 잔액</th></tr></thead><tbody>${L.map((x) => `<tr><td class="dim">${U.dt(x.at)}</td><td class="l">${esc(lab(x.ctx))}</td><td>${x.asset === 'USDT' ? 'USDT' : '원화'}</td><td class="${cls(x.delta)}">${x.delta > 0 ? '+' : ''}${x.asset === 'USDT' ? x.delta.toFixed(4) : n0(x.delta)}</td><td>${x.asset === 'USDT' ? x.balance.toFixed(4) : won(x.balance)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">변동 기록이 없습니다</div>'}</section>`;
  }

  // ═════════ 이벤트 · 투자 대회 ═════════
  function Events(main, arg) {
    let tab = arg === 'contest' ? 'contest' : 'mission';
    main.innerHTML = `${M().head('이벤트 · 투자 대회', '미션을 달성하면 보상 예수금을 받고, 투자 대회에 참가해 수익률로 순위를 겨룹니다.')}
      <div class="tabs" id="evT" style="margin-bottom:16px"><button data-v="mission">미션 이벤트</button><button data-v="contest">투자 대회</button></div><div id="evB"></div>`;
    $('#evT').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.v; history.replaceState(null, '', '#/events/' + tab); draw(); };
    const KIND = { trades: '체결', ai: 'AI 분석', watch: '관심종목', cf: '코인 선물 체결', deposit: '충전', login: '출석' };
    async function draw() {
      $$('#evT button').forEach((x) => x.classList.toggle('on', x.dataset.v === tab)); const el = $('#evB'); el.innerHTML = '<div class="empty">불러오는 중…</div>';
      try {
        if (tab === 'mission') {
          const L = await Store.missions();
          el.innerHTML = L.length ? `<div class="ev-grid">${L.map((m) => { const p = Math.min(100, (m.progress / m.target) * 100); const done = m.progress >= m.target; return `<div class="ev-card ${m.claimed ? 'claimed' : done ? 'done' : ''}"><div class="ev-h"><b>${esc(m.title)}</b><span class="tag ${m.claimed ? 'tag-no' : done ? 'tag-ok' : 'tag-wait'}">${m.claimed ? '받음' : done ? '달성' : '진행 중'}</span></div><p class="muted">${esc(m.descr || '')}</p><div class="ev-prog"><i style="width:${p}%"></i></div><div class="ev-f"><span class="dim">${KIND[m.kind] || m.kind} ${n0(Math.min(m.progress, m.target))} / ${n0(m.target)}</span><b class="brand">+${won(m.reward)}</b></div><button class="btn btn-block ${done && !m.claimed ? 'btn-brand' : ''}" data-cl="${m.id}" ${done && !m.claimed ? '' : 'disabled'}>${m.claimed ? '보상 받음' : done ? '보상 받기' : '미션 진행 중'}</button></div>`; }).join('')}</div>` : '<div class="panel"><div class="empty">진행 중인 미션이 없습니다</div></div>';
          $$('[data-cl]', el).forEach((b) => (b.onclick = async () => { try { const r = await Store.claimMission(b.dataset.cl); U.toast(`미션 보상 ${won(r)}이 예수금으로 지급되었습니다.`); M().Voice.say('미션 보상이 지급되었습니다.'); M().chime(); draw(); } catch (e) { U.toast(e.message, true); } }));
        } else {
          const L = await Store.contests();
          const ST = { open: ['참가 모집·진행 중', 'tag-ok'], finished: ['종료', 'tag-no'], ready: ['준비 중', 'tag-wait'] };
          el.innerHTML = L.length ? L.map((c) => `<section class="panel ct-card"><div class="panel-b"><div class="ct-h"><div><b>${esc(c.title)}</b><span class="tag ${(ST[c.status] || ST.ready)[1]}">${(ST[c.status] || ST.ready)[0]}</span></div><span class="dim">${U.date(c.startsAt)} ~ ${U.date(c.endsAt)} · 참가 ${n0(c.users)}${c.maxUsers ? ' / ' + n0(c.maxUsers) : ''}명</span></div>
            <p class="muted" style="margin:8px 0">${esc(c.descr || '').replace(/\n/g, '<br>')}</p>${c.prize ? `<div class="ct-prize"><b>시상</b> ${esc(c.prize).replace(/\n/g, '<br>')}</div>` : ''}
            <div class="ct-act">${c.joined ? '<span class="tag tag-brand">참가 중</span>' : c.status === 'open' ? `<button class="btn btn-brand" data-jn="${c.id}">대회 참가하기</button>` : ''}<button class="btn" data-rk="${c.id}" data-t="${esc(c.title)}">순위 보기</button></div></div></section>`).join('') : '<div class="panel"><div class="empty">열린 투자 대회가 없습니다</div></div>';
          $$('[data-jn]', el).forEach((b) => (b.onclick = async () => { if (!(await U.confirmBox('대회 참가', '<p>참가하는 순간의 순자산을 기준으로 대회 기간 동안의 수익률을 계산합니다. 참가할까요?</p>', '참가'))) return; try { await Store.joinContest(b.dataset.jn); U.toast('대회에 참가했습니다. 지금부터 수익률이 집계됩니다.'); draw(); } catch (e) { U.toast(e.message, true); } }));
          $$('[data-rk]', el).forEach((b) => (b.onclick = () => rankDlg(b.dataset.rk, b.dataset.t)));
        }
      } catch (e) { el.innerHTML = `<div class="panel"><div class="empty">${esc(e.message)}</div></div>`; }
    }
    async function rankDlg(id, title) {
      let L = []; try { L = await Store.contestRank(id); } catch (e) { return U.toast(e.message, true); }
      U.modal({ title: title + ' 순위', size: 'lg', body: L.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>순위</th><th class="l">닉네임</th><th>시작 자산</th><th>현재 자산</th><th>수익률</th></tr></thead><tbody>${L.map((r, i) => `<tr class="${r.me ? 'me-row' : ''}"><td><b>${r.rank || i + 1}</b></td><td class="l">${esc(r.name)}${r.me ? ' <span class="tag tag-brand">나</span>' : ''}</td><td>${won(r.startNet)}</td><td>${won(r.net)}</td><td class="${cls(r.pct)}"><b>${pct(r.pct)}</b></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">아직 참가자가 없습니다</div>', foot: '<button class="btn btn-brand" data-x>닫기</button>' });
    }
    draw();
    return { data: () => {} };
  }

  // ═════════ 이용 가이드 ═════════
  function Guide(main) {
    const G = [
      ['처음 시작하기', ['가입하면 가상 예수금이 바로 지급됩니다.', '상단 검색(Ctrl+K)에서 종목명·코드를 찾아 「종목·주문」 화면으로 들어갑니다.', '오른쪽 주문창에서 매수·매도, 가격, 수량을 정하고 주문합니다. 시장가는 바로 체결, 지정가는 그 가격에 닿으면 체결됩니다.']],
      ['주문 종류', ['지정가: 원하는 가격을 정해 주문합니다.', '시장가: 지금 가장 좋은 호가로 바로 체결합니다. 정규장에서만 가능합니다.', '감시주문: 현재가가 정한 가격에 닿으면 자동으로 시장가 주문합니다. 손절·돌파 매매에 씁니다.', '시간외: 장 시작 전·후 시간외 종가, 시간외 단일가, 미국 프리·애프터마켓 주문입니다.', '자동 익절·손절: 매수 주문창의 「매수 체결 후 자동 익절·손절」에 %를 넣으면 체결 즉시 두 주문이 함께 걸리고, 한쪽이 체결되면 나머지는 자동 취소됩니다.']],
      ['빠르게 주문하기', ['호가창의 「원클릭」을 켜면 호가를 누르는 즉시 주문이 접수됩니다. 매도호가를 누르면 매수, 매수호가를 누르면 매도입니다.', 'F9 시장가 매수, F10 시장가 매도, Ctrl+Enter 주문 실행. 전체 단축키는 F1에서 확인하세요.', '보유현황 탭에서 종목 전량 청산·보유 종목 일괄 청산을 한 번에 할 수 있습니다.']],
      ['코인 선물 · 스테이킹', ['입출금 또는 코인 선물 화면에서 원화 예수금을 가상 USDT로 전환합니다.', '롱(상승에 베팅)·숏(하락에 베팅)과 레버리지를 고르고 증거금을 넣어 진입합니다. 실제 거래소 시세로 체결됩니다.', '가격이 예상 청산가에 닿으면 증거금을 잃고 강제 청산됩니다. 익절·손절을 꼭 걸어 두세요.', '스테이킹은 USDT를 기간 동안 예치하고 만기에 가상 이자를 받습니다. 중도 해지하면 원금만 돌려받습니다.']],
      ['MAX AI · MAX 리딩', ['MAX AI 분석은 차트·거래량·수급·뉴스를 점수로 정리해 지지·저항·목표가를 보여줍니다.', 'MAX 리딩룸에서 공지와 리딩 글을 확인하고 댓글로 질문할 수 있습니다.']],
      ['입출금 · 고객센터', ['입출금 메뉴에서 충전·출금을 신청하면 관리자가 확인 후 처리합니다.', '궁금한 점은 고객센터 1:1 문의로 남기면 답변이 달릴 때 알림과 음성으로 알려드립니다.', '모든 자산은 가상 자산이며 실제 돈·코인으로 지급되지 않습니다.']],
    ];
    main.innerHTML = `${M().head('이용 가이드', 'MAX라이프 주식을 처음 쓰는 분을 위한 기능 안내입니다.', '<button class="btn btn-sm" id="gdKeys">단축키 보기 (F1)</button>')}
      <div class="gd-grid">${G.map(([t, L], i) => `<section class="panel gd-card"><div class="panel-b"><div class="gd-n">${i + 1}</div><h3>${t}</h3><ul>${L.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></section>`).join('')}</div>
      <section class="panel" style="margin-top:16px"><div class="panel-h"><h3>용어 사전</h3><div class="search" style="max-width:220px">${ICON.search}<input id="gdQ" placeholder="용어 검색" style="width:100%"></div></div><div class="panel-b gloss" id="gdL"></div></section>
      <section class="panel" style="margin-top:16px"><div class="panel-b" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><b style="margin-right:auto">더 알아보기</b><a class="btn btn-sm" href="#/help">자주 묻는 질문 · 1:1 문의</a><a class="btn btn-sm" href="#/download">PC 프로그램 받기</a><button class="btn btn-sm" data-tm="terms">이용약관</button><button class="btn btn-sm" data-tm="risk">거래 위험 안내</button></div></section>`;
    const GL = [
      ['예수금', '계좌에 들어 있는 현금입니다. 증권사의 「예수금」과 같습니다.'], ['주문가능금액', '예수금에서 미체결 매수 주문·출금 신청 금액을 뺀, 지금 주문에 쓸 수 있는 돈입니다.'], ['출금가능금액', '지금 출금 신청할 수 있는 금액입니다.'],
      ['평가금액 · 평가손익', '보유 주식을 현재가로 계산한 금액과, 매입 금액 대비 손익입니다. 팔기 전까지는 확정되지 않은 손익입니다.'], ['실현손익', '이미 매도해서 확정된 손익입니다.'], ['순자산', '예수금 + 보유 주식 평가금액 − MAX 버프 지원금·이자입니다.'],
      ['지정가', '내가 정한 가격(또는 더 유리한 가격)에만 체결되는 주문입니다.'], ['시장가', '가격을 정하지 않고 지금 가장 좋은 호가로 바로 체결합니다. 정규장에서만 됩니다.'],
      ['최유리지정가', '바로 체결되도록 상대편 1호가로 지정가를 넣습니다. 매수는 매도 1호가, 매도는 매수 1호가입니다.'], ['최우선지정가', '내 쪽 1호가에 줄을 섭니다. 매수는 매수 1호가, 매도는 매도 1호가입니다.'],
      ['감시주문', '증권사의 「자동감시주문·스탑로스」입니다. 현재가가 정한 가격에 닿으면 자동으로 시장가 주문이 나갑니다.'], ['자동 익절·손절', '매수 체결 후 이익실현(지정가 매도)과 손실제한(감시 매도)을 한 번에 겁니다. 한쪽이 체결되면 다른 쪽은 자동 취소됩니다(OCO).'],
      ['시간외', '정규장 전후 거래입니다. 장전·장후 시간외 종가, 시간외 단일가, 미국 프리·애프터마켓이 있습니다.'], ['정정 · 취소', '미체결 주문의 가격·수량을 바꾸거나 주문을 없앱니다.'],
      ['호가 · 잔량', '사고(매수)·팔려는(매도) 가격과 그 가격에 쌓인 주문 수량입니다. 위쪽(파란색)이 매도, 아래쪽(빨간색)이 매수입니다.'], ['원클릭 주문', '호가를 누르는 즉시 확인 창 없이 주문이 접수됩니다. 매도호가를 누르면 매수, 매수호가를 누르면 매도입니다.'],
      ['체결강도', '매수 체결량 ÷ 매도 체결량 × 100입니다. 100보다 크면 사려는 힘이 강합니다.'], ['상한가 · 하한가', '국내 주식이 하루에 오르내릴 수 있는 한도(전일 종가 ±30%)입니다.'], ['52주 최저 · 최고', '최근 1년 동안의 가장 낮은·높은 가격입니다.'],
      ['MAX 버프', '증권사의 「신용·투자금 지원」과 비슷합니다. 순자산의 최대 몇 배까지 가상 투자금을 지원받고, 담보비율이 기준 아래로 내려가면 자동 청산됩니다.'], ['담보비율', '(총자산 ÷ 지원금) × 100입니다. 청산 기준 아래로 내려가면 보유 종목이 자동 매도됩니다.'],
      ['MAX 리딩', '운영진이 실제 시세로 매매 진입·목표·손절가를 공개하는 리딩입니다. 따라 할지는 본인이 판단합니다.'], ['MAX AI 분석', '차트·거래량·수급·뉴스·공시를 점수로 정리해 지지·저항·목표가를 보여주는 참고 지표입니다.'],
      ['롱 · 숏', '코인 선물에서 가격 상승에 거는 것이 롱(매수), 하락에 거는 것이 숏(매도)입니다.'], ['레버리지', '증거금의 몇 배 규모로 포지션을 잡을지입니다. 높을수록 작은 변동에도 크게 벌거나 잃습니다.'],
      ['증거금 · 청산가', '포지션을 유지하려고 맡긴 USDT와, 손실로 증거금을 다 잃어 강제 청산되는 가격입니다.'], ['펀딩비', '무기한 선물에서 8시간마다 롱·숏 사이에 오가는 작은 수수료입니다.'],
      ['USDT · 스테이킹', '코인 선물·스테이킹에 쓰는 앱 안의 가상 달러입니다. 스테이킹은 USDT를 기간 동안 예치하고 만기에 가상 이자를 받는 기능입니다.'], ['투자성향', '마이페이지에서 7문항으로 진단하는 안정형~공격투자형 5단계 성향입니다. 실제 매매 기록으로 본 성향도 함께 보여줍니다.'],
      ['예약주문', '장이 닫혀 있을 때 미리 넣어 두면 다음 정규장 시작(국내 09:00) 때 자동으로 주문합니다. 주문 유형의 「예약」을 고르세요.'], ['분할 주문', '총 수량을 여러 가격으로 나눠 지정가 주문을 한 번에 넣습니다. 주문창 아래 「분할 주문」 버튼입니다.'],
      ['주문 비밀번호', '증권사의 계좌 비밀번호처럼 주문 전에 숫자 4~6자리를 확인합니다. 마이페이지 → 보안에서 켜고 끕니다.'], ['화면번호', 'HTS처럼 상단 검색창에 [0600] 같은 4자리 번호를 넣고 Enter를 누르면 그 화면으로 바로 갑니다. 목록은 마이페이지 → 보안에 있습니다.'],
      ['스토캐스틱', '최근 14일 가격 범위 안에서 현재가 위치를 0~100으로 보여주는 지표입니다. 80 이상은 과열, 20 이하는 침체로 봅니다.'], ['일목균형표', '전환선·기준선과 구름대(선행스팬)로 추세와 지지·저항을 보는 지표입니다. 가격이 구름 위면 상승 추세로 봅니다.'],
      ['업종별 시세', '시세·순위 화면 위쪽에서 업종별 평균 등락률과 상승·하락 종목 수를 봅니다. 업종을 누르면 소속 종목이 나옵니다.'], ['재무제표', '종목정보 탭 아래에서 매출액·영업이익·순이익·ROE 등을 연간·분기로 봅니다. 예상치는 (예상)으로 표시됩니다.'],
    ];
    const gd = (q) => { $('#gdL').innerHTML = GL.filter(([t, d]) => !q || t.includes(q) || d.includes(q)).map(([t, d]) => `<div class="gl-r"><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join('') || '<div class="empty">찾는 용어가 없습니다</div>'; };
    $('#gdQ').oninput = (e) => gd(e.target.value.trim()); gd('');
    $('#gdKeys').onclick = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    $$('[data-tm]').forEach((b) => (b.onclick = () => termsModal(b.dataset.tm)));
    return {};
  }

  // 입출금 화면: USDT 지갑 카드
  async function usdtCard() {
    const main = $('#main'); if (!main || $('#usdtCard')) return; const ph = $('.page-head', main); if (!ph) return; try { if (window.MLS && MLS.S && MLS.S.st && MLS.S.st.cfEnabled === false) return; } catch {}
    const box = document.createElement('section'); box.className = 'panel'; box.id = 'usdtCard'; box.style.marginBottom = '16px';
    box.innerHTML = '<div class="panel-b usdt-card"><div><small class="dim">USDT 지갑 (코인 선물·스테이킹용 가상 USDT)</small><br><b id="ucV">-</b> <span class="dim" id="ucK"></span></div><div style="display:flex;gap:6px;margin-left:auto;flex-wrap:wrap"><button class="btn btn-sm btn-brand" id="ucCv">원화 ↔ USDT 전환</button><a class="btn btn-sm" href="#/futures/BTC">코인 선물</a><a class="btn btn-sm" href="#/staking">스테이킹</a></div></div>';
    ph.after(box);
    const load = async () => { try { const st = await window.MLS_CF.W.load(true); $('#ucV').textContent = window.MLS_CF.usd(st.usdt) + ' USDT'; $('#ucK').textContent = '≈ ' + won(Math.round(st.usdt * st.fx)); } catch { box.remove(); } };
    $('#ucCv').onclick = () => window.MLS_CF.convertDlg(() => { load(); M().reload(); });
    load();
  }


  // ───────── 투자성향 (설문 진단 + 실제 매매 성향) ─────────
  async function risk(el) {
    el.innerHTML = '<div class="empty">불러오는 중…</div>';
    let R = null; try { R = await Store.riskGet(); } catch {}
    const B = Risk.behavior(M().S.d);
    el.innerHTML = `<div class="grid g-2 stack"><section class="panel"><div class="panel-h"><h3>투자성향 진단</h3><button class="btn btn-sm btn-brand" id="rkGo">${R ? '다시 진단하기' : '진단 시작'}</button></div><div class="panel-b">${Risk.surveyHTML(R)}<p class="dim" style="font-size:12px;margin-top:12px">7가지 질문으로 투자 기간·경험·손실 감수 정도를 확인해 5단계(안정형~공격투자형)로 알려드립니다. 결과는 MAX 리딩·AI 분석을 볼 때 참고용입니다.</p></div></section>
      <section class="panel"><div class="panel-h"><h3>실제 매매 성향</h3><span class="dim" style="font-size:12px">내 체결 ${n0((M().S.d.fills || []).length)}건 기준</span></div><div class="panel-b">${Risk.behaviorHTML(B)}</div></section></div>
      ${R && B ? `<section class="panel" style="margin-top:16px"><div class="panel-b rk-cmp">${(() => { const t = Risk.typeOf(R.score); const gap = B.aggr - R.score; return `<b>진단 결과와 실제 매매 비교</b><p class="muted">진단은 <b>${esc(R.type)}</b>(${R.score}점)인데 실제 매매 공격성은 <b>${B.aggr}점</b>입니다. ${Math.abs(gap) < 15 ? '생각한 성향대로 매매하고 있습니다.' : gap > 0 ? '생각보다 공격적으로 매매하고 있습니다. 손실 한도를 미리 정해 두세요.' : '생각보다 보수적으로 매매하고 있습니다.'}</p>`; })()}</div></section>` : ''}`;
    $('#rkGo', el).onclick = () => survey(() => risk(el));
  }
  function survey(done) {
    const ans = [];
    U.modal({ title: '투자성향 진단', size: 'lg', body: `<div id="rkQ">${Risk.Q.map((q, i) => `<div class="rk-q"><b>${i + 1}. ${esc(q.q)}</b><div class="rk-a">${q.a.map(([t], j) => `<label><input type="radio" name="rq${i}" value="${j}"> <span>${esc(t)}</span></label>`).join('')}</div></div>`).join('')}</div>`,
      foot: '<span class="dim" id="rkN" style="margin-right:auto;font-size:12px">0 / 7</span><button class="btn" data-x>취소</button><button class="btn btn-brand" id="rkOk" disabled>결과 보기</button>',
      onMount: (m, close) => {
        const upd = () => { for (let i = 0; i < Risk.Q.length; i++) { const c = $(`input[name=rq${i}]:checked`, m); ans[i] = c ? +c.value : null; } const n = ans.filter((x) => x != null).length; $('#rkN', m).textContent = `${n} / ${Risk.Q.length}`; $('#rkOk', m).disabled = n < Risk.Q.length; };
        m.addEventListener('change', upd);
        $('#rkOk', m).onclick = async () => { const sc = Risk.scoreOf(ans); const t = Risk.typeOf(sc); try { await Store.riskSave(ans, sc, t[1]); close(); U.toast(`투자성향: ${t[1]} (${sc}점)`); M().Voice.say(`투자성향은 ${t[1]}입니다.`); done && done(); } catch (e) { U.toast(e.message, true); } };
      } });
  }

  // ───────── 화면번호 (HTS처럼 4자리 번호로 화면 이동) ─────────
  const SCREENS = [['0101', '홈', '#/home'], ['0150', '시세·순위', '#/market'], ['0155', '업종별 시세', '#/market'], ['0161', '조건검색', '#/screen'], ['0170', '관심종목', '#/watch'], ['0600', '종목·주문 (현재가)', '#/stock/005930'], ['0610', '예약주문', '#/stock/005930'],
    ['0400', '잔고', '#/balance'], ['0410', '거래내역', '#/history'], ['0500', '입출금', '#/cash'], ['0700', '코인 선물', '#/futures/BTC'], ['0710', '스테이킹', '#/staking'], ['0800', 'MAX 리딩', '#/lead'], ['0810', 'MAX 버프', '#/buff'], ['0820', 'MAX AI 분석', '#/ai'],
    ['0830', '투자 수익 랭킹', '#/rank'], ['0840', '이벤트·투자 대회', '#/events'], ['0900', '이용 가이드·용어 사전', '#/guide'], ['0910', '고객센터', '#/help'], ['0950', '마이페이지', '#/my'], ['0960', '투자성향', '#/my/risk'], ['0970', '보안·주문 비밀번호', '#/my/sec'], ['0980', '자산 변동 로그', '#/my/money']];
  document.addEventListener('keydown', (e) => {
    const t = e.target; if (!t || t.id !== 'q' || e.key !== 'Enter') return; const v = t.value.trim().replace(/[\[\]]/g, '');
    if (/^\d{4}$/.test(v)) { const sc = SCREENS.find((x) => x[0] === v); if (sc) { e.preventDefault(); e.stopImmediatePropagation(); t.value = ''; t.blur(); const qr = $('#qr'); if (qr) qr.classList.add('hidden'); let hash = sc[2]; if (/^#\/stock\//.test(hash)) { const m = location.hash.match(/#\/stock\/([0-9A-Z]{6})/); if (m) hash = '#/stock/' + m[1]; } location.hash = hash; U.toast(`[${sc[0]}] ${sc[1]}`); } else if (!/^\d{6}$/.test(v)) { U.toast(`없는 화면번호입니다. 이용 가이드에서 화면번호 목록을 확인하세요.`, true); } }
  }, true);

  // ───────── 주문 비밀번호 ─────────
  window.MLS_PIN_PROMPT = () => new Promise((res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    U.modal({ title: '주문 비밀번호', body: '<p class="muted" style="margin:0 0 10px">주문하려면 주문 비밀번호(숫자 4~6자리)를 입력하세요. 이번 접속 동안 다시 묻지 않습니다.</p><input class="input pin-in" id="pinI" type="password" inputmode="numeric" maxlength="6" autocomplete="off">', foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="pinOk">확인</button>',
      onMount: (m, close) => { const i = $('#pinI', m); setTimeout(() => i.focus(), 50); const ok = () => { const v = i.value.trim(); if (!/^\d{4,6}$/.test(v)) return U.toast('숫자 4~6자리를 입력해 주세요.', true); fin(v); close(); }; $('#pinOk', m).onclick = ok; i.onkeydown = (e) => { if (e.key === 'Enter') ok(); }; $$('[data-x]', m).forEach((b) => b.addEventListener('click', () => fin(null))); m.closest('.modal-bg').addEventListener('click', (e) => { if (e.target.classList.contains('modal-bg')) fin(null); }); } });
  });
  async function security(el) {
    el.innerHTML = '<div class="empty">불러오는 중…</div>'; let has = false; try { has = await Store.orderPinStatus(); } catch {}
    el.innerHTML = `<div class="grid g-2 stack"><section class="panel"><div class="panel-h"><h3>주문 비밀번호</h3><span class="tag ${has ? 'tag-ok' : 'tag-no'}">${has ? '사용 중' : '사용 안 함'}</span></div><div class="panel-b">
      <p class="muted" style="font-size:13px;margin:0 0 12px">증권사 HTS의 계좌 비밀번호처럼, 주문(주식·코인 선물·예약주문)할 때 숫자 비밀번호를 한 번 더 확인합니다. 접속할 때마다 처음 주문하는 순간 한 번만 묻습니다.</p>
      <div class="field"><label>로그인 비밀번호 (본인 확인)</label><input class="input" type="password" id="spPw" autocomplete="current-password"></div>
      <div class="field"><label>새 주문 비밀번호 (숫자 4~6자리)</label><input class="input pin-in" type="password" id="spPin" inputmode="numeric" maxlength="6" autocomplete="off"></div>
      <div style="display:flex;gap:8px"><button class="btn btn-brand" id="spSet">${has ? '변경' : '설정'}</button>${has ? '<button class="btn" id="spDel">사용 안 함</button>' : ''}</div></div></section>
      <section class="panel"><div class="panel-h"><h3>화면번호</h3><span class="dim" style="font-size:12px">상단 검색창에 4자리 입력 후 Enter</span></div><div class="panel-b flush"><div class="table-wrap"><table class="t"><tbody>${SCREENS.map(([n, l, h]) => `<tr><td><code>[${n}]</code></td><td class="l"><a href="${h}">${esc(l)}</a></td></tr>`).join('')}</tbody></table></div></div></section></div>`;
    const go = async (pin) => { try { await Store.setOrderPin($('#spPw', el).value, pin); try { sessionStorage.removeItem('mls.pin'); } catch {} U.toast(pin ? '주문 비밀번호를 설정했습니다.' : '주문 비밀번호를 해제했습니다.'); security(el); } catch (e) { U.toast(e.message, true); } };
    $('#spSet', el).onclick = () => { const p = $('#spPin', el).value.trim(); if (!/^\d{4,6}$/.test(p)) return U.toast('주문 비밀번호는 숫자 4~6자리입니다.', true); go(p); };
    const d = $('#spDel', el); if (d) d.onclick = () => go('');
  }

  // ───────── 업종별 시세 (시세·순위 화면) ─────────
  async function industryPanel() {
    const main = $('#main'); if (!main || $('#indPanel')) return; const ses = $('.ses-strip', main); if (!ses) return;
    const box = document.createElement('section'); box.className = 'panel'; box.id = 'indPanel'; box.style.marginBottom = '16px';
    box.innerHTML = '<div class="panel-h"><h3>업종별 시세 <span class="dim" style="font-size:12px;font-weight:500">[0155]</span></h3><div class="seg" id="indS"><button data-v="up" class="on">상승률순</button><button data-v="down">하락률순</button><button data-v="name">이름순</button></div></div><div class="panel-b"><div class="ind-grid" id="indG"><div class="empty">불러오는 중…</div></div></div>';
    ses.after(box); let G = [], so = 'up';
    const draw = () => { const L = G.slice().sort((a, b) => (so === 'up' ? b.r - a.r : so === 'down' ? a.r - b.r : a.name.localeCompare(b.name))); $('#indG', box).innerHTML = L.map((g) => `<button class="ind-c" data-ind="${g.no}" data-nm="${esc(g.name)}" style="--a:${Math.min(1, Math.abs(g.r) / 5)}"><b>${esc(g.name)}</b><span class="${cls(g.r)}">${g.r > 0 ? '+' : ''}${g.r.toFixed(2)}%</span><small><span class="up">▲${g.up}</span> <span class="down">▼${g.down}</span> · ${g.n}종목</small><i class="${g.r >= 0 ? 'u' : 'd'}"></i></button>`).join('') || '<div class="empty">업종 정보를 불러오지 못했습니다</div>'; };
    $('#indS', box).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; so = b.dataset.v; $$('#indS button', box).forEach((x) => x.classList.toggle('on', x === b)); draw(); };
    $('#indG', box).onclick = async (e) => { const b = e.target.closest('[data-ind]'); if (!b) return; let D; try { D = await Store.industry(b.dataset.ind); } catch (er) { return U.toast(er.message, true); } const S0 = (D && D.stocks) || [];
      U.modal({ title: b.dataset.nm + ' 업종', size: 'lg', body: S0.length ? `<div class="table-wrap"><table class="t"><thead><tr><th class="l">종목</th><th>현재가</th><th>등락률</th><th>거래량</th></tr></thead><tbody>${S0.map((x) => { const r = parseFloat(x.fluctuationsRatio) || 0; return `<tr class="click" data-go="${x.itemCode}"><td class="l"><b>${esc(x.stockName)}</b> <small class="dim">${x.itemCode}</small></td><td class="${cls(r)}">${esc(x.closePrice)}</td><td class="${cls(r)}">${r > 0 ? '+' : ''}${r.toFixed(2)}%</td><td>${esc(x.accumulatedTradingVolume || '')}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">종목이 없습니다</div>', foot: '<button class="btn btn-brand" data-x>닫기</button>',
        onMount: (m, close) => { m.addEventListener('click', (ev) => { const r = ev.target.closest('[data-go]'); if (r) { close(); location.hash = '#/stock/' + r.dataset.go; } }); } }); };
    try { const D = await Store.industries(); G = ((D && D.groups) || []).map((g) => ({ no: g.no, name: g.name, r: parseFloat(g.changeRate) || 0, up: g.riseCount, down: g.fallCount, n: g.totalCount })); } catch {} draw();
  }
  window.MLS_PAGES = Object.assign(window.MLS_PAGES || {}, { events: Events, guide: Guide });
  window.MLSX = {
    termsModal, faq, moneyLog, shareCard, breadth, PUB, risk, survey, security, SCREENS,
    async boot() {
      // 상단 바: 서버 응답 속도
      const ta = $('.top-actions'); if (ta && !$('#latB')) { const b = document.createElement('span'); b.id = 'latB'; b.className = 'lat-b hide-m'; ta.prepend(b); LAT.show(); }
      await serviceBanner(); setInterval(serviceBanner, 60000);
      await consents(); popups();
    },
    route(name) {
      PV.add(name || 'home'); serviceBanner(true);
      if (name === 'home') { const m = $('#main'); const g = m && $('#hBrd', m); if (g && !$('.brd-card', m)) { g.innerHTML = breadthCard(); } }
      if (name === 'balance') { const ph = $('#main .page-head'); if (ph && !$('#shareBtn')) { const b = document.createElement('button'); b.className = 'btn btn-sm'; b.id = 'shareBtn'; b.textContent = '수익 인증 카드'; b.onclick = shareCard; ph.appendChild(b); } }
      if (name === 'cash') usdtCard();
      if (name === 'market') industryPanel();
    },
  };
})();
