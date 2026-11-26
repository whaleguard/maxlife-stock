// MAX라이프 주식 — 관리자 확장: 코인 선물·스테이킹, 이벤트·대회, 파트너·지사, 통계, 운영 도구, 팝업·FAQ·약관
(() => {
  const { $, $$, esc, won, n0, pct, cls, ICON } = U;
  const C = () => window.ADM_CORE;
  const H = (...a) => C().head(...a);
  const tabs = (id, L, cur) => `<div class="tabs" id="${id}" style="margin-bottom:16px">${L.map(([k, n]) => `<button data-v="${k}" class="${k === cur ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const onTabs = (id, f) => { $('#' + id).onclick = (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; $$('#' + id + ' button').forEach((x) => x.classList.toggle('on', x === b)); f(b.dataset.v); }; };
  const tbl = (head, rows, empty = '내역이 없습니다') => (rows.length ? `<div class="table-wrap"><table class="t"><thead><tr>${head.map((h) => `<th class="${Array.isArray(h) ? h[1] || '' : ''}">${Array.isArray(h) ? h[0] : h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="empty">${empty}</div>`);
  const err = (el, e) => { el.innerHTML = `<div class="empty">${esc(e.message || e)}</div>`; };
  const fmtUsd = (v, d = 2) => (v == null ? '-' : (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const cp = (v) => (window.MLS_CF ? window.MLS_CF.cp(v) : fmtUsd(v, 4));
  const csv = (name, head, rows) => { const s = '﻿' + [head, ...rows].map((r) => r.map((x) => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'text/csv' })); a.download = name + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const localDT = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const isoOf = (v) => (v ? new Date(v).toISOString() : '');
  const CTX = { placeOrder: '주문 체결', matchAll: '주문 체결', processCash: '입출금 처리', requestCash: '입출금 신청', cfConvert: '원화↔USDT', cfOrder: '코인 선물', cfClose: '코인 선물 청산', stakeStart: '스테이킹', stakeRedeem: '스테이킹 해지', repayBuff: '버프 상환', processBuff: '버프', bulkCash: '일괄 지급', adjustCash: '관리자 조정', forceLiquidate: '강제 청산', cron: '자동 처리', deleteUsers: '계정 삭제' };
  const ctxL = (c) => CTX[c] || c || '시스템';

  // ═════ 코인 선물 · 스테이킹 ═════
  function Coin(main, sub) {
    let tab = sub || 'pos';
    main.innerHTML = `${H('코인 선물 · 스테이킹', '가상 USDT 무기한 선물과 스테이킹 현황을 보고 거래 조건·상품을 설정합니다.')}<div class="grid g-4" id="cfK" style="margin-bottom:16px"></div>${tabs('cfT', [['pos', '보유 포지션'], ['fills', '체결·청산 내역'], ['stake', '스테이킹'], ['set', '거래 설정']], tab)}<div id="cfB"></div>`;
    onTabs('cfT', (v) => { tab = v; history.replaceState(null, '', '#/coin/' + v); draw(); });
    let D = null, SK = null;
    async function draw() {
      const el = $('#cfB'); el.innerHTML = '<div class="panel"><div class="empty">불러오는 중…</div></div>';
      try { [D, SK] = await Promise.all([Store.cfAdmin(), Store.stakeAdmin()]); } catch (e) { return err(el, e); }
      const act = SK.stakes.filter((k) => k.status === 'active');
      $('#cfK').innerHTML = C().stat('보유 포지션', n0(D.positions.length) + '개', `증거금 ${fmtUsd(D.positions.reduce((s, p) => s + p.margin, 0))} USDT`) + C().stat('누적 수수료', fmtUsd(D.fees) + ' USDT', `강제 청산 ${n0(D.liqs)}건`) + C().stat('회원 USDT 합계', fmtUsd(D.usdtTotal) + ' USDT', `미체결 주문 ${n0(D.pending)}건`) + C().stat('스테이킹 예치', fmtUsd(act.reduce((s, k) => s + k.amount, 0)) + ' USDT', `${act.length}건 진행 · 시세 ${D.prices}종목 갱신`);
      if (tab === 'pos') {
        el.innerHTML = `<section class="panel">${tbl([['회원', 'l'], ['종목', 'l'], '방향', '수량', '진입가', '현재가', '청산가', '증거금', '미실현 손익'], D.positions.map((p) => `<tr><td class="l"><button class="link" data-mem="${p.userId}">${esc(p.name)}</button> <small class="dim">${esc(p.username)}</small></td><td class="l">${p.sym}USDT</td><td><span class="tag ${p.side === 'long' ? 'tag-buy' : 'tag-sell'}">${p.side === 'long' ? '롱' : '숏'} ${p.lev}x</span></td><td>${p.qty}</td><td>${cp(p.entry)}</td><td>${cp(p.mark)}</td><td class="warn-t">${cp(p.liq)}</td><td>${fmtUsd(p.margin)}</td><td class="${cls(p.upnl)}">${fmtUsd(p.upnl)} (${p.roe.toFixed(1)}%)</td></tr>`), '보유 포지션이 없습니다')}</section>`;
      } else if (tab === 'fills') {
        const A2 = { open: '진입', close: '청산', tp: '익절', sl: '손절', liq: '강제 청산' };
        el.innerHTML = `<section class="panel"><div class="panel-h"><h3>최근 300건</h3><button class="btn btn-sm" id="cfCsv">엑셀(CSV)</button></div>${tbl(['시각', ['회원', 'l'], ['종목', 'l'], '구분', '방향', '체결가', '수량', '수수료', '실현손익'], D.fills.map((f) => `<tr><td class="dim">${U.dt(f.at)}</td><td class="l">${esc(f.name)}</td><td class="l">${f.sym}</td><td><span class="tag ${f.action === 'liq' ? 'tag-sell' : 'tag-no'}">${A2[f.action] || f.action}</span></td><td class="${f.side === 'long' ? 'up' : 'down'}">${f.side === 'long' ? '롱' : '숏'}</td><td>${cp(f.price)}</td><td>${f.qty}</td><td class="dim">${fmtUsd(f.fee, 4)}</td><td class="${cls(f.pnl)}">${f.action === 'open' ? '-' : fmtUsd(f.pnl)}</td></tr>`))}</section>`;
        $('#cfCsv').onclick = () => csv('코인선물_체결', ['시각', '회원', '종목', '구분', '방향', '체결가', '수량', '수수료', '실현손익'], D.fills.map((f) => [U.dt(f.at), f.name, f.sym, A2[f.action] || f.action, f.side, f.price, f.qty, f.fee, f.pnl]));
      } else if (tab === 'stake') {
        const P = SK.products.map((p) => ({ ...p }));
        const prow = (p, i) => `<tr data-i="${i}"><td><input class="input sm" data-k="name" value="${esc(p.name)}"></td><td><input class="input sm" data-k="apr" value="${p.apr}" inputmode="decimal" style="width:70px"></td><td><input class="input sm" data-k="days" value="${p.days}" inputmode="numeric" style="width:70px"></td><td><input class="input sm" data-k="min" value="${p.min}" style="width:80px"></td><td><input class="input sm" data-k="max" value="${p.max}" style="width:100px"></td><td><input class="input sm" data-k="badge" value="${esc(p.badge || '')}" style="width:70px"></td><td><input class="input sm" data-k="descr" value="${esc(p.descr || '')}"></td><td><input type="checkbox" data-k="active" ${p.active ? 'checked' : ''}></td><td><button class="btn btn-sm btn-ghost" data-rm="${i}">삭제</button></td></tr>`;
        el.innerHTML = `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>스테이킹 상품</h3><div style="display:flex;gap:6px"><button class="btn btn-sm" id="spAdd">상품 추가</button><button class="btn btn-sm btn-brand" id="spSave">저장</button></div></div><div class="table-wrap"><table class="t edit-t"><thead><tr><th>이름</th><th>연 %</th><th>기간(일)</th><th>최소</th><th>최대</th><th>뱃지</th><th>설명</th><th>판매</th><th></th></tr></thead><tbody id="spL">${P.map(prow).join('')}</tbody></table></div><p class="dim" style="font-size:12px;padding:0 16px 12px">진행 중인 예치가 있는 상품은 삭제해도 남고, 판매만 끄려면 「판매」 체크를 해제하세요.</p></section>
          <section class="panel"><div class="panel-h"><h3>예치 내역</h3></div>${tbl([['회원', 'l'], ['상품', 'l'], '예치', '연 %', '시작', '만기', '이자', '상태'], SK.stakes.map((k) => `<tr><td class="l">${esc(k.user)} <small class="dim">${esc(k.username)}</small></td><td class="l">${esc(k.name)}</td><td>${fmtUsd(k.amount)}</td><td>${k.apr}%</td><td class="dim">${U.date(k.startedAt)}</td><td class="dim">${U.date(k.endsAt)}</td><td>${fmtUsd(k.interest, 4)}</td><td><span class="tag ${k.status === 'active' ? 'tag-wait' : k.status === 'matured' ? 'tag-ok' : 'tag-no'}">${({ active: '예치 중', matured: '만기', redeemed: '중도 해지' })[k.status]}</span></td></tr>`))}</section>`;
        const collect = () => $$('#spL tr').map((tr) => { const o = { id: P[+tr.dataset.i].id }; $$('[data-k]', tr).forEach((i) => { o[i.dataset.k] = i.type === 'checkbox' ? i.checked : ['apr', 'days', 'min', 'max'].includes(i.dataset.k) ? +i.value : i.value; }); return o; });
        $('#spAdd').onclick = () => { P.push({ id: '', name: '새 상품', apr: 5, days: 30, min: 10, max: 10000, active: true, badge: '', descr: '' }); $('#spL').insertAdjacentHTML('beforeend', prow(P[P.length - 1], P.length - 1)); };
        $('#spL').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) b.closest('tr').remove(); };
        $('#spSave').onclick = async () => { try { await Store.stakeSave(collect()); U.toast('스테이킹 상품을 저장했습니다.'); draw(); } catch (e) { U.toast(e.message, true); } };
      } else {
        const st = await Store.settings();
        const f = (k, l, v, ex = '') => `<div class="field"><label>${l}</label><input class="input" id="cs_${k}" value="${esc(v)}" ${ex}></div>`;
        el.innerHTML = `<section class="panel"><div class="panel-b"><div class="grid g-2">
          <label class="check"><input type="checkbox" id="cs_cfEnabled" ${st.cfEnabled !== false ? 'checked' : ''}> 코인 선물 거래 열기</label><label class="check"><input type="checkbox" id="cs_stakeEnabled" ${st.stakeEnabled !== false ? 'checked' : ''}> 스테이킹 신규 예치 열기</label>
          ${f('cfMaxLev', '최대 레버리지 (배)', st.cfMaxLev ?? 100, 'inputmode="numeric"')}${f('cfMinNotional', '최소 주문 규모 (USDT)', st.cfMinNotional ?? 5, 'inputmode="decimal"')}
          ${f('cfMakerFee', '지정가 수수료 (%)', st.cfMakerFee ?? 0.02, 'inputmode="decimal"')}${f('cfTakerFee', '시장가 수수료 (%)', st.cfTakerFee ?? 0.05, 'inputmode="decimal"')}
          ${f('cfMaint', '유지 증거금률 (%)', st.cfMaint ?? 0.5, 'inputmode="decimal"')}${f('liqWarn', '청산 경고 거리 (%) — 청산가까지 남은 거리가 이 비율 이하면 이용자에게 경고', st.liqWarn ?? 20, 'inputmode="decimal"')}
          ${f('liqCooldown', '청산 경고 재알림 간격 (분)', st.liqCooldown ?? 10, 'inputmode="numeric"')}
        </div><div class="field"><label>거래 종목 (쉼표로 구분, OKX USDT 무기한 기준)</label><input class="input" id="cs_cfSymbols" value="${esc((st.cfSymbols || []).join(', '))}"></div>
        <button class="btn btn-brand" id="csSave">저장</button><p class="dim" style="font-size:12px;margin-top:10px">모든 코인 선물·스테이킹은 가상 USDT로만 운영되며 실제 코인·현금으로 출금되지 않습니다.</p></div></section>`;
        $('#csSave').onclick = async () => {
          const g = (k) => $('#cs_' + k); const o = { cfEnabled: g('cfEnabled').checked, stakeEnabled: g('stakeEnabled').checked, cfSymbols: g('cfSymbols').value.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean) };
          for (const k of ['cfMaxLev', 'cfMinNotional', 'cfMakerFee', 'cfTakerFee', 'cfMaint', 'liqWarn', 'liqCooldown']) o[k] = +g(k).value;
          try { await Store.saveSettings(o); U.toast('저장했습니다.'); } catch (e) { U.toast(e.message, true); }
        };
      }
      $$('[data-mem]', el).forEach((b) => (b.onclick = () => C().memberDetail(b.dataset.mem)));
    }
    draw();
    return { data: draw };
  }

  // ═════ 이벤트 · 투자 대회 ═════
  function Events(main, sub) {
    let tab = sub || 'mission';
    main.innerHTML = `${H('이벤트 · 투자 대회', '미션 보상과 수익률 대회를 만들고 운영합니다. 보상은 예수금으로 자동 지급됩니다.')}${tabs('evT', [['mission', '미션 이벤트'], ['contest', '투자 대회']], tab)}<div id="evB"></div>`;
    onTabs('evT', (v) => { tab = v; history.replaceState(null, '', '#/events/' + v); draw(); });
    const KIND = { trades: '주식 체결 횟수', ai: 'AI 분석 횟수', watch: '관심종목 수', cf: '코인 선물 체결 횟수', deposit: '충전 횟수', login: '출석 일수' };
    async function draw() {
      const el = $('#evB'); el.innerHTML = '<div class="panel"><div class="empty">불러오는 중…</div></div>';
      try {
        if (tab === 'mission') {
          // 관리자는 비활성 미션도 보도록 목록을 직접 구성
          const L = await Store.missions();
          const row = (m, i) => `<tr data-i="${i}"><td><input class="input sm" data-k="title" value="${esc(m.title)}"></td><td><input class="input sm" data-k="descr" value="${esc(m.descr || '')}"></td><td><select class="input sm" data-k="kind">${Object.entries(KIND).map(([k, n]) => `<option value="${k}" ${k === m.kind ? 'selected' : ''}>${n}</option>`).join('')}</select></td><td><input class="input sm" data-k="target" value="${m.target}" style="width:70px"></td><td><input class="input sm" data-k="reward" value="${m.reward}" style="width:110px"></td><td><input type="checkbox" data-k="active" ${m.active !== false ? 'checked' : ''}></td><td><button class="btn btn-sm btn-ghost" data-rm>삭제</button></td></tr>`;
          el.innerHTML = `<section class="panel"><div class="panel-h"><h3>미션 목록</h3><div style="display:flex;gap:6px"><button class="btn btn-sm" id="msAdd">미션 추가</button><button class="btn btn-sm btn-brand" id="msSave">저장</button></div></div><div class="table-wrap"><table class="t edit-t"><thead><tr><th>제목</th><th>설명</th><th>조건</th><th>목표</th><th>보상 (원)</th><th>진행</th><th></th></tr></thead><tbody id="msL">${L.map(row).join('')}</tbody></table></div><p class="dim" style="font-size:12px;padding:0 16px 12px">이용자가 목표를 달성하고 「보상 받기」를 누르면 보상 금액이 예수금으로 지급되고 입출금 내역에 [미션 보상]으로 남습니다. 끈 미션은 저장 후 목록에서 숨겨집니다.</p></section>`;
          const ids = L.map((m) => m.id);
          $('#msAdd').onclick = () => { ids.push(''); $('#msL').insertAdjacentHTML('beforeend', row({ title: '새 미션', descr: '', kind: 'trades', target: 5, reward: 100000 }, ids.length - 1)); };
          $('#msL').onclick = (e) => { if (e.target.closest('[data-rm]')) e.target.closest('tr').remove(); };
          $('#msSave').onclick = async () => { const items = $$('#msL tr').map((tr) => { const o = { id: ids[+tr.dataset.i] || '' }; $$('[data-k]', tr).forEach((i) => { o[i.dataset.k] = i.type === 'checkbox' ? i.checked : ['target', 'reward'].includes(i.dataset.k) ? +i.value : i.value; }); if (!o.id) o.id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); return o; }); try { await Store.missionSave(items); U.toast('미션을 저장했습니다.'); draw(); } catch (e) { U.toast(e.message, true); } };
        } else {
          const L = await Store.contests();
          el.innerHTML = `<section class="panel"><div class="panel-h"><h3>투자 대회</h3><button class="btn btn-sm btn-brand" id="ctNew">대회 만들기</button></div>${tbl([['대회', 'l'], '기간', '참가', '상태', ''], L.map((c) => `<tr><td class="l"><b>${esc(c.title)}</b>${c.prize ? `<br><small class="dim">${esc(c.prize).slice(0, 60)}</small>` : ''}</td><td class="dim">${U.date(c.startsAt)} ~ ${U.date(c.endsAt)}</td><td>${n0(c.users)}${c.maxUsers ? ' / ' + c.maxUsers : ''}</td><td><span class="tag ${c.status === 'open' ? 'tag-ok' : c.status === 'finished' ? 'tag-no' : 'tag-wait'}">${({ open: '진행', finished: '종료', ready: '준비', hidden: '숨김' })[c.status] || c.status}</span></td><td style="white-space:nowrap"><button class="btn btn-sm" data-rk="${c.id}">순위</button> <button class="btn btn-sm" data-ed="${c.id}">수정</button> ${c.status === 'open' ? `<button class="btn btn-sm btn-brand" data-fin="${c.id}">종료·확정</button>` : ''} <button class="btn btn-sm btn-ghost" data-del="${c.id}">삭제</button></td></tr>`), '만든 대회가 없습니다')}</section>`;
          $('#ctNew').onclick = () => ctDlg({});
          $$('[data-ed]', el).forEach((b) => (b.onclick = () => ctDlg(L.find((c) => c.id === b.dataset.ed))));
          $$('[data-fin]', el).forEach((b) => (b.onclick = async () => { if (!(await U.confirmBox('대회 종료', '<p>지금 순자산으로 최종 수익률과 순위를 확정하고 대회를 종료합니다.</p>', '종료·확정'))) return; try { await Store.contestFinish(b.dataset.fin); U.toast('대회를 종료하고 순위를 확정했습니다.'); draw(); } catch (e) { U.toast(e.message, true); } }));
          $$('[data-del]', el).forEach((b) => (b.onclick = async () => { if (!(await U.confirmBox('대회 삭제', '<p>대회와 참가 기록을 모두 삭제할까요?</p>', '삭제', 'btn-danger'))) return; await Store.contestDelete(b.dataset.del); draw(); }));
          $$('[data-rk]', el).forEach((b) => (b.onclick = async () => { const R = await Store.contestRank(b.dataset.rk); U.modal({ title: '대회 순위', size: 'lg', body: tbl(['순위', ['닉네임', 'l'], '시작 자산', '현재·최종 자산', '수익률'], R.map((r, i) => `<tr><td><b>${r.rank || i + 1}</b></td><td class="l">${esc(r.name)}</td><td>${won(r.startNet)}</td><td>${won(r.net)}</td><td class="${cls(r.pct)}">${pct(r.pct)}</td></tr>`), '참가자가 없습니다'), foot: `<button class="btn" id="rkCsv">엑셀(CSV)</button><button class="btn btn-brand" data-x>닫기</button>`, onMount: (m) => { $('#rkCsv', m).onclick = () => csv('대회순위', ['순위', '닉네임', '시작 자산', '자산', '수익률'], R.map((r, i) => [r.rank || i + 1, r.name, r.startNet, r.net, r.pct.toFixed(2)])); } }); }));
        }
      } catch (e) { err(el, e); }
    }
    function ctDlg(c) {
      U.modal({ title: c.id ? '대회 수정' : '대회 만들기', body: `<div class="field"><label>대회 이름</label><input class="input" id="ctT" value="${esc(c.title || '')}" placeholder="예: 12월 MAX 수익률 챌린지"></div><div class="field"><label>설명</label><textarea class="input" id="ctD" rows="3">${esc(c.descr || '')}</textarea></div><div class="field"><label>시상 내용</label><textarea class="input" id="ctP" rows="2" placeholder="예: 1위 MAX 포인트 100만, 2위 50만">${esc(c.prize || '')}</textarea></div><div class="grid g-2"><div class="field"><label>시작</label><input class="input" type="datetime-local" id="ctS" value="${localDT(c.startsAt || new Date().toISOString())}"></div><div class="field"><label>종료</label><input class="input" type="datetime-local" id="ctE" value="${localDT(c.endsAt || new Date(Date.now() + 28 * 864e5).toISOString())}"></div><div class="field"><label>최대 인원 (0 = 제한 없음)</label><input class="input" id="ctM" value="${c.maxUsers || 0}" inputmode="numeric"></div><div class="field"><label>상태</label><select class="input" id="ctSt">${[['open', '진행 (참가 가능)'], ['ready', '준비 중'], ['hidden', '숨김'], ['finished', '종료']].map(([k, n]) => `<option value="${k}" ${k === (c.status || 'open') ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>`,
        foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="ctOk">저장</button>', onMount: (m, close) => { $('#ctOk', m).onclick = async () => { try { await Store.contestSave({ id: c.id || '', title: $('#ctT', m).value, descr: $('#ctD', m).value, prize: $('#ctP', m).value, startsAt: isoOf($('#ctS', m).value), endsAt: isoOf($('#ctE', m).value), maxUsers: +$('#ctM', m).value || 0, status: $('#ctSt', m).value }); close(); U.toast('저장했습니다.'); draw(); } catch (e) { U.toast(e.message, true); } }; } });
    }
    draw();
    return { data: draw };
  }

  // ═════ 파트너 · 지사 ═════
  function Partners(main, sub) {
    let tab = sub || 'list'; let P = [];
    main.innerHTML = `${H('파트너 · 지사', '추천 코드로 회원을 모으는 지사·파트너를 만들고 수수료와 정산을 관리합니다. 수수료는 AI 구독료·충전액 기준으로 자동 적립됩니다.', '<a class="btn btn-sm" href="partner.html" target="_blank">파트너 포털 열기</a>')}${tabs('ptT', [['list', '파트너 목록'], ['comm', '수수료 내역'], ['wd', '정산 신청'], ['inq', '파트너 문의']], tab)}<div id="ptB"></div>`;
    onTabs('ptT', (v) => { tab = v; history.replaceState(null, '', '#/partners/' + v); draw(); });
    async function draw() {
      const el = $('#ptB'); el.innerHTML = '<div class="panel"><div class="empty">불러오는 중…</div></div>';
      try {
        if (tab === 'list') {
          P = await Store.partners();
          const kids = (pid) => P.filter((p) => (p.parentId || '') === (pid || ''));
          const rows = []; const walk = (pid, d) => { for (const p of kids(pid)) { rows.push([p, d]); walk(p.id, d + 1); } }; walk('', 0);
          for (const p of P) if (!rows.find((r) => r[0] === p)) rows.push([p, 0]);
          const link = (p) => location.origin + location.pathname.replace(/admin\.html.*$/, '') + 'index.html?ref=' + p.code;
          el.innerHTML = `<section class="panel"><div class="panel-h"><h3>파트너 ${P.length}곳</h3><button class="btn btn-sm btn-brand" id="ptNew">파트너 만들기</button></div>${tbl([['파트너', 'l'], '추천 코드', '아이디', '구독 %', '충전 %', '회원', '하부', '적립 잔액', '정산 완료', '상태', ''], rows.map(([p, d]) => `<tr><td class="l"><span style="padding-left:${d * 18}px">${d ? '└ ' : ''}<b>${esc(p.name)}</b></span> <small class="dim">${p.level}단계</small></td><td><code>${esc(p.code)}</code> <button class="btn btn-sm btn-ghost" data-cp="${esc(link(p))}" title="가입 링크 복사">링크</button></td><td>${esc(p.username)}</td><td>${p.rateSub}%</td><td>${p.rateCharge}%</td><td>${n0(p.users)}</td><td>${n0(p.subs)}</td><td class="brand">${won(p.balance)}</td><td>${won(p.withdrawn)}</td><td><span class="tag ${p.status === 'active' ? 'tag-ok' : 'tag-sell'}">${p.status === 'active' ? '정상' : '정지'}</span></td><td style="white-space:nowrap"><button class="btn btn-sm" data-sub="${p.id}">하부 추가</button> <button class="btn btn-sm" data-ed="${p.id}">수정</button> <button class="btn btn-sm btn-ghost" data-del="${p.id}">삭제</button></td></tr>`), '만든 파트너가 없습니다')}</section>
            <p class="dim" style="font-size:12px;margin-top:10px">수수료 계산: 회원의 담당 파트너는 자기 비율만큼, 상위 파트너는 (자기 비율 − 하위 비율)만큼 받습니다. 예) 지사 30% · 하부 20%면 하부 20%, 지사 10%.</p>`;
          $('#ptNew').onclick = () => ptDlg({});
          $$('[data-sub]', el).forEach((b) => (b.onclick = () => ptDlg({ parentId: b.dataset.sub })));
          $$('[data-ed]', el).forEach((b) => (b.onclick = () => ptDlg(P.find((p) => p.id === b.dataset.ed))));
          $$('[data-del]', el).forEach((b) => (b.onclick = async () => { if (!(await U.confirmBox('파트너 삭제', '<p>파트너를 삭제하면 소속 회원의 담당 파트너가 비워집니다. 삭제할까요?</p>', '삭제', 'btn-danger'))) return; try { await Store.partnerDelete(b.dataset.del); draw(); } catch (e) { U.toast(e.message, true); } }));
          $$('[data-cp]', el).forEach((b) => (b.onclick = () => { navigator.clipboard.writeText(b.dataset.cp).then(() => U.toast('가입 링크를 복사했습니다: ' + b.dataset.cp), () => U.toast(b.dataset.cp)); }));
        } else if (tab === 'comm') {
          P = P.length ? P : await Store.partners(); const L = await Store.partnerComm('');
          const K = { sub: 'AI 구독', charge: '충전' };
          el.innerHTML = `<section class="panel"><div class="panel-h"><h3>수수료 적립 내역</h3><div style="display:flex;gap:6px"><select class="input sm" id="pcF"><option value="">전체 파트너</option>${P.map((p) => `<option>${esc(p.name)}</option>`).join('')}</select><button class="btn btn-sm" id="pcCsv">엑셀(CSV)</button></div></div><div id="pcL"></div></section>`;
          const d2 = () => { const f = $('#pcF').value; const R = L.filter((c) => !f || c.partner === f); $('#pcL').innerHTML = `<div class="panel-b" style="padding-bottom:0"><b>합계 ${won(R.reduce((s, c) => s + c.amount, 0))}</b> <span class="dim">· ${R.length}건</span></div>` + tbl(['시각', ['파트너', 'l'], ['회원', 'l'], '구분', '기준 금액', '비율', '수수료'], R.map((c) => `<tr><td class="dim">${U.dt(c.at)}</td><td class="l">${esc(c.partner)}</td><td class="l">${esc(c.user || '-')}</td><td>${K[c.kind] || c.kind}</td><td>${won(c.base)}</td><td>${c.rate}%</td><td class="brand">${won(c.amount)}</td></tr>`)); };
          $('#pcF').onchange = d2; d2();
          $('#pcCsv').onclick = () => csv('파트너_수수료', ['시각', '파트너', '회원', '구분', '기준', '비율', '수수료'], L.map((c) => [U.dt(c.at), c.partner, c.user, K[c.kind] || c.kind, c.base, c.rate, c.amount]));
        } else if (tab === 'wd') {
          const L = await Store.partnerWds();
          el.innerHTML = `<section class="panel">${tbl(['신청일시', ['파트너', 'l'], '금액', ['정산 계좌', 'l'], ['메모', 'l'], '상태', ''], L.map((w) => `<tr><td class="dim">${U.dt(w.at)}</td><td class="l">${esc(w.partner)}</td><td><b>${won(w.amount)}</b></td><td class="l">${esc(w.bank || '-')}</td><td class="l muted">${esc(w.memo || '')}${w.adminMemo ? `<br><small>관리자: ${esc(w.adminMemo)}</small>` : ''}</td><td><span class="tag ${w.status === 'pending' ? 'tag-wait' : w.status === 'approved' ? 'tag-ok' : 'tag-sell'}">${({ pending: '대기', approved: '지급 완료', rejected: '반려' })[w.status]}</span></td><td style="white-space:nowrap">${w.status === 'pending' ? `<button class="btn btn-sm btn-brand" data-ok="${w.id}">지급 완료</button> <button class="btn btn-sm" data-no="${w.id}">반려</button>` : ''}</td></tr>`), '정산 신청이 없습니다')}</section><p class="dim" style="font-size:12px;margin-top:10px">「지급 완료」는 실제 송금을 마친 뒤 누르세요. 파트너 적립 잔액에서 차감됩니다.</p>`;
          const proc = (id, ok) => U.modal({ title: ok ? '정산 지급 완료' : '정산 반려', body: `<div class="field"><label>메모 (파트너에게 표시)</label><input class="input" id="wdM" placeholder="${ok ? '예: 12/1 국민은행 송금' : '반려 사유'}"></div>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="wdOk">확인</button>', onMount: (m, close) => { $('#wdOk', m).onclick = async () => { try { await Store.partnerWdProcess(id, ok, $('#wdM', m).value); close(); U.toast('처리했습니다.'); draw(); C().Poll.tick(); } catch (e) { U.toast(e.message, true); } }; } });
          $$('[data-ok]', el).forEach((b) => (b.onclick = () => proc(b.dataset.ok, true)));
          $$('[data-no]', el).forEach((b) => (b.onclick = () => proc(b.dataset.no, false)));
        } else {
          const L = await Store.partnerInqs();
          el.innerHTML = `<section class="panel">${L.length ? L.map((q) => `<div class="inq"><div class="inq-h"><span class="tag tag-no">${esc(q.partner)}</span><b>${esc(q.title)}</b><span class="tag ${q.status === 'open' ? 'tag-wait' : 'tag-ok'}">${q.status === 'open' ? '답변 대기' : '답변 완료'}</span><span class="dim" style="margin-left:auto;font-size:12px">${U.dt(q.at)}</span></div><p class="muted" style="white-space:pre-wrap">${esc(q.body || '')}</p>${q.answer ? `<div class="inq-a"><b>답변</b><p style="white-space:pre-wrap">${esc(q.answer)}</p></div>` : ''}<button class="btn btn-sm" data-an="${q.id}">${q.answer ? '답변 수정' : '답변하기'}</button></div>`).join('') : '<div class="empty">파트너 문의가 없습니다</div>'}</section>`;
          $$('[data-an]', el).forEach((b) => (b.onclick = () => { const q = L.find((x) => x.id === b.dataset.an); U.modal({ title: '파트너 문의 답변', body: `<p class="muted">${esc(q.title)}</p><select class="input tpl-sel" data-tpl="paA"><option value="">템플릿 선택…</option></select><textarea class="input" id="paA" rows="6">${esc(q.answer || '')}</textarea>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="paOk">답변 등록</button>', onMount: (m, close) => { $('#paOk', m).onclick = async () => { try { await Store.partnerInqAnswer(q.id, $('#paA', m).value); close(); U.toast('답변했습니다.'); draw(); } catch (e) { U.toast(e.message, true); } }; } }); }));
        }
      } catch (e) { err(el, e); }
    }
    function ptDlg(p) {
      const par = P.find((x) => x.id === p.parentId);
      U.modal({ title: p.id ? '파트너 수정' : par ? `${par.name} 하부 파트너 만들기` : '파트너(지사) 만들기', body: `<div class="grid g-2"><div class="field"><label>파트너 이름</label><input class="input" id="pN" value="${esc(p.name || '')}" placeholder="예: 부산지사"></div><div class="field"><label>추천 코드 (영문·숫자)</label><input class="input" id="pC" value="${esc(p.code || '')}" style="text-transform:uppercase" placeholder="예: BUSAN"></div>
        ${p.id ? '' : `<div class="field"><label>포털 아이디</label><input class="input" id="pU" autocomplete="off"></div>`}<div class="field"><label>${p.id ? '새 비밀번호 (바꿀 때만)' : '포털 비밀번호 (6자 이상)'}</label><input class="input" type="password" id="pP" autocomplete="new-password"></div>
        <div class="field"><label>AI 구독 수수료 (%)</label><input class="input" id="pRs" value="${p.rateSub ?? 30}" inputmode="decimal"></div><div class="field"><label>충전 수수료 (%)</label><input class="input" id="pRc" value="${p.rateCharge ?? 5}" inputmode="decimal"></div>
        <div class="field"><label>연락처</label><input class="input" id="pPh" value="${esc(p.phone || '')}"></div>${p.id ? `<div class="field"><label>상태</label><select class="input" id="pSt"><option value="active" ${p.status === 'active' ? 'selected' : ''}>정상</option><option value="suspended" ${p.status !== 'active' ? 'selected' : ''}>정지</option></select></div>` : ''}</div>
        <div class="field"><label>메모</label><input class="input" id="pMm" value="${esc(p.memo || '')}"></div>${par ? `<p class="dim" style="font-size:12px">상위: ${esc(par.name)} (구독 ${par.rateSub}% · 충전 ${par.rateCharge}%) — 하부 비율은 상위보다 낮게 설정하세요.</p>` : ''}`,
        foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="pOk">저장</button>', onMount: (m, close) => { $('#pOk', m).onclick = async () => { const g = (i) => { const e = $('#' + i, m); return e ? e.value : undefined; }; try { await Store.partnerSave({ id: p.id || '', parentId: p.parentId || '', name: g('pN'), code: g('pC'), username: g('pU'), pw: g('pP'), rateSub: +g('pRs'), rateCharge: +g('pRc'), phone: g('pPh'), memo: g('pMm'), status: g('pSt') }); close(); U.toast('저장했습니다.'); draw(); } catch (e) { U.toast(e.message, true); } }; } });
    }
    draw();
    return { data: draw };
  }

  // ═════ 통계 · 분석 ═════
  function Stats(main, sub) {
    let tab = sub || 'daily', days = 30;
    main.innerHTML = `${H('통계 · 분석', '일별 가입·접속·거래·매출과 회원별 이용 현황, 화면별 방문 수를 봅니다.', '<div class="seg" id="stD"><button data-v="7">7일</button><button data-v="30" class="on">30일</button><button data-v="90">90일</button></div>')}${tabs('stT', [['daily', '일별 통계'], ['users', '회원별 통계'], ['pages', '화면 방문']], tab)}<div id="stB"></div>`;
    onTabs('stT', (v) => { tab = v; history.replaceState(null, '', '#/stats/' + v); draw(); });
    $('#stD').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; days = +b.dataset.v; $$('#stD button').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
    async function draw() {
      const el = $('#stB'); el.innerHTML = '<div class="panel"><div class="empty">불러오는 중…</div></div>';
      try {
        if (tab === 'daily') {
          const L = await Store.dailyStats(days); const asc = L.slice().reverse(); const sum = (k) => L.reduce((s, r) => s + (r[k] || 0), 0);
          el.innerHTML = `<div class="grid g-4" style="margin-bottom:16px">${C().stat('가입', n0(sum('signups')) + '명', `${days}일 합계`)}${C().stat('충전', won(sum('deposit')), `출금 ${won(sum('withdraw'))}`)}${C().stat('거래대금', won(sum('volume')), `체결 ${n0(sum('fills'))}건 · 코인 ${n0(sum('cfFills'))}건`)}${C().stat('수수료·세금', won(sum('fee')), `화면 방문 ${n0(sum('pv'))}회`)}</div>
            <div class="grid g-2" style="margin-bottom:16px"><section class="panel"><div class="panel-h"><h3>가입 · 접속 · 거래 회원</h3></div><div class="panel-b"><canvas id="stC1" style="width:100%;height:200px"></canvas></div></section><section class="panel"><div class="panel-h"><h3>충전 · 출금</h3></div><div class="panel-b"><canvas id="stC2" style="width:100%;height:200px"></canvas></div></section></div>
            <section class="panel"><div class="panel-h"><h3>일별 상세</h3><button class="btn btn-sm" id="stCsv">엑셀(CSV)</button></div>${tbl(['일자', '가입', '접속', '거래 회원', '체결', '거래대금', '수수료·세금', '충전', '출금', '코인 체결', '방문'], L.map((r) => `<tr><td>${r.d}</td><td>${n0(r.signups)}</td><td>${n0(r.logins)}</td><td>${n0(r.traders)}</td><td>${n0(r.fills)}</td><td>${won(r.volume)}</td><td>${won(r.fee)}</td><td class="up">${won(r.deposit)}</td><td class="down">${won(r.withdraw)}</td><td>${n0(r.cfFills)}</td><td>${n0(r.pv)}</td></tr>`))}</section>`;
          const lb = asc.map((r) => r.d.slice(5).replace('-', '.'));
          setTimeout(() => { Chart.bars($('#stC1'), { labels: lb, series: [{ values: asc.map((r) => r.signups), color: Chart.css('--brand') }, { values: asc.map((r) => r.logins), color: Chart.css('--down') }, { values: asc.map((r) => r.traders), color: Chart.css('--up') }] }); Chart.bars($('#stC2'), { labels: lb, series: [{ values: asc.map((r) => r.deposit), color: Chart.css('--up') }, { values: asc.map((r) => r.withdraw), color: Chart.css('--down') }] }); }, 30);
          $('#stCsv').onclick = () => csv('일별통계', ['일자', '가입', '접속', '거래회원', '체결', '거래대금', '수수료세금', '충전', '출금', '코인체결', '방문'], L.map((r) => [r.d, r.signups, r.logins, r.traders, r.fills, r.volume, r.fee, r.deposit, r.withdraw, r.cfFills, r.pv]));
        } else if (tab === 'users') {
          const L = await Store.userStats(); let q = '';
          el.innerHTML = `<section class="panel"><div class="panel-h"><div class="search" style="flex:1;max-width:280px">${ICON.search}<input id="usQ" placeholder="닉네임·아이디·파트너 검색" style="width:100%"></div><button class="btn btn-sm" id="usCsv">엑셀(CSV)</button></div><div id="usL"></div></section>`;
          const d2 = () => { const R = L.filter((u) => !q || [u.name, u.username, u.partner].join(' ').toLowerCase().includes(q)); $('#usL').innerHTML = tbl([['회원', 'l'], ['파트너', 'l'], '체결', '거래대금', '실현손익', '수수료·세금', '충전', '코인 체결', '코인 손익', '접속', '최근 접속'], R.slice(0, 500).map((u) => `<tr><td class="l"><button class="link" data-mem="${u.id}">${esc(u.name)}</button> <small class="dim">${esc(u.username)}</small></td><td class="l">${esc(u.partner || '-')}</td><td>${n0(u.fills)}</td><td>${won(u.volume)}</td><td class="${cls(u.realized)}">${won(u.realized)}</td><td>${won(u.fee)}</td><td>${won(u.deposit)}</td><td>${n0(u.cfFills)}</td><td class="${cls(u.cfPnl)}">${fmtUsd(u.cfPnl)}</td><td>${n0(u.logins)}</td><td class="dim">${u.lastSeen ? U.ago(u.lastSeen) : '-'}</td></tr>`)); $$('[data-mem]', $('#usL')).forEach((b) => (b.onclick = () => C().memberDetail(b.dataset.mem))); };
          $('#usQ').oninput = (e) => { q = e.target.value.trim().toLowerCase(); d2(); }; d2();
          $('#usCsv').onclick = () => csv('회원별통계', ['닉네임', '아이디', '파트너', '체결', '거래대금', '실현손익', '수수료세금', '충전', '코인체결', '코인손익', '접속'], L.map((u) => [u.name, u.username, u.partner, u.fills, u.volume, u.realized, u.fee, u.deposit, u.cfFills, u.cfPnl, u.logins]));
        } else {
          const D = await Store.pageStats(days); const NM = { home: '홈', market: '시세·순위', screen: '조건검색', watch: '관심종목', stock: '종목·주문', balance: '잔고', history: '거래내역', cash: '입출금', futures: '코인 선물', staking: '스테이킹', lead: 'MAX 리딩', buff: 'MAX 버프', ai: 'MAX AI', rank: '랭킹', events: '이벤트·대회', guide: '이용 가이드', help: '고객센터', my: '마이페이지', download: '다운로드', menu: '전체 메뉴' };
          const mx = Math.max(1, ...D.pages.map((p) => p.n));
          el.innerHTML = `<div class="grid g-2"><section class="panel"><div class="panel-h"><h3>화면별 방문 (${days}일)</h3></div><div class="panel-b">${D.pages.map((p) => `<div class="pv-r"><span>${esc(NM[p.page] || p.page)}</span><div><i style="width:${(p.n / mx) * 100}%"></i></div><b>${n0(p.n)}</b></div>`).join('') || '<div class="empty">방문 기록이 없습니다</div>'}</div></section><section class="panel"><div class="panel-h"><h3>일별 방문</h3></div><div class="panel-b"><canvas id="pvC" style="width:100%;height:240px"></canvas></div></section></div>`;
          setTimeout(() => Chart.bars($('#pvC'), { labels: D.daily.map((r) => r.d.slice(5).replace('-', '.')), series: [{ values: D.daily.map((r) => r.n), color: Chart.css('--brand') }] }), 30);
        }
      } catch (e) { err(el, e); }
    }
    draw();
    return { data: draw };
  }

  // ═════ 운영 도구 ═════
  function Ops(main, sub) {
    let tab = sub || 'online';
    main.innerHTML = `${H('운영 도구', '접속 중 회원, 자산 변동 로그, IP·기기 차단, 근무 인수인계, 점검 시간과 알림음을 관리합니다.')}${tabs('opT', [['online', '접속 중'], ['access', '접속 제한·투자성향'], ['reserve', '예약주문'], ['money', '자산 변동 로그'], ['block', 'IP·기기 차단'], ['handover', '인수인계'], ['service', '점검·알림 설정']], tab)}<div id="opB"></div>`;
    onTabs('opT', (v) => { tab = v; history.replaceState(null, '', '#/ops/' + v); draw(); });
    let iv = 0;
    async function draw() {
      clearInterval(iv); const el = $('#opB'); el.innerHTML = '<div class="panel"><div class="empty">불러오는 중…</div></div>';
      try {
        if (tab === 'online') {
          const load = async () => { const L = await Store.online(); if (tab !== 'online') return; el.innerHTML = `<section class="panel"><div class="panel-h"><h3>지금 접속 중 ${L.length}명</h3><span class="dim" style="font-size:12px">최근 2분 안에 활동한 회원 · 15초마다 갱신</span></div>${tbl([['닉네임', 'l'], ['아이디', 'l'], '마지막 활동', ''], L.map((u) => `<tr><td class="l"><span class="on-dot"></span>${esc(u.name)}</td><td class="l">${esc(u.username)}</td><td class="dim">${U.ago(u.lastSeen)}</td><td><button class="btn btn-sm" data-mem="${u.id}">상세</button></td></tr>`), '접속 중인 회원이 없습니다')}</section>`; $$('[data-mem]', el).forEach((b) => (b.onclick = () => C().memberDetail(b.dataset.mem))); };
          await load(); iv = setInterval(() => load().catch(() => {}), 15000);
        } else if (tab === 'access') {
          const [L, st] = await Promise.all([Store.riskList(), Store.settings()]); const now = new Date();
          const lim = L.filter((u) => (u.suspendUntil && new Date(u.suspendUntil) > now) || u.accessHours);
          const dist = Risk.TYPES.map((t) => [t[1], t[3], L.filter((u) => u.risk && u.risk.type === t[1]).length]); const none = L.filter((u) => !u.risk).length; const mx = Math.max(1, ...dist.map((d) => d[2]), none);
          el.innerHTML = `<section class="panel" style="margin-bottom:16px"><div class="panel-b" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><label class="check" style="margin:0"><input type="checkbox" id="ssOn" ${st.singleSession ? 'checked' : ''}> 중복 접속 차단 — 한 계정은 한 기기에서만 (새로 로그인하면 이전 기기는 자동 로그아웃)</label><button class="btn btn-sm btn-brand" id="ssSave">저장</button></div></section>
            <div class="grid g-2" style="margin-bottom:16px"><section class="panel"><div class="panel-h"><h3>접속 제한 중인 회원 ${lim.length}명</h3></div>${tbl([['회원', 'l'], '정지 종료', '접속 허용 시간', ''], lim.map((u) => `<tr><td class="l">${esc(u.name)} <small class="dim">${esc(u.username)}</small></td><td>${u.suspendUntil && new Date(u.suspendUntil) > now ? `<span class="tag tag-sell">${U.dt(u.suspendUntil)}</span>` : '-'}</td><td>${esc(u.accessHours || '-')}</td><td><button class="btn btn-sm" data-ac="${u.id}">변경</button></td></tr>`), '접속 제한 중인 회원이 없습니다')}</section>
            <section class="panel"><div class="panel-h"><h3>회원 투자성향 분포</h3><span class="dim" style="font-size:12px">진단 ${L.length - none}명 / 전체 ${L.length}명</span></div><div class="panel-b">${dist.map(([n, c, v]) => `<div class="pv-r"><span>${n}</span><div><i style="width:${(v / mx) * 100}%;background:${c}"></i></div><b>${n0(v)}명</b></div>`).join('')}<div class="pv-r"><span class="dim">미진단</span><div><i style="width:${(none / mx) * 100}%;background:var(--text-3)"></i></div><b>${n0(none)}명</b></div></div></section></div>
            <section class="panel"><div class="panel-h"><h3>회원별 투자성향</h3></div>${tbl([['회원', 'l'], '진단 유형', '점수', '진단일', ''], L.filter((u) => u.risk).sort((a, b) => b.risk.score - a.risk.score).map((u) => `<tr><td class="l"><button class="link" data-mem="${u.id}">${esc(u.name)}</button> <small class="dim">${esc(u.username)}</small></td><td><span class="tag" style="color:${(Risk.typeOf(u.risk.score) || [])[3]}">${esc(u.risk.type)}</span></td><td>${u.risk.score}</td><td class="dim">${U.date(u.risk.at)}</td><td><button class="btn btn-sm" data-ac="${u.id}">접속 제한</button></td></tr>`), '투자성향을 진단한 회원이 없습니다')}</section>`;
          $('#ssSave').onclick = async () => { try { await Store.saveSettings({ singleSession: $('#ssOn').checked }); U.toast('저장했습니다.'); } catch (e) { U.toast(e.message, true); } };
          $$('[data-ac]', el).forEach((b) => (b.onclick = () => { const u = L.find((x) => x.id === b.dataset.ac); accessDlg({ id: u.id, name: u.name, status: 'active' }).then(() => {}); }));
          $$('[data-mem]', el).forEach((b) => (b.onclick = () => C().memberDetail(b.dataset.mem)));
        } else if (tab === 'reserve') {
          const L = await Store.adminReserves(); const ST = { pending: ['대기', 'tag-wait'], done: ['실행', 'tag-ok'], failed: ['실패', 'tag-sell'], cancelled: ['취소', 'tag-no'] };
          el.innerHTML = `<section class="panel"><div class="panel-h"><h3>예약주문 (최근 300건)</h3><span class="dim" style="font-size:12px">다음 정규장 시작 때 매분 자동 실행</span></div>${tbl(['등록', ['회원', 'l'], ['종목', 'l'], '구분', '가격', '수량', '실행 예정', '상태', ['결과', 'l']], L.map((r) => `<tr><td class="dim">${U.dt(r.at)}</td><td class="l">${esc(r.user)}</td><td class="l">${esc(r.name)}</td><td><span class="tag ${r.side === 'buy' ? 'tag-buy' : 'tag-sell'}">${r.side === 'buy' ? '매수' : '매도'}</span></td><td>${r.type === 'market' ? '시장가' : n0(r.price)}</td><td>${n0(r.qty)}</td><td class="dim">${U.dt(r.runAfter)}</td><td><span class="tag ${(ST[r.status] || ST.pending)[1]}">${(ST[r.status] || ST.pending)[0]}</span></td><td class="l muted">${esc(r.result || '')}</td></tr>`), '예약주문이 없습니다')}</section>`;
        } else if (tab === 'money') {
          const L = await Store.moneyLog('', 1000); let q = '';
          el.innerHTML = `<section class="panel"><div class="panel-h"><div class="search" style="flex:1;max-width:280px">${ICON.search}<input id="mlQ" placeholder="회원·구분 검색" style="width:100%"></div><button class="btn btn-sm" id="mlCsv">엑셀(CSV)</button></div><div id="mlL"></div></section>`;
          const d2 = () => { const R = L.filter((x) => !q || [x.name, x.username, ctxL(x.ctx)].join(' ').toLowerCase().includes(q)); $('#mlL').innerHTML = tbl(['시각', ['회원', 'l'], ['구분', 'l'], '자산', '변동', '변동 후'], R.slice(0, 600).map((x) => `<tr><td class="dim">${U.dt(x.at)}</td><td class="l"><button class="link" data-mem="${x.userId}">${esc(x.name || '(삭제됨)')}</button></td><td class="l">${esc(ctxL(x.ctx))}</td><td>${x.asset === 'USDT' ? 'USDT' : '원화'}</td><td class="${cls(x.delta)}">${x.delta > 0 ? '+' : ''}${x.asset === 'USDT' ? x.delta.toFixed(4) : n0(x.delta)}</td><td>${x.asset === 'USDT' ? x.balance.toFixed(4) : won(x.balance)}</td></tr>`), '기록이 없습니다'); $$('[data-mem]', $('#mlL')).forEach((b) => (b.onclick = () => C().memberDetail(b.dataset.mem))); };
          $('#mlQ').oninput = (e) => { q = e.target.value.trim().toLowerCase(); d2(); }; d2();
          $('#mlCsv').onclick = () => csv('자산변동로그', ['시각', '회원', '아이디', '구분', '자산', '변동', '잔액'], L.map((x) => [U.dt(x.at), x.name, x.username, ctxL(x.ctx), x.asset, x.delta, x.balance]));
        } else if (tab === 'block') {
          const L = await Store.blocks();
          el.innerHTML = `<section class="panel" style="margin-bottom:16px"><div class="panel-b"><div class="grid g-4" style="align-items:end"><div class="field"><label>구분</label><select class="input" id="bkK"><option value="ip">IP 주소</option><option value="device">기기 ID</option></select></div><div class="field"><label>값</label><input class="input" id="bkV" placeholder="예: 211.234.10.5"></div><div class="field"><label>사유</label><input class="input" id="bkM" placeholder="예: 다중 계정"></div><button class="btn btn-danger" id="bkAdd" style="margin-bottom:12px">차단 추가</button></div><p class="dim" style="font-size:12px">차단된 IP·기기에서는 가입·로그인이 막히고, 접속 중이면 바로 로그아웃됩니다. 관리자 계정은 제외됩니다.</p></div></section>
            <section class="panel">${tbl(['구분', ['값', 'l'], ['사유', 'l'], '차단자', '일시', ''], L.map((b) => `<tr><td><span class="tag tag-sell">${b.kind === 'ip' ? 'IP' : '기기'}</span></td><td class="l"><code>${esc(b.value)}</code></td><td class="l muted">${esc(b.memo || '')}</td><td>${esc(b.by || '')}</td><td class="dim">${U.dt(b.at)}</td><td><button class="btn btn-sm" data-un="${b.id}">해제</button></td></tr>`), '차단 목록이 없습니다')}</section>`;
          $('#bkAdd').onclick = async () => { try { await Store.blockSave($('#bkK').value, $('#bkV').value.trim(), $('#bkM').value); U.toast('차단했습니다.'); draw(); } catch (e) { U.toast(e.message, true); } };
          $$('[data-un]', el).forEach((b) => (b.onclick = async () => { await Store.blockDelete(b.dataset.un); U.toast('해제했습니다.'); draw(); }));
        } else if (tab === 'handover') {
          const L = await Store.handover();
          el.innerHTML = `<section class="panel" style="margin-bottom:16px"><div class="panel-b"><div class="field"><label>인수인계 메모 (다음 근무자에게)</label><textarea class="input" id="hoB" rows="3" placeholder="예: 김OO 회원 출금 건 은행 확인 중, 오후 3시 재확인"></textarea></div><button class="btn btn-brand" id="hoAdd">등록</button></div></section>
            <section class="panel">${L.length ? L.map((h) => `<div class="ho ${h.done ? 'done' : ''}"><label class="check"><input type="checkbox" data-dn="${h.id}" ${h.done ? 'checked' : ''}></label><div style="flex:1;min-width:0"><p style="white-space:pre-wrap;margin:0">${esc(h.body)}</p><small class="dim">${esc(h.by)} · ${U.dt(h.at)}${h.done ? ` · 처리 ${esc(h.doneBy || '')}` : ''}</small></div></div>`).join('') : '<div class="empty">인수인계 메모가 없습니다</div>'}</section>`;
          $('#hoAdd').onclick = async () => { try { await Store.handoverSave($('#hoB').value); U.toast('등록했습니다.'); draw(); C().Poll.tick(); } catch (e) { U.toast(e.message, true); } };
          $$('[data-dn]', el).forEach((c) => (c.onchange = async () => { await Store.handoverDone(c.dataset.dn); draw(); C().Poll.tick(); }));
        } else {
          const st = await Store.settings(); const sb = st.serviceBlock || {};
          const KINDS = [['cash', '입출금 신청'], ['inq', '1:1 문의'], ['subs', 'AI 구독 신청'], ['buffs', 'MAX 버프 신청'], ['members', '신규 가입'], ['partner', '파트너 정산'], ['danger', '담보 위험·청산']];
          const TN = [['', '기본'], ['ding', '띵동'], ['chime', '차임'], ['bell', '벨'], ['beep', '삐삐'], ['low', '낮은 음'], ['alarm', '경보'], ['off', '끔'], ['custom', '직접 올린 소리']];
          const P = C().Poll; const rep = (() => { try { return localStorage.getItem('mls.adm.rep') || '0'; } catch { return '0'; } })();
          el.innerHTML = `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>점검 시간 (이용자 주문·충전 차단)</h3></div><div class="panel-b"><label class="check"><input type="checkbox" id="sbE" ${sb.enabled ? 'checked' : ''}> 매일 아래 시간에 점검 모드 켜기</label><div class="grid g-3" style="margin-top:10px"><div class="field"><label>시작 (KST)</label><input class="input" type="time" id="sbS" value="${esc(sb.start || '04:00')}"></div><div class="field"><label>종료 (KST)</label><input class="input" type="time" id="sbN" value="${esc(sb.end || '05:00')}"></div><div class="field"><label>안내 문구</label><input class="input" id="sbM" value="${esc(sb.message || '')}" placeholder="서버 점검 중입니다."></div></div><p class="dim" style="font-size:12px">점검 시간에는 이용자 화면 상단에 안내가 뜨고 주식·코인 주문, 충전·출금 신청, 스테이킹, 버프 신청이 막힙니다. 조회는 그대로 됩니다.</p><button class="btn btn-brand" id="sbSave">저장</button></div></section>
            <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h3>화면 보호 (웹)</h3></div><div class="panel-b"><label class="check"><input type="checkbox" id="gdB" ${(st.guard || {}).blur !== false ? 'checked' : ''}> 다른 창으로 전환하거나 캡처 도구를 열면 화면 흐리게</label><label class="check"><input type="checkbox" id="gdM" ${(st.guard || {}).mark !== false ? 'checked' : ''}> 화면에 접속자 워터마크 (닉네임·시각) 표시</label><p class="dim" style="font-size:12px">우클릭·복사·드래그·인쇄·소스 보기·개발자 도구 단축키는 항상 막힙니다. PC 프로그램은 운영체제 수준에서 캡처·녹화가 차단됩니다 (캡처하면 검은 화면).</p><button class="btn btn-brand" id="gdSave">저장</button></div></section>
            <section class="panel"><div class="panel-h"><h3>관리자 알림음 (이 브라우저)</h3></div><div class="panel-b"><div class="tone-grid">${KINDS.map(([k, n]) => { const cur = P.tone(k); const sel = cur.startsWith('data:') ? 'custom' : cur; return `<div class="tone-r"><b>${n}</b><select class="input sm" data-tn="${k}">${TN.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn btn-sm" data-pl="${k}">듣기</button><input type="file" accept="audio/*" data-up="${k}" hidden></div>`; }).join('')}</div>
              <div class="field" style="margin-top:14px;max-width:340px"><label>미처리 건 반복 알림</label><select class="input" id="tnRep">${[['0', '끔'], ['1', '1분마다'], ['3', '3분마다'], ['5', '5분마다'], ['10', '10분마다']].map(([v, l]) => `<option value="${v}" ${v === rep ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
              <label class="check"><input type="checkbox" id="tnVoice" ${(() => { try { return localStorage.getItem('mls.adm.voice') !== '0'; } catch { return true; } })() ? 'checked' : ''}> 음성 안내 함께 듣기</label><p class="dim" style="font-size:12px;margin-top:8px">「직접 올린 소리」를 고르면 파일을 선택할 수 있습니다 (1MB 이하 mp3·wav). 설정은 이 브라우저에 저장됩니다.</p></div></section>`;
          $('#sbSave').onclick = async () => { try { await Store.saveSettings({ serviceBlock: { enabled: $('#sbE').checked, start: $('#sbS').value, end: $('#sbN').value, message: $('#sbM').value } }); U.toast('점검 설정을 저장했습니다.'); } catch (e) { U.toast(e.message, true); } };
          $('#gdSave').onclick = async () => { try { await Store.saveSettings({ guard: { blur: $('#gdB').checked, mark: $('#gdM').checked } }); U.toast('화면 보호 설정을 저장했습니다.'); } catch (e) { U.toast(e.message, true); } };
          const set = (k, v) => { try { v ? localStorage.setItem('mls.adm.tone.' + k, v) : localStorage.removeItem('mls.adm.tone.' + k); } catch (e) { U.toast('저장 공간이 부족합니다. 더 작은 파일을 올려 주세요.', true); } };
          $$('[data-tn]', el).forEach((s) => (s.onchange = () => { const k = s.dataset.tn; if (s.value === 'custom') return $(`[data-up="${k}"]`, el).click(); set(k, s.value); P.ding(k); }));
          $$('[data-up]', el).forEach((f) => (f.onchange = () => { const file = f.files[0]; if (!file) return; if (file.size > 1048576) return U.toast('1MB 이하 파일만 올릴 수 있습니다.', true); const r = new FileReader(); r.onload = () => { set(f.dataset.up, r.result); U.toast('알림음을 저장했습니다.'); P.ding(f.dataset.up); }; r.readAsDataURL(file); }));
          $$('[data-pl]', el).forEach((b) => (b.onclick = () => { P.ctx(); P.ding(b.dataset.pl); }));
          $('#tnRep').onchange = (e) => { try { localStorage.setItem('mls.adm.rep', e.target.value); } catch {} U.toast(e.target.value === '0' ? '반복 알림을 껐습니다.' : `미처리 건이 있으면 ${e.target.value}분마다 다시 알립니다.`); };
          $('#tnVoice').onchange = (e) => { try { localStorage.setItem('mls.adm.voice', e.target.checked ? '1' : '0'); } catch {} };
        }
      } catch (e) { err(el, e); }
    }
    draw();
    return { data: () => { if (tab !== 'online') draw(); }, destroy: () => clearInterval(iv) };
  }

  // ═════ 팝업 · FAQ · 약관 · 템플릿 · 필수 동의 ═════
  function Content(main, sub) {
    let tab = sub || 'popup';
    main.innerHTML = `${H('팝업 · FAQ · 약관', '이용자 화면의 팝업 공지, 자주 묻는 질문, 약관, 답변 템플릿, 필수 동의 공지를 편집합니다.')}${tabs('ctT', [['popup', '팝업'], ['faq', 'FAQ'], ['terms', '약관'], ['tpl', '답변 템플릿'], ['consent', '필수 동의 공지']], tab)}<div id="ctB"></div>`;
    onTabs('ctT', (v) => { tab = v; history.replaceState(null, '', '#/content/' + v); draw(); });
    async function draw() {
      const el = $('#ctB'); el.innerHTML = '<div class="panel"><div class="empty">불러오는 중…</div></div>';
      try {
        if (tab === 'popup') {
          let L = await Store.popupSave({ id: '__list__', title: '', active: false }).catch(() => null);
          // 목록 조회 전용 API가 없어 임시 저장 후 바로 삭제해 전체 목록을 받습니다
          L = await Store.popupDelete('__list__');
          el.innerHTML = `<section class="panel"><div class="panel-h"><h3>팝업 ${L.length}개</h3><button class="btn btn-sm btn-brand" id="ppNew">팝업 만들기</button></div>${tbl([['제목', 'l'], '기간', '노출', '순서', ''], L.map((p) => `<tr><td class="l"><b>${esc(p.title)}</b><br><small class="dim">${esc((p.body || '').slice(0, 60))}</small></td><td class="dim">${p.startsAt ? U.date(p.startsAt) : '즉시'} ~ ${p.endsAt ? U.date(p.endsAt) : '계속'}</td><td><span class="tag ${p.active ? 'tag-ok' : 'tag-no'}">${p.active ? '노출' : '숨김'}</span></td><td>${p.sort}</td><td style="white-space:nowrap"><button class="btn btn-sm" data-ed="${p.id}">수정</button> <button class="btn btn-sm btn-ghost" data-del="${p.id}">삭제</button></td></tr>`), '만든 팝업이 없습니다')}</section><p class="dim" style="font-size:12px;margin-top:10px">이용자가 로그인하면 노출 중인 팝업이 순서대로 뜨고, 「오늘 하루 보지 않기」를 누르면 그날은 다시 뜨지 않습니다.</p>`;
          const dlg = (p) => U.modal({ title: p.id ? '팝업 수정' : '팝업 만들기', body: `<div class="field"><label>제목</label><input class="input" id="pT" value="${esc(p.title || '')}"></div><div class="field"><label>내용</label><textarea class="input" id="pB" rows="5">${esc(p.body || '')}</textarea></div><div class="field"><label>이미지 주소 (선택)</label><input class="input" id="pI" value="${esc(p.image || '')}" placeholder="https://..."></div><div class="field"><label>버튼 링크 (선택)</label><input class="input" id="pL" value="${esc(p.link || '')}" placeholder="#/events 또는 https://..."></div><div class="grid g-2"><div class="field"><label>시작</label><input class="input" type="datetime-local" id="pS" value="${localDT(p.startsAt)}"></div><div class="field"><label>종료</label><input class="input" type="datetime-local" id="pE" value="${localDT(p.endsAt)}"></div><div class="field"><label>순서</label><input class="input" id="pO" value="${p.sort || 0}" inputmode="numeric"></div><label class="check" style="align-self:end;margin-bottom:12px"><input type="checkbox" id="pA" ${p.active !== false ? 'checked' : ''}> 노출</label></div>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="pOk">저장</button>', onMount: (m, close) => { $('#pOk', m).onclick = async () => { try { await Store.popupSave({ id: p.id || '', title: $('#pT', m).value, body: $('#pB', m).value, image: $('#pI', m).value, link: $('#pL', m).value, startsAt: isoOf($('#pS', m).value), endsAt: isoOf($('#pE', m).value), sort: +$('#pO', m).value || 0, active: $('#pA', m).checked }); close(); U.toast('저장했습니다.'); draw(); } catch (e) { U.toast(e.message, true); } }; } });
          $('#ppNew').onclick = () => dlg({});
          $$('[data-ed]', el).forEach((b) => (b.onclick = () => dlg(L.find((p) => p.id === b.dataset.ed))));
          $$('[data-del]', el).forEach((b) => (b.onclick = async () => { await Store.popupDelete(b.dataset.del); draw(); }));
        } else if (tab === 'faq' || tab === 'terms') {
          const d = await Store.publicInfo();
          if (tab === 'faq') {
            const L = d.faqs.map((f) => ({ ...f }));
            const row = (f) => `<div class="faq-ed"><div class="grid" style="grid-template-columns:120px minmax(0,1fr) auto;gap:8px"><input class="input sm" data-k="cat" value="${esc(f.cat || '일반')}" placeholder="분류"><input class="input sm" data-k="q" value="${esc(f.q || '')}" placeholder="질문"><button class="btn btn-sm btn-ghost" data-rm>삭제</button></div><textarea class="input" data-k="a" rows="2" placeholder="답변" style="margin-top:6px">${esc(f.a || '')}</textarea></div>`;
            el.innerHTML = `<section class="panel"><div class="panel-h"><h3>자주 묻는 질문 ${L.length}개</h3><div style="display:flex;gap:6px"><button class="btn btn-sm" id="fqAdd">질문 추가</button><button class="btn btn-sm btn-brand" id="fqSave">저장</button></div></div><div class="panel-b" id="fqL">${L.map(row).join('')}</div></section>`;
            $('#fqAdd').onclick = () => $('#fqL').insertAdjacentHTML('beforeend', row({}));
            $('#fqL').onclick = (e) => { if (e.target.closest('[data-rm]')) e.target.closest('.faq-ed').remove(); };
            $('#fqSave').onclick = async () => { const faqs = $$('#fqL .faq-ed').map((r) => { const o = {}; $$('[data-k]', r).forEach((i) => (o[i.dataset.k] = i.value)); return o; }).filter((f) => f.q.trim()); try { await Store.faqSave(faqs); U.toast(`FAQ ${faqs.length}개를 저장했습니다.`); } catch (e) { U.toast(e.message, true); } };
          } else {
            const K = [['terms', '이용약관'], ['privacy', '개인정보 처리방침'], ['risk', '거래 위험 안내']]; let k = 'terms';
            el.innerHTML = `<section class="panel"><div class="panel-b"><div class="seg" id="tmK" style="margin-bottom:12px">${K.map(([v, n]) => `<button data-v="${v}" class="${v === k ? 'on' : ''}">${n}</button>`).join('')}</div><div class="field"><label>제목</label><input class="input" id="tmT"></div><div class="field"><label>본문</label><textarea class="input" id="tmB" rows="16"></textarea></div><button class="btn btn-brand" id="tmSave">저장</button> <span class="dim" id="tmU" style="font-size:12px;margin-left:8px"></span></div></section>`;
            const fill = () => { const t = d.terms[k] || {}; $('#tmT').value = t.title || K.find((x) => x[0] === k)[1]; $('#tmB').value = t.body || ''; $('#tmU').textContent = t.updatedAt ? '최종 수정 ' + U.dt(t.updatedAt) : '아직 저장 전 (이용자에게는 기본 문구가 보입니다)'; };
            $('#tmK').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; k = b.dataset.v; $$('#tmK button').forEach((x) => x.classList.toggle('on', x === b)); fill(); };
            $('#tmSave').onclick = async () => { try { await Store.termsSave(k, $('#tmT').value, $('#tmB').value); d.terms[k] = { title: $('#tmT').value, body: $('#tmB').value, updatedAt: new Date().toISOString() }; fill(); U.toast('저장했습니다.'); } catch (e) { U.toast(e.message, true); } };
            fill();
          }
        } else if (tab === 'tpl') {
          const L = await Store.templates(); TPL = L;
          const row = (t) => `<div class="faq-ed"><div class="grid" style="grid-template-columns:minmax(0,1fr) 130px auto;gap:8px"><input class="input sm" data-k="title" value="${esc(t.title || '')}" placeholder="템플릿 이름"><select class="input sm" data-k="kind"><option value="answer" ${t.kind !== 'message' ? 'selected' : ''}>문의 답변</option><option value="message" ${t.kind === 'message' ? 'selected' : ''}>쪽지</option></select><button class="btn btn-sm btn-ghost" data-rm>삭제</button></div><textarea class="input" data-k="body" rows="3" placeholder="내용 · {닉네임} 을 쓰면 받는 사람 이름으로 바뀝니다" style="margin-top:6px">${esc(t.body || '')}</textarea></div>`;
          el.innerHTML = `<section class="panel"><div class="panel-h"><h3>답변·쪽지 템플릿</h3><div style="display:flex;gap:6px"><button class="btn btn-sm" id="tpAdd">추가</button><button class="btn btn-sm btn-brand" id="tpSave">저장</button></div></div><div class="panel-b" id="tpL">${(L.length ? L : [{ title: '입금 확인 완료', body: '안녕하세요 {닉네임}님, 신청하신 충전이 확인되어 예수금에 반영되었습니다. 감사합니다.' }, { title: '추가 확인 필요', body: '안녕하세요 {닉네임}님, 확인을 위해 신청 시각과 금액을 다시 알려주시면 빠르게 처리하겠습니다.' }]).map(row).join('')}</div></section>`;
          $('#tpAdd').onclick = () => $('#tpL').insertAdjacentHTML('beforeend', row({}));
          $('#tpL').onclick = (e) => { if (e.target.closest('[data-rm]')) e.target.closest('.faq-ed').remove(); };
          $('#tpSave').onclick = async () => { const items = $$('#tpL .faq-ed').map((r) => { const o = {}; $$('[data-k]', r).forEach((i) => (o[i.dataset.k] = i.value)); return o; }).filter((t) => t.title.trim()); try { await Store.templateSave(items); TPL = null; U.toast(`템플릿 ${items.length}개를 저장했습니다.`); } catch (e) { U.toast(e.message, true); } };
        } else {
          const L = await Store.noticeConsents();
          el.innerHTML = `<section class="panel">${tbl([['공지', 'l'], '작성일', '필수 동의', '동의 현황', ''], L.map((n) => `<tr><td class="l">${esc(n.title)}</td><td class="dim">${U.date(n.at)}</td><td><label class="sw"><input type="checkbox" data-nc="${n.id}" ${n.needConsent ? 'checked' : ''}><span></span></label></td><td>${n.needConsent ? `${n0(n.agreed)} / ${n0(n.total)}명 (${n.total ? Math.round((n.agreed / n.total) * 100) : 0}%)` : '-'}</td><td></td></tr>`), '공지가 없습니다. MAX 리딩·공지 메뉴에서 공지를 먼저 작성하세요.')}</section><p class="dim" style="font-size:12px;margin-top:10px">필수 동의를 켠 공지는 이용자가 접속할 때 동의하기 전까지 닫을 수 없는 창으로 뜹니다. 약관 변경·중요 정책 안내에 쓰세요.</p>`;
          $$('[data-nc]', el).forEach((c) => (c.onchange = async () => { try { await Store.setNoticeConsent(c.dataset.nc, c.checked); U.toast(c.checked ? '필수 동의 공지로 지정했습니다.' : '필수 동의를 해제했습니다.'); draw(); } catch (e) { U.toast(e.message, true); } }));
        }
      } catch (e) { err(el, e); }
    }
    draw();
    return { data: () => {} };
  }

  // ───── 회원 상세 확장 · 템플릿 · 파트너 지정 · 차단 ─────
  let TPL = null;
  async function tplFill(sel) {
    try { if (!TPL) TPL = await Store.templates(); } catch { TPL = []; }
    const kind = sel.dataset.tpl === 'smB' ? 'message' : 'answer';
    const L = TPL.filter((t) => (t.kind || 'answer') === kind || kind === 'answer');
    if (!L.length) { sel.innerHTML = '<option value="">저장된 템플릿 없음 (팝업·FAQ·약관 → 답변 템플릿)</option>'; return; }
    sel.insertAdjacentHTML('beforeend', L.map((t, i) => `<option value="${i}">${esc(t.title)}</option>`).join(''));
    sel.onchange = () => { const t = L[+sel.value]; if (!t) return; const ta = document.getElementById(sel.dataset.tpl); if (!ta) return; const mh = (document.querySelector('.modal-h h3') || {}).textContent || ''; const nm = (mh.match(/^(.+?) \(/) || [])[1] || (document.querySelector('.modal-b .inq b') ? '' : ''); ta.value = t.body.replace(/\{닉네임\}/g, nm || '회원'); ta.focus(); };
  }
  async function memberTab(tab, uid, el, cur) {
    el.innerHTML = '<div class="empty">불러오는 중…</div>';
    try {
      if (tab === 'money') {
        const L = await Store.moneyLog(uid, 500); if (cur() !== tab) return;
        el.innerHTML = tbl(['시각', ['구분', 'l'], '자산', '변동', '변동 후'], L.map((x) => `<tr><td class="dim">${U.dt(x.at)}</td><td class="l">${esc(ctxL(x.ctx))}</td><td>${x.asset === 'USDT' ? 'USDT' : '원화'}</td><td class="${cls(x.delta)}">${x.delta > 0 ? '+' : ''}${x.asset === 'USDT' ? x.delta.toFixed(4) : n0(x.delta)}</td><td>${x.asset === 'USDT' ? x.balance.toFixed(4) : won(x.balance)}</td></tr>`), '자산 변동 기록이 없습니다');
      } else {
        const D = await Store.cfAdmin(); if (cur() !== tab) return;
        const P = D.positions.filter((p) => p.userId === uid);
        el.innerHTML = P.length ? tbl([['종목', 'l'], '방향', '수량', '진입가', '현재가', '청산가', '증거금', '손익'], P.map((p) => `<tr><td class="l">${p.sym}USDT</td><td>${p.side === 'long' ? '롱' : '숏'} ${p.lev}x</td><td>${p.qty}</td><td>${cp(p.entry)}</td><td>${cp(p.mark)}</td><td class="warn-t">${cp(p.liq)}</td><td>${fmtUsd(p.margin)}</td><td class="${cls(p.upnl)}">${fmtUsd(p.upnl)}</td></tr>`)) : '<div class="empty">보유 중인 코인 선물 포지션이 없습니다</div>';
      }
    } catch (e) { err(el, e); }
  }
  async function assignDlg(u) {
    let P = []; try { P = await Store.partners(); } catch (e) { return U.toast(e.message, true); }
    U.modal({ title: '담당 파트너 지정', body: `<p class="muted" style="margin-bottom:10px">${esc(u.name)} (${esc(u.username)})</p><select class="input" id="apS"><option value="">파트너 없음</option>${P.map((p) => `<option value="${p.id}" ${p.id === u.partnerId ? 'selected' : ''}>${'　'.repeat(p.level - 1)}${esc(p.name)} (${esc(p.code)})</option>`).join('')}</select><p class="dim" style="font-size:12px;margin-top:8px">지정 이후 이 회원의 충전·AI 구독에서 파트너 수수료가 적립됩니다.</p>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-brand" id="apOk">저장</button>', onMount: (m, close) => { $('#apOk', m).onclick = async () => { try { await Store.assignPartner(u.id, $('#apS', m).value); close(); U.toast('담당 파트너를 지정했습니다.'); } catch (e) { U.toast(e.message, true); } }; } });
  }
  function blockDlg(u, last) {
    U.modal({ title: 'IP · 기기 차단', body: `<p class="muted" style="margin-bottom:10px">${esc(u.name)} (${esc(u.username)}) 회원의 최근 접속 정보로 차단합니다.</p><label class="check"><input type="checkbox" id="bkIp" ${last.ip ? 'checked' : 'disabled'}> IP ${esc(last.ip || '정보 없음')}</label><label class="check"><input type="checkbox" id="bkDv" ${u.device ? 'checked' : 'disabled'}> 기기 ${esc(u.device || '정보 없음 (다음 로그인부터 기록)')}</label><div class="field" style="margin-top:10px"><label>사유</label><input class="input" id="bkR" placeholder="예: 다중 계정"></div><p class="dim" style="font-size:12px">같은 IP를 쓰는 다른 회원도 막힐 수 있습니다. 계정만 막으려면 「정지」를 쓰세요.</p>`, foot: '<button class="btn" data-x>취소</button><button class="btn btn-danger" id="bkOk">차단</button>', onMount: (m, close) => { $('#bkOk', m).onclick = async () => { const r = $('#bkR', m).value || `${u.username} 관련`; try { if ($('#bkIp', m).checked && last.ip) await Store.blockSave('ip', last.ip, r); if ($('#bkDv', m).checked && u.device) await Store.blockSave('device', u.device, r); close(); U.toast('차단했습니다.'); } catch (e) { U.toast(e.message, true); } }; } });
  }


  async function riskTab(uid, bundle, el, cur) {
    el.innerHTML = '<div class="empty">불러오는 중…</div>'; let R = null; try { R = await Store.riskGet(uid); } catch {}
    if (cur() !== 'risk') return; const B = Risk.behavior(bundle);
    el.innerHTML = `<div class="grid g-2" style="padding:12px 20px"><div><h4 style="margin:0 0 10px">투자성향 진단 (설문)</h4>${Risk.surveyHTML(R)}</div><div><h4 style="margin:0 0 10px">실제 매매 성향</h4>${Risk.behaviorHTML(B)}</div></div>`;
  }
  async function accessDlg(u) {
    let A = {}; try { A = await Store.memberAccess(u.id); } catch (e) { return U.toast(e.message, true); }
    const on = A.suspendUntil && new Date(A.suspendUntil) > new Date();
    U.modal({ title: `접속 제한 · ${u.name}`, body: `<dl class="kv" style="margin-bottom:14px"><dt>현재 상태</dt><dd>${on ? `<span class="tag tag-sell">${U.dt(A.suspendUntil)}까지 정지</span>` : u.status === 'suspended' ? '<span class="tag tag-sell">영구 정지</span>' : '<span class="tag tag-ok">정상</span>'}</dd><dt>사유</dt><dd>${esc(A.suspendReason || '-')}</dd><dt>접속 허용 시간</dt><dd>${esc(A.accessHours || '제한 없음')}</dd><dt>로그인 중인 세션</dt><dd>${n0(A.sessions || 0)}개</dd><dt>마지막 활동</dt><dd>${A.lastSeen ? U.ago(A.lastSeen) : '-'}</dd></dl>
      <div class="field"><label>기간 정지</label><div class="pct-row" id="acP" style="grid-template-columns:repeat(5,1fr)"><button data-h="1">1시간</button><button data-h="24">1일</button><button data-h="168">7일</button><button data-h="720">30일</button><button data-h="0">해제</button></div></div>
      <div class="grid g-2"><div class="field"><label>정지 종료 일시</label><input class="input" type="datetime-local" id="acU" value="${on ? localDT(A.suspendUntil) : ''}"></div><div class="field"><label>사유 (회원에게 표시)</label><input class="input" id="acR" value="${esc(A.suspendReason || '')}" placeholder="예: 운영 정책 위반"></div></div>
      <div class="field"><label>접속 허용 시간 (KST, 비우면 제한 없음)</label><input class="input" id="acH" value="${esc(A.accessHours || '')}" placeholder="예: 09:00-18:00"></div>
      <p class="dim" style="font-size:12px">정지하면 즉시 로그아웃되고 종료 일시까지 로그인할 수 없습니다. 접속 허용 시간 밖에는 로그인과 이용이 막힙니다. 영구 정지는 회원 상세의 「정지」 버튼을 쓰세요.</p>`,
      foot: '<button class="btn" id="acK">강제 로그아웃</button><button class="btn" data-x>닫기</button><button class="btn btn-brand" id="acOk">저장</button>',
      onMount: (m, close) => {
        $$('#acP button', m).forEach((b) => (b.onclick = () => { const h = +b.dataset.h; $('#acU', m).value = h ? localDT(new Date(Date.now() + h * 3600000).toISOString()) : ''; }));
        $('#acK', m).onclick = async () => { try { const n = await Store.kickUser(u.id); U.toast(`세션 ${n}개를 로그아웃시켰습니다.`); } catch (e) { U.toast(e.message, true); } };
        $('#acOk', m).onclick = async () => { try { await Store.suspendUser(u.id, isoOf($('#acU', m).value), $('#acR', m).value); await Store.accessHours(u.id, $('#acH', m).value.trim()); close(); U.toast('접속 제한 설정을 저장했습니다.'); } catch (e) { U.toast(e.message, true); } };
      } });
  }
  window.ADM_PAGES = { coin: Coin, events: Events, partners: Partners, stats: Stats, ops: Ops, content: Content };
  window.ADM = { tplFill, memberTab, assignDlg, blockDlg, riskTab, accessDlg };
})();
