// MAX라이프 주식 — 투자성향 진단(설문) + 실제 매매 기록으로 본 매매 성향 분석 (이용자·관리자 공용)
const Risk = (() => {
  const { esc, won, n0, pct, cls } = U;
  // 금융투자협회 표준 투자자정보확인서 항목을 참고한 7문항 (점수 합계 → 100점 환산)
  const Q = [
    { q: '연령대가 어떻게 되시나요?', a: [['19세 이하', 3], ['20~40세', 4], ['41~50세', 3], ['51~60세', 2], ['61세 이상', 1]] },
    { q: '투자하려는 자금을 얼마나 오래 둘 수 있나요?', a: [['6개월 미만', 1], ['6개월~1년', 2], ['1~2년', 3], ['2~3년', 4], ['3년 이상', 5]] },
    { q: '지금까지 투자해 본 상품 중 가장 위험한 것은?', a: [['예금·적금·국공채', 1], ['채권형 펀드·원금보장 상품', 2], ['혼합형 펀드·우량주', 3], ['주식·주식형 펀드', 4], ['선물·옵션·레버리지·코인', 5]] },
    { q: '금융 상품·투자에 대한 지식은 어느 정도인가요?', a: [['거의 모른다', 1], ['예금과 주식의 차이 정도 안다', 2], ['주식·펀드 구조를 이해한다', 3], ['파생상품까지 이해하고 직접 판단한다', 4]] },
    { q: '투자 원금에 손실이 나면 어떻게 하시겠어요?', a: [['원금 손실은 절대 안 된다', 1], ['10% 이내 손실까지 견딘다', 2], ['20% 이내 손실까지 견딘다', 3], ['높은 수익을 위해 큰 손실도 감수한다', 5]] },
    { q: '전체 금융자산 중 이 투자금의 비중은?', a: [['10% 이하', 5], ['10~20%', 4], ['20~30%', 3], ['30~40%', 2], ['40% 초과', 1]] },
    { q: '주된 수입원은 어떻게 되나요?', a: [['현재 일정한 수입이 있고 늘어날 것', 4], ['현재 일정한 수입이 있고 유지될 것', 3], ['수입이 불규칙하다', 2], ['연금 등 고정 수입 외 없음', 1]] },
  ];
  const MAX = Q.reduce((s, x) => s + Math.max(...x.a.map((y) => y[1])), 0), MIN = Q.reduce((s, x) => s + Math.min(...x.a.map((y) => y[1])), 0);
  const TYPES = [
    [20, '안정형', '원금 손실을 원하지 않습니다. 예금 수준의 안정성을 우선합니다.', '#619AFF'],
    [40, '안정추구형', '원금 보존을 중시하되 약간의 변동은 받아들입니다.', '#56C7C7'],
    [60, '위험중립형', '수익과 위험의 균형을 추구합니다. 일정 수준의 손실은 감수합니다.', '#B7E77A'],
    [80, '적극투자형', '높은 수익을 위해 상당한 손실 위험을 감수합니다.', '#F5B94A'],
    [101, '공격투자형', '시장 평균을 크게 웃도는 수익을 노리며 큰 손실도 감수합니다.', '#FF626B'],
  ];
  const typeOf = (score) => TYPES.find((t) => score < t[0]);
  const scoreOf = (answers) => { const raw = answers.reduce((s, ai, i) => s + (Q[i] && Q[i].a[ai] ? Q[i].a[ai][1] : 0), 0); return Math.round(((raw - MIN) / (MAX - MIN)) * 100); };

  // 실제 매매 성향 (체결 기록 기반)
  function behavior(bundle) {
    const fills = (bundle.fills || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (!fills.length) return null;
    const sells = fills.filter((f) => f.side === 'sell'); const wins = sells.filter((f) => (f.pnl || 0) > 0), losses = sells.filter((f) => (f.pnl || 0) < 0);
    const days = Math.max(1, (new Date(fills[fills.length - 1].at) - new Date(fills[0].at)) / 864e5);
    // 보유 기간: 종목별 선입선출
    const lots = {}; const holds = [];
    for (const f of fills) {
      const L = (lots[f.code] = lots[f.code] || []);
      if (f.side === 'buy') L.push({ q: f.qty, t: new Date(f.at) });
      else { let q = f.qty; while (q > 0 && L.length) { const l = L[0]; const take = Math.min(q, l.q); holds.push((new Date(f.at) - l.t) / 864e5); l.q -= take; q -= take; if (!l.q) L.shift(); } }
    }
    const avgHold = holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : null;
    const byCode = {}; for (const f of fills.filter((x) => x.side === 'buy')) byCode[f.name || f.code] = (byCode[f.name || f.code] || 0) + (f.amount || 0);
    const totBuy = Object.values(byCode).reduce((a, b) => a + b, 0) || 1; const top = Object.entries(byCode).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const avgWin = wins.length ? wins.reduce((s, f) => s + f.pnl, 0) / wins.length : 0, avgLoss = losses.length ? losses.reduce((s, f) => s + f.pnl, 0) / losses.length : 0;
    const perDay = fills.length / days; const conc = (top[0] ? top[0][1] / totBuy : 0) * 100;
    const usedBuff = (bundle.buffs || []).some((x) => x.status === 'active' || x.status === 'repaid' || x.status === 'liquidated');
    // 매매 스타일 판정
    const style = avgHold == null ? (perDay >= 3 ? '단타형' : '탐색 중') : avgHold < 1 ? '데이트레이딩형' : avgHold < 7 ? '스윙형' : avgHold < 60 ? '중기 투자형' : '장기 투자형';
    let aggr = 0; aggr += Math.min(30, perDay * 6); aggr += Math.min(25, conc / 4); aggr += usedBuff ? 20 : 0; aggr += avgHold != null && avgHold < 3 ? 15 : 0; aggr += losses.length && Math.abs(avgLoss) > avgWin * 1.5 ? 10 : 0;
    const tips = [];
    if (losses.length >= 3 && Math.abs(avgLoss) > avgWin * 1.5) tips.push('평균 손실이 평균 수익보다 1.5배 이상 큽니다. 손절 기준을 미리 정하고 「자동 익절·손절」을 써 보세요.');
    if (conc > 60) tips.push(`매수 금액의 ${conc.toFixed(0)}%가 한 종목에 몰려 있습니다. 분산을 고려해 보세요.`);
    if (perDay > 8) tips.push('하루 체결이 많습니다. 수수료·세금 부담이 수익을 깎을 수 있습니다.');
    if (sells.length >= 5 && wins.length / sells.length < 0.4) tips.push('매도 중 수익을 낸 비율이 40% 미만입니다. 진입 근거를 기록해 보세요.');
    if (usedBuff) tips.push('MAX 버프(투자금 지원)를 사용한 기록이 있습니다. 담보비율을 수시로 확인하세요.');
    if (!tips.length) tips.push('뚜렷한 위험 신호는 없습니다. 지금의 원칙을 유지하세요.');
    return { n: fills.length, sells: sells.length, winRate: sells.length ? (wins.length / sells.length) * 100 : null, avgWin, avgLoss, perDay, avgHold, conc, top: top.map(([k, v]) => [k, (v / totBuy) * 100]), style, aggr: Math.round(Math.min(100, aggr)), realized: sells.reduce((s, f) => s + (f.pnl || 0), 0), fee: fills.reduce((s, f) => s + (f.fee || 0) + (f.tax || 0), 0), usedBuff, tips };
  }
  function behaviorHTML(B) {
    if (!B) return '<div class="empty">아직 체결 기록이 없어 매매 성향을 분석할 수 없습니다</div>';
    const holdTxt = B.avgHold == null ? '-' : B.avgHold < 1 ? Math.max(1, Math.round(B.avgHold * 24)) + '시간' : B.avgHold.toFixed(1) + '일';
    return `<div class="rk-grid"><div><small>매매 스타일</small><b>${B.style}</b></div><div><small>공격성 지수</small><b>${B.aggr}<em>/100</em></b></div><div><small>평균 보유 기간</small><b>${holdTxt}</b></div><div><small>하루 평균 체결</small><b>${B.perDay.toFixed(1)}건</b></div>
      <div><small>매도 승률</small><b>${B.winRate == null ? '-' : B.winRate.toFixed(0) + '%'}</b></div><div><small>평균 수익 / 평균 손실</small><b><span class="up">${won(Math.round(B.avgWin))}</span> / <span class="down">${won(Math.round(B.avgLoss))}</span></b></div><div><small>실현손익</small><b class="${cls(B.realized)}">${won(Math.round(B.realized))}</b></div><div><small>수수료·세금</small><b>${won(Math.round(B.fee))}</b></div></div>
      ${B.top.length ? `<div class="rk-top"><small>매수 집중 종목</small>${B.top.map(([k, p]) => `<div class="pv-r"><span>${esc(k)}</span><div><i style="width:${p}%"></i></div><b>${p.toFixed(0)}%</b></div>`).join('')}</div>` : ''}
      <ul class="rk-tips">${B.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  }
  function surveyHTML(R) {
    if (!R) return '<div class="empty">아직 투자성향 진단을 하지 않았습니다</div>';
    const t = typeOf(R.score);
    return `<div class="rk-res"><div class="rk-badge" style="--c:${t[3]}">${esc(R.type || t[1])}</div><div><b>${R.score}점</b> <span class="dim">· ${U.date(R.at)} 진단</span><p class="muted">${t[2]}</p></div></div><div class="rk-scale">${TYPES.map((x) => `<span class="${x[1] === (R.type || t[1]) ? 'on' : ''}" style="--c:${x[3]}">${x[1]}</span>`).join('')}</div>`;
  }
  return { Q, TYPES, typeOf, scoreOf, behavior, behaviorHTML, surveyHTML };
})();
