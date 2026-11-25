// MAX AI 종목분석 엔진 — 차트(일봉)·지표·수급·재무·뉴스/리포트를 점수화해 분석 리포트를 만듭니다.
// 브라우저(window.AICore)와 Node(시세 수집 스크립트의 추천종목 계산)에서 같이 씁니다.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.AICore = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const sma = (a, n) => a.map((_, i) => (i + 1 >= n ? avg(a.slice(i + 1 - n, i + 1)) : null));
  const ema = (a, n) => { const k = 2 / (n + 1); const o = []; let p = null; a.forEach((x, i) => { p = p == null ? x : x * k + p * (1 - k); o.push(i + 1 >= n ? p : null); }); return o; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function rsi(c, n = 14) { let g = 0, l = 0; const o = Array(c.length).fill(null); for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; if (i <= n) { g += Math.max(d, 0); l += Math.max(-d, 0); if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } else { g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
  function atr(b, n = 14) { const tr = b.map((x, i) => (i ? Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)) : x.h - x.l)); return sma(tr, n); }
  const numK = (s) => { if (s == null) return null; const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

  // 뉴스·리포트 제목 감성 사전 (국내 금융 기사 기준)
  const POS = ['상승', '급등', '최고', '신고가', '호실적', '사상 최대', '최대 실적', '흑자', '상향', '수주', '계약', '돌파', '강세', '반등', '매수', '성장', '확대', '호조', '개선', '수혜', '기대', '승인', '출시', '증가', '목표가 상향', '턴어라운드', '서프라이즈', '배당', '자사주', '순매수', '회복'];
  const NEG = ['하락', '급락', '최저', '붕괴', '부진', '적자', '하향', '손실', '약세', '매도', '감소', '우려', '쇼크', '리스크', '소송', '제재', '흔들', '주저앉', '경고', '악재', '둔화', '축소', '취소', '위기', '목표가 하향', '순매도', '불확실', '조사', '과징금', '이탈'];
  function sentiment(titles) {
    let p = 0, n = 0; const hits = [];
    for (const t of titles) { let tp = 0, tn = 0; for (const w of POS) if (t.includes(w)) tp++; for (const w of NEG) if (t.includes(w)) tn++; p += tp; n += tn; if (tp || tn) hits.push({ t, s: tp - tn }); }
    const tot = p + n; return { score: tot ? (p - n) / tot : 0, pos: p, neg: n, hits: hits.slice(0, 6) };
  }

  function swings(b, look) { const s = b.slice(-look); return { hi: Math.max(...s.map((x) => x.h)), lo: Math.min(...s.map((x) => x.l)) }; }

  /**
   * @param {object} p { bars:[{t,o,h,l,c,v}] 일봉 오름차순, price, name, code, currency, info:{info,deal,reports,news} }
   */
  function analyze(p) {
    const b = (p.bars || []).filter((x) => x && x.c > 0);
    if (b.length < 30) return { ok: false, reason: '분석에 필요한 일봉 데이터가 부족합니다 (최소 30일).' };
    const price = p.price || b[b.length - 1].c; if (b[b.length - 1].c !== price) b[b.length - 1] = { ...b[b.length - 1], c: price, h: Math.max(b[b.length - 1].h, price), l: Math.min(b[b.length - 1].l, price) };
    const c = b.map((x) => x.c), v = b.map((x) => x.v || 0), L = c.length - 1;
    const m5 = sma(c, 5), m20 = sma(c, 20), m60 = sma(c, 60), m120 = sma(c, 120);
    const R = rsi(c), A = atr(b), e12 = ema(c, 12), e26 = ema(c, 26);
    const macd = c.map((_, i) => (e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null)); const sig = ema(macd.map((x) => x ?? 0), 9); const hist = macd.map((x, i) => (x == null ? null : x - sig[i]));
    const bbMid = m20[L], bbSd = Math.sqrt(avg(c.slice(-20).map((x) => (x - bbMid) ** 2))), bbU = bbMid + 2 * bbSd, bbL = bbMid - 2 * bbSd;
    const ret = (n) => (c.length > n ? (c[L] / c[L - n] - 1) * 100 : null);
    const y = swings(b, Math.min(250, b.length)), s20 = swings(b.slice(0, -1), 20), s60 = swings(b, 60);
    const vol5 = avg(v.slice(-5)), vol20 = avg(v.slice(-20)) || 1, volR = vol5 / vol20;
    const atrPct = (A[L] / price) * 100;
    const F = []; const sc = {};

    // 1) 추세 (25)
    let t = 0;
    if (m20[L] && price > m20[L]) t += 6; if (m60[L] && price > m60[L]) t += 6; if (m120[L] && price > m120[L]) t += 4;
    if (m5[L] > m20[L] && m20[L] > (m60[L] || 0) && (m60[L] || 0) > 0) { t += 6; F.push(['+', '이동평균선 정배열 (5 > 20 > 60일) — 상승 추세가 유지되고 있습니다']); }
    else if (m60[L] && m5[L] < m20[L] && m20[L] < m60[L]) F.push(['-', '이동평균선 역배열 (5 < 20 < 60일) — 하락 추세 구간입니다']);
    const slope20 = m20[L - 5] ? (m20[L] / m20[L - 5] - 1) * 100 : 0; if (slope20 > 0.5) t += 3; if (slope20 < -0.5) t -= 2;
    sc.trend = clamp(t, 0, 25);
    const gc = m5[L] > m20[L] && m5[L - 3] <= m20[L - 3], dc = m5[L] < m20[L] && m5[L - 3] >= m20[L - 3];
    if (gc) F.push(['+', '단기 골든크로스 (5일선이 20일선 상향 돌파) 발생']); if (dc) F.push(['-', '단기 데드크로스 (5일선이 20일선 하향 이탈) 발생']);

    // 2) 모멘텀 (20)
    let m = 10; const r = R[L];
    if (r != null) { if (r >= 70) { m -= 3; F.push(['-', `RSI ${r.toFixed(0)} — 과매수 구간, 단기 차익 매물 주의`]); } else if (r <= 30) { m += 3; F.push(['+', `RSI ${r.toFixed(0)} — 과매도 구간, 기술적 반등 가능성`]); } else if (r >= 50) m += 3; else m -= 2; }
    if (hist[L] != null) { if (hist[L] > 0 && hist[L - 1] <= 0) { m += 4; F.push(['+', 'MACD 시그널 상향 돌파 — 매수 신호']); } else if (hist[L] < 0 && hist[L - 1] >= 0) { m -= 4; F.push(['-', 'MACD 시그널 하향 이탈 — 매도 신호']); } else m += hist[L] > 0 ? 2 : -2; }
    const r20 = ret(20); if (r20 != null) m += clamp(r20 / 3, -4, 4);
    sc.momentum = clamp(Math.round(m), 0, 20);

    // 3) 거래량 (10)
    let vv = 5; if (volR > 1.8 && c[L] > c[L - 1]) { vv += 4; F.push(['+', `거래량 급증 (최근 5일 평균이 20일 평균의 ${volR.toFixed(1)}배) 속 상승`]); } else if (volR > 1.8 && c[L] < c[L - 1]) { vv -= 3; F.push(['-', `거래량 급증 속 하락 (20일 평균의 ${volR.toFixed(1)}배) — 매도 압력`]); } else if (volR < 0.6) vv -= 1;
    sc.volume = clamp(vv, 0, 10);

    // 4) 가격 위치 (10) — 52주 범위, 볼린저
    const pos52 = y.hi > y.lo ? (price - y.lo) / (y.hi - y.lo) : 0.5; let pp = 5;
    if (price >= s20.hi && s20.hi > 0) { pp += 3; F.push(['+', `20일 고점(${fmt(s20.hi, p.currency)}) 돌파 — 박스권 상단 돌파`]); }
    if (pos52 > 0.95) { pp += 1; F.push(['+', '52주 신고가 부근 — 강한 상대 강도']); } else if (pos52 < 0.1) F.push(['-', '52주 최저가 부근 — 추세 확인 필요']);
    if (price > bbU) { pp -= 2; F.push(['-', '볼린저밴드 상단 돌파 — 단기 과열']); } else if (price < bbL) { pp += 2; F.push(['+', '볼린저밴드 하단 이탈 — 단기 낙폭 과대']); }
    sc.position = clamp(pp, 0, 10);

    // 5) 수급 (15) — 외국인·기관 순매수 (국내)
    let sd = 7.5; const deal = (p.info && p.info.deal) || [];
    if (deal.length) { const fr = deal.slice(0, 5).reduce((s, d) => s + (d[1] || 0), 0), og = deal.slice(0, 5).reduce((s, d) => s + (d[2] || 0), 0);
      if (fr > 0) sd += 3.5; else sd -= 3; if (og > 0) sd += 3; else sd -= 2.5;
      F.push([fr + og > 0 ? '+' : '-', `최근 5일 외국인 ${fr >= 0 ? '순매수' : '순매도'} ${fmtN(Math.abs(fr))}주 · 기관 ${og >= 0 ? '순매수' : '순매도'} ${fmtN(Math.abs(og))}주`]); }
    sc.supply = clamp(Math.round(sd), 0, 15);

    // 6) 재무·밸류에이션 (10)
    let fv = 5; const I = (p.info && p.info.info) || {}; const per = numK(I.per), cper = numK(I.cnsPer), pbr = numK(I.pbr), dy = numK(I.dividendYieldRatio);
    if (per != null) { if (per > 0 && per < 10) { fv += 2; F.push(['+', `PER ${per}배 — 이익 대비 저평가 구간`]); } else if (per > 40) { fv -= 2; F.push(['-', `PER ${per}배 — 이익 대비 고평가`]); } else if (per < 0) { fv -= 2; F.push(['-', '적자 기업 (PER 음수)']); } }
    if (per && cper && cper < per * 0.85) { fv += 2; F.push(['+', `추정 PER ${cper}배 < 현재 PER ${per}배 — 이익 증가 전망`]); }
    if (pbr != null && pbr > 0 && pbr < 1) { fv += 1; F.push(['+', `PBR ${pbr}배 — 자산가치 대비 저평가`]); }
    if (dy != null && dy >= 3) { fv += 1; F.push(['+', `배당수익률 ${dy}%`]); }
    sc.value = clamp(fv, 0, 10);

    // 7) 뉴스·공시·리포트 (10)
    const titles = [...((p.info && p.info.news) || []).map((x) => x[2]), ...((p.info && p.info.reports) || []).map((x) => x[2])].filter(Boolean);
    const sen = sentiment(titles); let nw = 5 + Math.round(sen.score * 5); if (!titles.length) nw = 5;
    if (titles.length) F.push([sen.score >= 0 ? '+' : '-', `최근 뉴스·리포트 ${titles.length}건 분석 — 긍정 ${sen.pos} · 부정 ${sen.neg}`]);
    sc.news = clamp(nw, 0, 10);

    const score = Math.round(sc.trend + sc.momentum + sc.volume + sc.position + sc.supply + sc.value + sc.news);
    const opinion = score >= 78 ? ['강한 매수 관심', 'up2'] : score >= 63 ? ['매수 관심', 'up'] : score >= 45 ? ['중립', 'flat'] : score >= 32 ? ['관망', 'down'] : ['주의', 'down2'];

    // 지지·저항, 시나리오
    const supports = [m20[L], m60[L], s20.lo, bbL].filter((x) => x && x < price).sort((a, b) => b - a);
    const resists = [s60.hi, s20.hi, bbU, y.hi].filter((x) => x && x > price * 1.003).sort((a, b) => a - b);
    const sup = supports[0] || price * (1 - atrPct / 100 * 2), res = resists[0] || price * (1 + atrPct / 100 * 2);
    const stop = Math.min(sup * 0.97, price - A[L] * 2), target1 = res, target2 = resists[1] || res * (1 + atrPct / 100 * 2);
    const rr = (target1 - price) / Math.max(1e-9, price - stop);

    const tf = (x) => (x == null ? '-' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%');
    const lines = [];
    lines.push(`${p.name || p.code}은(는) 현재 ${fmt(price, p.currency)}으로 최근 20일 ${tf(r20)}, 60일 ${tf(ret(60))} 움직였습니다.`);
    lines.push(sc.trend >= 18 ? '중장기 이동평균선 위에서 거래되며 상승 추세가 살아 있습니다.' : sc.trend <= 8 ? '주요 이동평균선 아래에 있어 추세가 약합니다. 추세 전환 신호(20일선 회복)를 확인하는 것이 좋습니다.' : '이동평균선이 얽혀 방향성을 탐색하는 구간입니다.');
    lines.push(`일평균 변동폭(ATR)은 약 ${atrPct.toFixed(1)}%이며, 1차 지지 ${fmt(sup, p.currency)} · 1차 저항 ${fmt(res, p.currency)} 구간을 주목하세요.`);
    if (deal.length) lines.push(sc.supply >= 10 ? '외국인·기관이 함께 사고 있어 수급이 우호적입니다.' : sc.supply <= 5 ? '외국인·기관의 매도 우위로 수급 부담이 있습니다.' : '외국인·기관 수급은 엇갈리고 있습니다.');
    if (titles.length) lines.push(sen.score > 0.2 ? '최근 뉴스·리포트 흐름은 긍정적입니다.' : sen.score < -0.2 ? '최근 뉴스 흐름에 부정적인 이슈가 많아 변동성에 유의해야 합니다.' : '뉴스 흐름은 중립적입니다.');

    return {
      ok: true, code: p.code, name: p.name, price, currency: p.currency, score, opinion: opinion[0], tone: opinion[1], scores: sc,
      max: { trend: 25, momentum: 20, volume: 10, position: 10, supply: 15, value: 10, news: 10 },
      ind: { rsi: r, macd: macd[L], hist: hist[L], ma5: m5[L], ma20: m20[L], ma60: m60[L], ma120: m120[L], bbU, bbL, atrPct, volR, pos52, r5: ret(5), r20, r60: ret(60), r120: ret(120), hi52: y.hi, lo52: y.lo, per, cper, pbr, dy },
      levels: { support: sup, resist: res, stop, target1, target2, rr },
      factors: F, summary: lines.join(' '), news: sen.hits, at: new Date().toISOString(),
    };
  }
  function tickKR(p) { return p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000; }
  function fmt(x, ccy) { if (x == null || !isFinite(x)) return '-'; if (ccy === 'USD') return '$' + x.toFixed(2); const t = tickKR(x); return (Math.round(x / t) * t).toLocaleString('ko-KR') + '원'; }
  function fmtN(x) { return Math.round(x).toLocaleString('ko-KR'); }
  return { analyze, sentiment, rsi, sma, ema };
});
