// 가상 체결 엔진 + 계좌 평가 (데모 모드용, 서버 모드는 server/lib.php 가 동일 로직 수행)
const Engine = (() => {
  const DEF = { feeKr: 0.015, feeUs: 0.25, taxKr: 0.20, initialCash: 10000000, autoApprove: false, enforceHours: false, allowSignup: true, maxDeposit: 100000000, minOrderKrw: 0 };
  const feeRate = (st, ccy) => (ccy === 'USD' ? st.feeUs : st.feeKr) / 100;
  const taxRate = (st, ccy) => (ccy === 'USD' ? 0 : st.taxKr / 100);

  // 계좌 평가
  function valuate(d, st) {
    st = { ...DEF, ...(st || {}) };
    const cash = d.user.cash || 0;
    const pending = (d.orders || []).filter((o) => o.status === 'pending');
    let reserved = 0; const sellLock = {}; const ocoMax = {};
    for (const o of pending) {
      const q = Market.quote(o.code); const ccy = q ? q.currency : 'KRW';
      const rem = o.qty - (o.filled || 0);
      if (o.side === 'buy') reserved += Market.toKrw((o.type === 'stop' ? o.triggerPrice : o.price) * rem, ccy) * (1 + feeRate(st, ccy));
      else if (o.oco) { const k = o.code + '|' + o.oco; ocoMax[k] = Math.max(ocoMax[k] || 0, rem); }
      else sellLock[o.code] = (sellLock[o.code] || 0) + rem;
    }
    // 익절·손절 묶음(OCO)은 둘 중 하나만 체결되므로 수량을 한 번만 잡음
    for (const k in ocoMax) { const c = k.split('|')[0]; sellLock[c] = (sellLock[c] || 0) + ocoMax[k]; }
    const holdings = [];
    let evalKrw = 0, costKrw = 0;
    for (const [code, p] of Object.entries(d.positions || {})) {
      if (!p || p.qty <= 0) continue;
      const q = Market.quote(code); if (!q) continue;
      const ev = Market.toKrw(q.price * p.qty, q.currency);
      const pnl = ev - p.cost;
      evalKrw += ev; costKrw += p.cost;
      holdings.push({ code, name: q.name, market: q.market, currency: q.currency, qty: p.qty, sellable: p.qty - (sellLock[code] || 0), avg: p.avg, price: q.price, changePct: q.changePct, evalKrw: ev, costKrw: p.cost, pnl, pnlPct: p.cost ? (pnl / p.cost) * 100 : 0 });
    }
    holdings.sort((a, b) => b.evalKrw - a.evalKrw);
    const flows = (d.cashflows || []).filter((c) => c.status === 'approved');
    const deposits = flows.filter((c) => c.type === 'deposit').reduce((s, c) => s + c.amount, 0);
    const withdrawals = flows.filter((c) => c.type === 'withdraw').reduce((s, c) => s + c.amount, 0);
    const conv = d.user.convKrw || 0; // 코인 지갑(USDT)으로 옮긴 원화 — 주식 계좌 원금에서 제외
    const principal = (d.user.initial || 0) + deposits - withdrawals - conv;
    const total = cash + evalKrw;
    const realized = (d.fills || []).reduce((s, f) => s + (f.pnl || 0), 0);
    const pendingWithdraw = (d.cashflows || []).filter((c) => c.status === 'pending' && c.type === 'withdraw').reduce((s, c) => s + c.amount, 0);
    // MAX 버프 (담보 신용)
    const buff = (d.buffs || []).find((b) => b.status === 'active') || null;
    const loan = buff ? buff.amount : 0;
    const interest = buff ? (buff.interestNow != null ? buff.interestNow : Math.round(buff.amount * (buff.rate / 100) * Math.max(0, (Date.now() - new Date(buff.approvedAt).getTime()) / 86400000) / 365)) : 0;
    const net = total - loan - interest;
    const ratio = loan ? (total / (loan + interest)) * 100 : null;
    return {
      buff, loan, interest, net, ratio, maintain: buff ? buff.maintain : null,
      netPnl: net - principal, netPct: principal ? ((net - principal) / principal) * 100 : 0,
      cash, reserved, orderable: Math.max(0, cash - reserved - pendingWithdraw), withdrawable: Math.max(0, cash - reserved - pendingWithdraw),
      evalKrw, costKrw, pnl: evalKrw - costKrw, pnlPct: costKrw ? ((evalKrw - costKrw) / costKrw) * 100 : 0,
      total, principal, totalPnl: total - principal, totalPct: principal ? ((total - principal) / principal) * 100 : 0,
      realized, holdings, sellLock, deposits, withdrawals, conv,
    };
  }

  // 주문 검증
  function validate(d, st, o) {
    st = { ...DEF, ...(st || {}) };
    const q = Market.quote(o.code);
    if (!q) return '종목을 찾을 수 없습니다.';
    if (d.user.status === 'suspended') return '정지된 계정은 주문할 수 없습니다.';
    if (!Number.isInteger(o.qty) || o.qty <= 0) return '주문 수량을 확인해 주세요.';
    if (o.qty > 1000000) return '1회 최대 주문 수량을 초과했습니다.';
    const ses = Market.session(q.market);
    if (st.enforceHours && !ses.open && o.type === 'market') return `지금은 ${ses.label} 시간이라 시장가 주문을 할 수 없습니다. ${ses.ext ? '시간외 주문 또는 ' : ''}지정가 예약주문을 이용하세요.`;
    if (o.type === 'ext') {
      if (!ses.ext) return q.currency === 'KRW' ? '지금은 시간외 거래 시간이 아닙니다. (장전 08:30~08:40 · 장후 15:40~16:00 · 단일가 16:00~18:00)' : '지금은 프리마켓·애프터마켓 시간이 아닙니다.';
      if (!(o.price > 0)) return '주문 가격을 입력해 주세요.';
      if ((ses.code === 'pre_close' || ses.code === 'post_close') && o.price !== q.price) return `시간외 종가 주문은 종가(${U.n0(q.price)}원)로만 가능합니다.`;
      if (ses.code === 'single' && (o.price > q.price * 1.1 || o.price < q.price * 0.9)) return '시간외 단일가는 종가 대비 ±10% 이내에서만 주문할 수 있습니다.';
    }
    if (o.type === 'stop') {
      if (!(o.triggerPrice > 0)) return '감시 가격을 입력해 주세요.';
      if (!['ge', 'le'].includes(o.triggerCond)) return '감시 조건을 선택해 주세요.';
    }
    if (o.type === 'limit') {
      if (!(o.price > 0)) return '주문 가격을 입력해 주세요.';
      if (q.currency === 'KRW') {
        if (o.price % U.tickKR(o.price) !== 0) return `호가단위(${U.tickKR(o.price)}원)에 맞지 않는 가격입니다.`;
        if (q.upper && o.price > q.upper) return `상한가(${U.n0(q.upper)}원)를 초과했습니다.`;
        if (q.lower && o.price < q.lower) return `하한가(${U.n0(q.lower)}원) 미만입니다.`;
      }
    }
    const v = valuate(d, st);
    if (o.side === 'buy') {
      const p = o.type === 'market' ? Market.bestAsk(o.code) * (q.currency === 'KRW' ? 1 : 1.002) : o.type === 'stop' ? o.triggerPrice : o.price;
      const need = Market.toKrw(p * o.qty, q.currency) * (1 + feeRate(st, q.currency));
      if (need > v.orderable + 0.5) return `주문가능금액이 부족합니다. (필요 ${U.won(need)} / 가능 ${U.won(v.orderable)})`;
    } else {
      const h = v.holdings.find((x) => x.code === o.code);
      if (!h || h.sellable < o.qty) return `매도가능수량이 부족합니다. (가능 ${h ? h.sellable : 0}주)`;
    }
    return null;
  }

  // 체결 처리 (d 를 직접 수정) — 반환: fill 또는 null
  function execute(d, st, order, price, at) {
    st = { ...DEF, ...(st || {}) };
    const q = Market.quote(order.code); const ccy = q.currency; const fx = ccy === 'USD' ? Market.fx() : 1;
    const qty = order.qty - (order.filled || 0);
    const gross = price * qty * fx;
    const fee = Math.round(gross * feeRate(st, ccy));
    const tax = order.side === 'sell' ? Math.round(gross * taxRate(st, ccy)) : 0;
    d.positions = d.positions || {};
    const pos = d.positions[order.code] || { qty: 0, avg: 0, cost: 0 };
    let pnl = 0;
    if (order.side === 'buy') {
      const total = gross + fee;
      if (total > d.user.cash + 0.5) return null;
      d.user.cash -= total;
      pos.avg = (pos.avg * pos.qty + price * qty) / (pos.qty + qty);
      pos.qty += qty; pos.cost += total;
      d.positions[order.code] = pos;
    } else {
      if (pos.qty < qty) return null;
      const proceeds = gross - fee - tax;
      const costPart = pos.cost * (qty / pos.qty);
      pnl = proceeds - costPart;
      d.user.cash += proceeds;
      pos.qty -= qty; pos.cost -= costPart;
      if (pos.qty <= 0) delete d.positions[order.code]; else d.positions[order.code] = pos;
    }
    order.filled = order.qty; order.avgFill = price; order.status = 'filled'; order.updatedAt = at || new Date().toISOString();
    const fill = { id: U.uid('f'), orderId: order.id, userId: order.userId, code: order.code, name: q.name, side: order.side, price, qty, currency: ccy, fx, amount: Math.round(gross), fee, tax, pnl: Math.round(pnl), at: order.updatedAt };
    d.fills = d.fills || []; d.fills.push(fill);
    return fill;
  }

  // 신규 주문 → 즉시 체결 시도
  function place(d, st, input) {
    const err = validate(d, st, input); if (err) return { error: err };
    const q = Market.quote(input.code);
    const order = { id: U.uid('o'), userId: d.user.id, code: input.code, name: q.name, side: input.side, type: input.type, triggerPrice: input.triggerPrice, triggerCond: input.triggerCond, price: input.type === 'limit' || input.type === 'ext' ? input.price : 0, qty: input.qty, filled: 0, status: 'pending', createdAt: new Date().toISOString(), currency: q.currency };
    d.orders = d.orders || []; d.orders.push(order);
    const fill = tryFill(d, st, order);
    if (input.type === 'market' && !fill) { order.status = 'rejected'; order.reason = '체결 불가'; return { error: '시장가 주문이 체결되지 않았습니다.', order }; }
    return { order, fill };
  }
  function tryFill(d, st, order) {
    if (order.status !== 'pending') return null;
    st = { ...DEF, ...(st || {}) };
    const q = Market.quote(order.code); if (!q) return null;
    const ses = Market.session(q.market);
    if (order.type === 'ext') {
      if (!ses.ext) { order.status = 'cancelled'; order.reason = '시간외 거래 시간 종료로 자동 취소'; return null; }
      if ((order.side === 'buy' && order.price >= q.price) || (order.side === 'sell' && order.price <= q.price)) return execute(d, st, order, q.price);
      return null;
    }
    if (st.enforceHours && !ses.open) return null;
    const ask = Market.bestAsk(order.code), bid = Market.bestBid(order.code);
    let px = null;
    if (order.type === 'stop') { if (!((order.triggerCond === 'ge' && q.price >= order.triggerPrice) || (order.triggerCond === 'le' && q.price <= order.triggerPrice))) return null; px = order.side === 'buy' ? ask : bid; }
    else if (order.type === 'market') px = order.side === 'buy' ? ask : bid;
    else if (order.side === 'buy' && ask <= order.price) px = Math.min(ask, order.price);
    else if (order.side === 'sell' && bid >= order.price) px = Math.max(bid, order.price);
    if (px === null) return null;
    return execute(d, st, order, px);
  }
  function cancel(d, id) {
    const o = (d.orders || []).find((x) => x.id === id && x.userId === d.user.id);
    if (!o || o.status !== 'pending') return { error: '취소할 수 없는 주문입니다.' };
    o.status = 'cancelled'; o.updatedAt = new Date().toISOString();
    return { order: o };
  }
  function amend(d, st, id, price, qty) {
    const o = (d.orders || []).find((x) => x.id === id && x.userId === d.user.id);
    if (!o || o.status !== 'pending') return { error: '정정할 수 없는 주문입니다.' };
    const old = { price: o.price, qty: o.qty };
    o.status = 'amending';
    const err = validate(d, st, { code: o.code, side: o.side, type: 'limit', price, qty });
    o.status = 'pending';
    if (err) return { error: err };
    o.price = price; o.qty = qty; o.updatedAt = new Date().toISOString(); o.amended = (o.amended || 0) + 1; o.history = [...(o.history || []), old];
    const fill = tryFill(d, st, o);
    return { order: o, fill };
  }

  return { DEF, valuate, validate, place, tryFill, cancel, amend, execute, feeRate, taxRate };
})();
