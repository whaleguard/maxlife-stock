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

  // ───────── 자금조달 공시 분석 (전환사채·신주인수권부사채·교환사채·유상증자) ─────────
  const NUM = (s) => { if (s == null) return null; const t = String(s).replace(/[^\d.-]/g, ''); return t && t !== '-' ? parseFloat(t) : null; };
  const YMD = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const KD = (s) => { const m = String(s || '').match(/(\d{4})\s*[년.-]\s*(\d{1,2})\s*[월.-]\s*(\d{1,2})/); return m ? YMD(m[1], m[2], m[3]) : null; };
  const KIND = (t) => (/신주인수권/.test(t) ? 'BW' : /교환사채/.test(t) ? 'EB' : /전환사채|CB/.test(t) ? 'CB' : /전환주식|전환우선|상환전환/.test(t) ? 'CPS' : /유상증자/.test(t) ? '유상증자' : '');
  const KNAME = { CB: '전환사채(CB)', BW: '신주인수권부사채(BW)', EB: '교환사채(EB)', CPS: '전환우선주(CPS)', 유상증자: '유상증자' };
  function parseInvestors(t) {
    const i = t.indexOf('대상자별 사채발행내역'); const j = t.indexOf('제3자배정 대상자'); const k = i >= 0 ? i : j; if (k < 0) return [];
    const end = t.indexOf('【', k + 12); const seg = t.slice(k, end > 0 ? end : k + 2500).split(' | ').map((s) => s.trim());
    const h = seg.findIndex((s, x) => x > 1 && /^비\s*고$/.test(s)); if (h < 0) return [];
    const out = []; let row = [];
    for (let x = h + 1; x < seg.length && out.length < 12; x++) {
      const s = seg[x]; if (/^\(\d\)|^【/.test(s)) break; row.push(s);
      if (/^\d{1,3}(,\d{3}){1,}$/.test(s) && NUM(s) >= 1e5) {
        const ri = row.findIndex((y) => /^(-|본인|최대주주.*|특수관계인.*|계열회사.*|.*관계회사|임원.*|대표이사.*|해당사항\s*없음|최대주주의.*)$/.test(y));
        const name = row.slice(0, ri < 0 ? 1 : ri).join(' ').replace(/\s+/g, ' ').trim(); const rel = ri >= 0 ? row[ri] : '-';
        if (name && !/^\d/.test(name)) out.push({ name, rel: rel === '-' ? '' : rel, amt: NUM(s) });
        row = []; x++; // 비고 칸 건너뜀
      }
    }
    return out;
  }
  function parseDoc(d) {
    const t = d.text || '', title = d.title || '', ex = d.extra || ''; const at = String(d.at || '').slice(0, 10);
    const g = (re) => { const m = t.match(re); return m ? m[1] : null; };
    if (/발행결정/.test(title) && /사채/.test(title)) {
      const per = t.match(/(?:전환청구기간|권리행사기간|교환청구기간)\s*\|\s*시작일\s*\|\s*([^|]+)\|\s*종료일\s*\|\s*([^|]+)/);
      const sh = t.match(/주식수\s*\|\s*([\d,]+)\s*\|\s*주식총수\s*\|?\s*대비\s*\|?\s*비율\s*\(%\)\s*\|\s*([\d.]+)/) || t.match(/주식수\s*\|\s*([\d,]+)\s*\|[^|]*비율[^|]*\|\s*([\d.]+)/);
      const fl = NUM(g(/최저\s*조정가액\s*\(원\)\s*\|\s*([\d,]+)/)); const flp = [...(ex + ' ' + t).matchAll(/(\d{2})\s*%\s*(?:이상|미만으로)/g)].map((m) => +m[1]).find((x) => x >= 50 && x <= 95);
      const outst = []; const ot = t.indexOf('미상환 주권 관련 사채권');
      if (ot > 0) { const re = /(\d{1,3})회차\s*([^|]*?)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d.]+)\s*~\s*([\d.]+)/g; let m; const sub = t.slice(ot, ot + 4000); while ((m = re.exec(sub))) outst.push({ round: +m[1], kind: KIND(m[2]) || 'CB', bal: NUM(m[3]), price: NUM(m[4]), shares: NUM(m[5]), from: KD(m[6]), to: KD(m[7]) }); }
      const total = NUM(g(/기발행주식\s*총수\s*\(주\)\s*(?:\(C\))?\s*\|\s*([\d,]+)/));
      return { type: 'issue', at, id: d.id, title, kind: KIND(title), round: +(g(/회차\s*\|\s*(\d+)/) || 0) || null, face: NUM(g(/권면\(전자등록\)총액\s*\(원\)\s*\|\s*([\d,]+)/)),
        price: NUM(g(/(?:전환|행사|교환)가액\s*\(원\/주\)\s*\|\s*([\d,]+)/)), shares: sh ? NUM(sh[1]) : null, ratio: sh ? NUM(sh[2]) : null,
        from: per ? KD(per[1]) : null, to: per ? KD(per[2]) : null, maturity: KD(g(/사채만기일\s*\|\s*([^|]+)/)), coupon: NUM(g(/표면이자율\s*\(%\)\s*\|\s*([\d.]+)/)), ytm: NUM(g(/만기이자율\s*\(%\)\s*\|\s*([\d.]+)/)),
        method: (g(/사채발행방법\s*\|\s*([^|]+)/) || '').trim(), debt: NUM(g(/채무상환자금\s*\(원\)\s*\|\s*([\d,]+)/)), ops: NUM(g(/운영자금\s*\(원\)\s*\|\s*([\d,]+)/)), mna: NUM(g(/타법인\s*증권\s*취득자금\s*\(원\)\s*\|\s*([\d,]+)/)),
        floor: fl, floorPct: flp ? +flp : null, refixM: +((ex.match(/매\s*(\d{1,2})\s*개월/) || t.match(/매\s*(\d{1,2})\s*개월/) || [])[1] || 0) || null,
        put: /조기상환청구권|Put\s*Option|PUT/i.test(t + ex), call: /매도청구권|Call\s*Option/i.test(t + ex), investors: parseInvestors(t), outst, total };
    }
    if (/유상증자결정/.test(title)) {
      const cs = NUM(g(/신주의 종류와 수\s*\|\s*보통주식\s*\(주\)\s*\|\s*([\d,-]+)/)), os = NUM(g(/기타주식\s*\(주\)\s*\|\s*([\d,-]+)/));
      const p1 = NUM(g(/신주 발행가액\s*\|\s*보통주식\s*\(원\)\s*\|\s*([\d,-]+)/)), p2 = NUM(g(/신주 발행가액\s*\|\s*보통주식\s*\(원\)\s*\|\s*[\d,-]+\s*\|\s*기타주식\s*\(원\)\s*\|\s*([\d,-]+)/));
      const pre = NUM(g(/증자전\s*\|\s*발행주식총수\s*\(주\)\s*\|\s*보통주식\s*\(주\)\s*\|\s*([\d,]+)/));
      const per = t.match(/전환청구기간\s*\|\s*시작일\s*\|\s*([^|]+)\|\s*종료일\s*\|\s*([^|]+)/);
      return { type: 'rights', at, id: d.id, title, kind: /전환|상환/.test(title) ? 'CPS' : '유상증자', shares: (cs || 0) + (os || 0), price: p1 || p2 || NUM(g(/전환가액\s*\(원\/주\)\s*\|\s*([\d,]+)/)), method: (g(/증자방식\s*\|\s*([^|]+)/) || '').trim(),
        disc: NUM(g(/할인율 또는 할증율\s*\(%\)\s*\|\s*(-?[\d.]+)/)), pre, from: per ? KD(per[1]) : null, to: per ? KD(per[2]) : null, floor: NUM(g(/최저\s*조정가액\s*\(원\)\s*\|\s*([\d,]+)/)), investors: parseInvestors(t), listAt: KD(g(/신주의 상장 예정일\s*\|\s*([^|]+)/)) };
    }
    if (/가액.*조정/.test(title)) {
      const s1 = t.split(/\|\s*2\.\s/)[0]; const rows = []; const re = /\|\s*(\d{1,3})\s*\|\s*(비상장|상장|-|해당없음)\s*\|\s*([\d,.]+)\s*\|\s*([\d,.]+)/g; let m;
      while ((m = re.exec(s1))) rows.push({ round: +m[1], before: NUM(m[3]), after: NUM(m[4]) });
      return { type: 'adjust', at: KD(g(/조정가액\s*적용일\s*\|\s*([^|]+)/)) || at, id: d.id, title, kind: KIND(title) || 'CB', rows, reason: (g(/조정사유\s*\|\s*([^|]+)/) || '').trim() };
    }
    if (/만기전\s*사채\s*취득/.test(title)) {
      return { type: 'buyback', at, id: d.id, title, kind: KIND(title), round: +(g(/\|\s*(\d{1,3})\s*\|\s*회차/) || g(/\(제\s*(\d{1,3})\s*회차/) || g(/(\d{1,3})\s*회차/) || 0) || null, price: NUM(g(/전환가액\s*\(원\)\s*\|\s*([\d,]+)/)),
        amt: NUM(g(/취득한 사채의 권면\(전자등록\)총액\s*\(통화단위\)\s*\|\s*([\d,]+)/)), left: NUM(g(/취득후 사채의 권면\(전자등록\)총액\s*\(통화단위\)\s*\|\s*([\d,]+)/)), put: /조기상환청구권|PUT/i.test(t) };
    }
    if (/추가상장/.test(title)) {
      const conv = []; const re = /\|\s*([^|]*(?:전환|행사|교환)[^|]*)\s*\|\s*(\d{1,3})\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)/g; let m;
      while ((m = re.exec(t))) conv.push({ why: m[1].trim(), round: +m[2], shares: NUM(m[3]), price: NUM(m[4]) });
      return { type: 'listing', at: KD(g(/상장일\s*\|\s*([^|]+)/)) || at, id: d.id, title, kind: KIND(title), add: NUM(g(/추가주식수\(주\)\s*\|\s*보통주\s*\|\s*[A-Z]?\d{6}\s*\|\s*([\d,]+)/)), total: NUM(g(/상장주식총수\s*\|[^|]*\|[^|]*\|[^|]*\|\s*보통주\s*\|\s*([\d,]+)/)), conv };
    }
    return null;
  }
  /** F: 서버 funding 응답 { docs, titles }, price 현재가, today 'YYYY-MM-DD' */
  function funding(F, price, today) {
    if (!F || !Array.isArray(F.docs)) return null;
    today = today || new Date().toISOString().slice(0, 10);
    const P = F.docs.map((d) => { try { return parseDoc(d); } catch { return null; } }).filter(Boolean).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const ins = {}; let total = null; const events = []; const key = (k, r) => (k === 'BW' ? 'BW' : k === 'EB' ? 'EB' : 'CB') + ':' + r;
    // 1) 최신 발행결정의 '미상환 사채권' 표로 기존 회차 잔액을 잡고
    const lastIssue = P.filter((x) => x.type === 'issue').pop();
    if (lastIssue) { for (const o of lastIssue.outst) ins[key(o.kind, o.round)] = { kind: o.kind, round: o.round, bal: o.bal, price: o.price, price0: o.price, from: o.from, to: o.to, src: 'table', at: lastIssue.at, hist: [] }; if (lastIssue.total) total = lastIssue.total; }
    for (const x of P) {
      if (x.type === 'issue' && x.round) {
        const k = key(x.kind, x.round); const o = ins[k] || {};
        ins[k] = { ...o, kind: x.kind, round: x.round, bal: o.src === 'table' && x.at < o.at ? o.bal : x.face, face: x.face, price: o.src === 'table' && x.at < o.at ? o.price : x.price, price0: x.price, from: x.from, to: x.to, maturity: x.maturity, coupon: x.coupon, ytm: x.ytm, method: x.method, floor: x.floor, floorPct: x.floorPct, refixM: x.refixM, put: x.put, call: x.call, investors: x.investors, issuedAt: x.at, ratio: x.ratio, debt: x.debt, at: o.src === 'table' && x.at < o.at ? o.at : x.at, src: o.src === 'table' && x.at < o.at ? 'table' : 'issue', hist: o.hist || [] };
        events.push({ at: x.at, t: 'issue', txt: `${KNAME[x.kind] || x.kind} ${x.round}회차 발행 결정 · ${x.face ? won(x.face) : '-'} · ${x.price ? '전환가 ' + fmtN(x.price) + '원' : ''}${x.ratio ? ` · 주식총수의 ${x.ratio}%` : ''}`, d: x });
      } else if (x.type === 'rights') {
        events.push({ at: x.at, t: 'rights', txt: `${x.kind === 'CPS' ? '전환우선주 ' : ''}유상증자 결정 (${x.method || '-'}) · ${x.shares ? fmtN(x.shares) + '주' : '-'}${x.price ? ` · 발행가 ${fmtN(x.price)}원` : ''}${x.disc != null ? ` · 할인/할증 ${x.disc}%` : ''}`, d: x });
        if (x.kind === 'CPS' && x.price) ins['CPS:' + x.at] = { kind: 'CPS', round: null, bal: x.shares * x.price, price: x.price, price0: x.price, from: x.from, to: x.to, floor: x.floor, investors: x.investors, issuedAt: x.at, at: x.at, src: 'rights', hist: [] };
        if (x.pre && !total) total = x.pre;
      } else if (x.type === 'adjust') {
        for (const r of x.rows) { const k = key(x.kind, r.round); const o = (ins[k] = ins[k] || { kind: x.kind, round: r.round, bal: null, price0: r.before, hist: [], src: 'adjust' }); if (!o.at || x.at >= o.at || r.before === o.price) { o.price = r.after; if (o.at && x.at > o.at) o.at = x.at; } o.hist.push({ at: x.at, before: r.before, after: r.after, reason: x.reason }); }
        const r0 = x.rows[0]; if (r0) events.push({ at: x.at, t: r0.after < r0.before ? 'down' : 'up', txt: `${KNAME[x.kind] || x.kind} ${x.rows.map((r) => r.round + '회차').join('·')} 전환가 ${fmtN(r0.before)} → ${fmtN(r0.after)}원 (${x.reason || (r0.after < r0.before ? '하향' : '상향')})`, d: x });
      } else if (x.type === 'buyback') {
        if (x.round) { const k = key(x.kind, x.round); const o = (ins[k] = ins[k] || { kind: x.kind, round: x.round, price: x.price, price0: x.price, hist: [], src: 'buyback' }); if (x.left != null && (!o.at || x.at >= o.at)) { o.bal = x.left; o.at = x.at; } }
        events.push({ at: x.at, t: 'put', txt: `${x.round ? x.round + '회차 ' : ''}사채 만기 전 취득 ${x.amt ? won(x.amt) : ''}${x.put ? ' (투자자 조기상환청구·풋옵션)' : ''}${x.left != null ? ` · 잔액 ${won(x.left)}` : ''}`, d: x });
      } else if (x.type === 'listing') {
        if (x.total) total = x.total;
        for (const c of x.conv) { const k = Object.keys(ins).find((y) => y.endsWith(':' + c.round)); if (k && ins[k].bal != null && x.at > (ins[k].at || '')) ins[k].bal = Math.max(0, ins[k].bal - c.shares * c.price); }
        events.push({ at: x.at, t: 'conv', txt: `${x.conv.length ? x.conv.map((c) => `${c.round}회차 ${fmtN(c.shares)}주(${fmtN(c.price)}원)`).join(', ') : ''} ${/전환|CB|행사|BW|교환/.test(x.title) ? '전환·행사 주식 상장' : '추가 상장'}${x.add ? ` · 총 ${fmtN(x.add)}주` : ''}`, d: x });
      }
    }
    // 2) 회차별 현재 상태
    const L = Object.values(ins).filter((o) => o.price > 0 && (o.bal == null || o.bal > 0) && (!o.to || o.to >= today)).map((o) => {
      const sh = o.bal != null ? o.bal / o.price : null; const parity = price && o.price ? (price / o.price) * 100 : null;
      const open = o.from ? o.from <= today : null; const days = o.from ? Math.round((new Date(o.from) - new Date(today)) / 864e5) : null;
      const floor = o.floor || (o.floorPct && o.price0 ? o.price0 * o.floorPct / 100 : null);
      return { ...o, shares: sh, parity, open, days, floorPx: floor, refixRoom: floor && o.price > floor ? (1 - floor / o.price) * 100 : 0 };
    }).sort((a, b) => (a.from || '').localeCompare(b.from || ''));
    const sumSh = L.reduce((s, o) => s + (o.shares || 0), 0); const itm = L.filter((o) => o.open && o.parity >= 100); const itmSh = itm.reduce((s, o) => s + (o.shares || 0), 0);
    const soon = L.filter((o) => o.open === false && o.days != null && o.days <= 90); const soonSh = soon.reduce((s, o) => s + (o.shares || 0), 0);
    const yago = new Date(new Date(today) - 365 * 864e5).toISOString().slice(0, 10), hago = new Date(new Date(today) - 182 * 864e5).toISOString().slice(0, 10);
    const tt = (F.titles || []); const n12 = tt.filter((x) => x.at >= yago && /(전환사채권|신주인수권부사채권|교환사채권)발행결정|유상증자결정/.test(x.title) && !/정정|종속회사|자회사/.test(x.title)).length;
    const downs = events.filter((e) => e.t === 'down' && e.at >= hago).length, ups = events.filter((e) => e.t === 'up' && e.at >= hago).length;
    const puts = events.filter((e) => e.t === 'put' && e.at >= yago).length, convs = events.filter((e) => e.t === 'conv' && e.at >= hago && /전환|행사/.test(e.txt)).length;
    const insider = L.some((o) => (o.investors || []).some((v) => /본인|최대주주|특수관계/.test(v.rel)));
    const misc = tt.filter((x) => /자기주식|최대주주|대량보유|무상증자|감자|주식등의/.test(x.title)).slice(0, 8);
    const pctOf = (n) => (total && n ? (n / total) * 100 : null);
    // 3) 점수(10점)와 해석
    let s = 8; const F2 = [];
    const dil = pctOf(sumSh); if (dil != null) { if (dil > 10) s -= 3; else if (dil > 5) s -= 2; else if (dil > 2) s -= 1; }
    const itmP = pctOf(itmSh); if (itmP != null && itmP > 1) { s -= itmP > 4 ? 2 : 1; F2.push(['-', `지금 바로 전환하면 차익이 나는 물량 약 ${fmtN(itmSh)}주(주식총수의 ${itmP.toFixed(1)}%) — 주가가 오를 때마다 전환 후 매도(오버행)가 나올 수 있습니다`]); }
    if (soon.length) F2.push(['-', `${soon.map((o) => `${o.round || ''}회차`).join('·')} 전환 청구가 ${Math.max(0, Math.min(...soon.map((o) => o.days)))}일 뒤 시작 — 약 ${fmtN(soonSh)}주가 시장에 나올 수 있습니다`]);
    if (n12 >= 3) { s -= 2; F2.push(['-', `최근 1년 자금조달(CB·BW·유상증자) 공시 ${n12}건 — 잦은 조달은 주주가치 희석 신호입니다`]); } else if (n12 === 0 && !L.length) F2.push(['+', '최근 메자닌(CB·BW)·유상증자 발행이 없어 희석 부담이 적습니다']);
    if (downs) { s -= 1; F2.push(['-', `최근 6개월 전환가 하향 조정(리픽싱) ${downs}회 — 주가가 전환가 아래로 내려가 전환 가능 주식 수가 늘었습니다`]); }
    if (ups) F2.push(['+', `최근 6개월 전환가 상향 조정 ${ups}회 — 주가가 올라 전환가도 따라 올라갔습니다`]);
    if (puts) { s -= 1; F2.push(['-', `최근 1년 사채 조기상환(풋옵션) ${puts}회 — 투자자가 주식 전환 대신 원금 상환을 택했습니다 (회사 현금 유출)`]); }
    if (convs) F2.push(['-', `최근 6개월 CB·BW 전환·행사 주식 상장 ${convs}회 — 실제 전환 물량이 시장에 나오고 있습니다`]);
    if (insider) { s += 1; F2.push(['+', '최대주주·특수관계인이 사채 인수에 참여 — 회사가 전환가 이상을 지키려는 동기가 있습니다']); }
    const under = L.filter((o) => o.parity != null && o.parity < 100);
    if (under.length) { const lo = Math.min(...under.map((o) => o.price)), hi = Math.max(...under.map((o) => o.price)), rm = Math.max(0, ...under.map((o) => o.refixRoom || 0));
      F2.push(['-', `미전환 ${under.length}건은 전환가(${lo === hi ? fmtN(lo) : fmtN(lo) + '~' + fmtN(hi)}원)가 현재가보다 높습니다 — ${rm > 0 ? `리픽싱으로 전환가가 최대 ${rm.toFixed(0)}% 더 내려가 전환 주식 수가 늘 수 있고, ` : ''}투자자가 조기상환을 요구할 수 있습니다`]); }
    return { ok: true, score: clamp(s, 0, 10), instruments: L, events: events.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 14), total, sumSh, dil, itmSh, itmP, soonSh, n12, downs, ups, puts, convs, insider, misc, factors: F2, since: F.since, partial: F.partial };
  }

  // ───────── 매집·세력 흔적 (일봉 거래량·가격 패턴 + 외국인·기관 수급) ─────────
  function flow(b, deal) {
    const n = b.length, L = n - 1; if (n < 30) return null;
    const c = b.map((x) => x.c), v = b.map((x) => x.v || 0);
    const obv = [0]; for (let i = 1; i < n; i++) obv.push(obv[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0));
    const lk = Math.min(20, n - 1); const v20 = avg(v.slice(-20)) || 1; const pc = (c[L] / c[L - lk] - 1) * 100; const oc = (obv[L] - obv[L - lk]) / (v20 * lk);
    let mf = 0, mv = 0; for (let i = Math.max(0, n - 20); i < n; i++) { const r = b[i].h - b[i].l; if (r > 0) mf += (((b[i].c - b[i].l) - (b[i].h - b[i].c)) / r) * v[i]; mv += v[i]; } const cmf = mv ? mf / mv : 0;
    let uv = 0, dv = 0; for (let i = Math.max(1, n - 20); i < n; i++) { if (c[i] > c[i - 1]) uv += v[i]; else if (c[i] < c[i - 1]) dv += v[i]; } const udr = dv ? uv / dv : uv ? 9 : 1;
    // 대량거래일 (직전 20일 평균의 3배 이상, 최근 120일)
    const big = []; for (let i = Math.max(21, n - 120); i < n; i++) { const a = avg(v.slice(i - 20, i)) || 1; if (v[i] >= a * 3) { const r = b[i].h - b[i].l || 1; big.push({ i, t: b[i].t, x: v[i] / a, loc: (b[i].c - b[i].l) / r, up: (b[i].h - Math.max(b[i].o, b[i].c)) / r, ret: (c[i] / c[i - 1] - 1) * 100, tp: (b[i].h + b[i].l + b[i].c) / 3, v: v[i] }); } }
    const acc = big.filter((x) => x.loc >= 0.55 && x.up < 0.35), dist = big.filter((x) => x.up >= 0.45 && x.loc < 0.45);
    const bw = big.reduce((s, x) => s + x.v, 0); const cost = bw ? big.reduce((s, x) => s + x.tp * x.v, 0) / bw : null;
    let vw = 0, vs = 0; for (let i = Math.max(0, n - 60); i < n; i++) { vw += ((b[i].h + b[i].l + b[i].c) / 3) * v[i]; vs += v[i]; } const vwap60 = vs ? vw / vs : null;
    const v5 = avg(v.slice(-5)); const dry = v5 < v20 * 0.55 && cost && c[L] >= cost * 0.97;
    // 수급 연속성
    const D = (deal || []).filter((d) => Array.isArray(d)); const streak = (k) => { let s = 0; for (const d of D) { if ((d[k] || 0) > 0) s++; else break; } return s; };
    const sum = (k, m) => D.slice(0, m).reduce((s, d) => s + (d[k] || 0), 0);
    const fS = streak(1), oS = streak(2); const nD = Math.min(10, D.length); const f10 = sum(1, nD), o10 = sum(2, nD), p10 = sum(3, nD);
    const hold = (d) => NUM(d && d[4]); const hNow = hold(D[0]), hOld = hold(D[Math.min(D.length - 1, 19)]);
    let s = 5; const F = [];
    if (oc > 0.25 && pc < 3) { s += 2; F.push(['+', `OBV(누적 거래량)는 늘었는데 주가는 ${pc >= 0 ? '+' : ''}${pc.toFixed(1)}%로 제자리 — 가격을 누르며 물량을 모으는 매집 패턴일 수 있습니다`]); }
    else if (oc < -0.25 && pc > -3) { s -= 2; F.push(['-', `주가는 버티는데 OBV(누적 거래량)는 줄어듦 — 위에서 물량을 넘기는 분산(설거지) 패턴일 수 있습니다`]); }
    if (cmf > 0.12) { s += 1; F.push(['+', `자금흐름지표(CMF 20일) ${cmf.toFixed(2)} — 종가가 고가 쪽에서 끝나는 날이 많아 매수세가 우위입니다`]); } else if (cmf < -0.12) { s -= 1; F.push(['-', `자금흐름지표(CMF 20일) ${cmf.toFixed(2)} — 종가가 저가 쪽에서 끝나는 날이 많아 매도세가 우위입니다`]); }
    if (acc.length) { s += acc.length >= 2 ? 2 : 1; F.push(['+', `최근 120일 매집형 대량거래 ${acc.length}회 (평소의 ${Math.max(...acc.map((x) => x.x)).toFixed(0)}배 거래, 고가권 마감) — 큰손 매수 흔적`]); }
    if (dist.length) { s -= dist.length >= 2 ? 2 : 1; F.push(['-', `긴 윗꼬리 대량거래 ${dist.length}회 — 올려놓고 물량을 넘긴 흔적일 수 있습니다`]); }
    if (dry) { s += 1; F.push(['+', '대량거래 이후 거래량이 크게 줄었는데 주가는 매집 단가 위 유지 — 매물이 말라가는 구간']); }
    if (udr >= 1.8) F.push(['+', `20일간 상승일 거래량이 하락일의 ${udr.toFixed(1)}배`]); else if (udr <= 0.55) F.push(['-', `20일간 하락일 거래량이 상승일의 ${(1 / Math.max(udr, 0.01)).toFixed(1)}배`]);
    if (D.length) {
      if (fS >= 3 || oS >= 3) { s += 1; F.push(['+', `${fS >= 3 ? `외국인 ${fS}일 연속 순매수` : ''}${fS >= 3 && oS >= 3 ? ' · ' : ''}${oS >= 3 ? `기관 ${oS}일 연속 순매수` : ''}`]); }
      if (f10 + o10 > 0 && p10 < 0) F.push(['+', `최근 ${nD}거래일 개인이 판 ${fmtN(Math.abs(p10))}주를 외국인·기관이 받아감`]); else if (f10 + o10 < 0 && p10 > 0) { s -= 1; F.push(['-', `최근 ${nD}거래일 외국인·기관이 판 물량을 개인이 받는 중 (${fmtN(p10)}주)`]); }
      if (hNow != null && hOld != null && Math.abs(hNow - hOld) >= 0.3) F.push([hNow > hOld ? '+' : '-', `외국인 보유율 ${hOld.toFixed(2)}% → ${hNow.toFixed(2)}% (${Math.min(20, D.length)}거래일)`]);
    }
    return { score: clamp(Math.round(s), 0, 10), obvChg: oc, priceChg: pc, cmf, udr, big: big.slice(-6).reverse(), acc: acc.length, dist: dist.length, cost, vwap60, dry, fS, oS, f10, o10, p10, hNow, hOld, factors: F };
  }
  function won(x) { if (x == null) return '-'; const a = Math.abs(x); return a >= 1e12 ? (x / 1e12).toFixed(2).replace(/\.?0+$/, '') + '조원' : a >= 1e8 ? Math.round(x / 1e8).toLocaleString('ko-KR') + '억원' : a >= 1e4 ? Math.round(x / 1e4).toLocaleString('ko-KR') + '만원' : fmtN(x) + '원'; }

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

    // 8) 매집·세력 흔적 (10) — OBV·CMF·대량거래 패턴·연속 순매수
    const FL = flow(b, deal); if (FL) { sc.flow = FL.score; }
    // 9) 자금조달·희석 (10) — CB·BW·EB·유상증자 공시 (국내, 공시 데이터가 있을 때만)
    const FU = p.funding ? funding(p.funding, price) : null; if (FU) sc.funding = FU.score;
    const MAX = { trend: 25, momentum: 20, volume: 10, position: 10, supply: 15, value: 10, news: 10 }; if (FL) MAX.flow = 10; if (FU) MAX.funding = 10;
    const score = Math.round((Object.keys(MAX).reduce((t2, k) => t2 + (sc[k] || 0), 0) / Object.values(MAX).reduce((a2, x) => a2 + x, 0)) * 100);
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
    if (FL) {
      const t3 = FL.obvChg > 0.25 && FL.priceChg < 3 ? '거래량 흐름상 물량을 모으는 매집 패턴이 보입니다' : FL.obvChg < -0.25 && FL.priceChg > -3 ? '거래량 흐름상 물량을 넘기는 분산 패턴이 보여 주의가 필요합니다' : FL.score >= 7 ? '대량거래·자금흐름 모두 매수 쪽 흔적이 우세합니다' : FL.score <= 3 ? '대량거래·자금흐름에서 매도 쪽 흔적이 우세합니다' : '뚜렷한 매집·분산 흔적은 보이지 않습니다';
      lines.push(t3 + (FL.cost ? ` (최근 120일 대량거래 평균 단가 약 ${fmt(FL.cost, p.currency)} — 현재가는 그보다 ${Math.abs((price / FL.cost - 1) * 100).toFixed(1)}% ${price >= FL.cost ? '위' : '아래'})` : '') + '.');
    }
    if (FU) {
      const I2 = FU.instruments.filter((o) => o.kind !== 'CPS' || o.price);
      if (I2.length) {
        const lo = Math.min(...I2.map((o) => o.price)), hi = Math.max(...I2.map((o) => o.price));
        lines.push(`미전환 CB·BW 등 ${I2.length}건의 전환(행사)가는 ${lo === hi ? fmtN(lo) + '원' : fmtN(lo) + '~' + fmtN(hi) + '원'}이며${FU.dil != null ? `, 모두 주식이 되면 주식 수가 약 ${FU.dil.toFixed(1)}% 늘어납니다` : ''}.`);
        lines.push(FU.itmSh > 0 ? '현재가가 전환가보다 높아 사채 투자자는 이미 차익 구간이므로, 상승 때마다 전환 매물이 나올 수 있습니다.' : '현재가가 전환가보다 낮아 사채 투자자는 전환가 회복을 기다리거나, 리픽싱(전환가 하향)·조기상환으로 손실을 피할 수 있습니다. 따라서 전환가가 주가의 바닥이나 목표가를 보장하지는 않습니다.');
      } else if (FU.n12 === 0) lines.push('최근 CB·BW·유상증자 발행 공시가 없어 주식 희석 부담은 적습니다.');
    }
    if (titles.length) lines.push(sen.score > 0.2 ? '최근 뉴스·리포트 흐름은 긍정적입니다.' : sen.score < -0.2 ? '최근 뉴스 흐름에 부정적인 이슈가 많아 변동성에 유의해야 합니다.' : '뉴스 흐름은 중립적입니다.');

    return {
      ok: true, code: p.code, name: p.name, price, currency: p.currency, score, opinion: opinion[0], tone: opinion[1], scores: sc,
      max: MAX, flow: FL, fund: FU,
      ind: { rsi: r, macd: macd[L], hist: hist[L], ma5: m5[L], ma20: m20[L], ma60: m60[L], ma120: m120[L], bbU, bbL, atrPct, volR, pos52, r5: ret(5), r20, r60: ret(60), r120: ret(120), hi52: y.hi, lo52: y.lo, per, cper, pbr, dy },
      levels: { support: sup, resist: res, stop, target1, target2, rr },
      factors: F, summary: lines.join(' '), news: sen.hits, at: new Date().toISOString(),
    };
  }
  function tickKR(p) { return p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000; }
  function fmt(x, ccy) { if (x == null || !isFinite(x)) return '-'; if (ccy === 'USD') return '$' + x.toFixed(2); const t = tickKR(x); return (Math.round(x / t) * t).toLocaleString('ko-KR') + '원'; }
  function fmtN(x) { return Math.round(x).toLocaleString('ko-KR'); }
  return { analyze, sentiment, rsi, sma, ema, funding, flow, parseDoc };
});
