// Canvas 차트 — 캔들(이평선·거래량·크로스헤어), 라인/영역, 막대
const Chart = (() => {
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function setup(canvas) {
    if (!canvas || !canvas.isConnected) { const c = document.createElement('canvas'); c.width = c.height = 1; return { ctx: c.getContext('2d'), w: 0, h: 0 }; }
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }
  const font = (s, wt = 500) => `${wt} ${s}px 'Pretendard Variable', Pretendard, sans-serif`;
  const ema = (vals, n) => { const k = 2 / (n + 1); const out = []; let prev = null; vals.forEach((v, i) => { if (v == null) { out.push(null); return; } prev = prev == null ? v : v * k + prev * (1 - k); out.push(i < n - 1 ? null : prev); }); return out; };
  const rsiCalc = (all, n = 14) => { const out = new Array(all.length).fill(null); let g = 0, l = 0; for (let i = 1; i < all.length; i++) { const d = all[i].c - all[i - 1].c; const up = Math.max(0, d), dn = Math.max(0, -d); if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return out; };
  const macdCalc = (all) => { const c = all.map((k) => k.c); const e12 = ema(c, 12), e26 = ema(c, 26); const m = c.map((_, i) => (e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null)); const firstIdx = m.findIndex((v) => v != null); const sig = firstIdx < 0 ? m.map(() => null) : [...m.slice(0, firstIdx).map(() => null), ...ema(m.slice(firstIdx), 9)]; return { m, sig, hist: m.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null)) }; };
  const bbCalc = (all, n = 20, k = 2) => all.map((_, i) => { if (i < n - 1) return null; const sl = all.slice(i - n + 1, i + 1).map((x) => x.c); const mean = sl.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(sl.reduce((a, b) => a + (b - mean) ** 2, 0) / n); return { m: mean, u: mean + k * sd, l: mean - k * sd }; });
  const stochCalc = (all, n = 14, k = 3, d = 3) => { const raw = all.map((_, i) => { if (i < n - 1) return null; const sl = all.slice(i - n + 1, i + 1); const hh = Math.max(...sl.map((x) => x.h)), ll = Math.min(...sl.map((x) => x.l)); return hh === ll ? 50 : ((all[i].c - ll) / (hh - ll)) * 100; }); const sm = (arr, m) => arr.map((_, i) => { const sl = arr.slice(Math.max(0, i - m + 1), i + 1).filter((v) => v != null); return sl.length < m ? null : sl.reduce((a, b) => a + b, 0) / m; }); const K = sm(raw, k); return { k: K, d: sm(K, d) }; };
  const ichiCalc = (all) => { const mid = (i, n) => { if (i < n - 1) return null; const sl = all.slice(i - n + 1, i + 1); return (Math.max(...sl.map((x) => x.h)) + Math.min(...sl.map((x) => x.l))) / 2; }; const tk = all.map((_, i) => mid(i, 9)), kj = all.map((_, i) => mid(i, 26)); const a = all.map((_, i) => { const j = i - 26; return j >= 0 && tk[j] != null && kj[j] != null ? (tk[j] + kj[j]) / 2 : null; }); const b = all.map((_, i) => { const j = i - 26; return j >= 0 ? mid(j, 52) : null; }); return { tk, kj, a, b }; };
  const ma = (data, n) => data.map((_, i) => (i < n - 1 ? null : data.slice(i - n + 1, i + 1).reduce((s, k) => s + k.c, 0) / n));
  const cfmt = (v) => { const a = Math.abs(v); return a >= 1000 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : a >= 1 ? v.toFixed(4) : a >= 0.01 ? v.toFixed(5) : v.toPrecision(4); };
  const nice = (v, ccy) => (ccy === 'COIN' ? cfmt(v) : ccy === 'USD' ? v.toFixed(2) : U.n0(v));
  const fmtT = (t, tf) => { const d = new Date(t); return tf === 'm' ? U.two(d.getHours()) + ':' + U.two(d.getMinutes()) : tf === 'M' ? d.getFullYear() + '.' + U.two(d.getMonth() + 1) : U.two(d.getMonth() + 1) + '.' + U.two(d.getDate()); };

  // 캔들차트
  function candle(canvas, opts) {
    const st = { data: [], tf: 'D', ccy: 'KRW', view: 90, offset: 0, hover: -1, lines: [], tip: null, ma: [5, 20, 60, 120], bb: false, sub: 'vol', ...opts };
    function draw() {
      const { ctx, w, h } = setup(canvas);
      const up = css('--up'), down = css('--down'), grid = css('--chart-grid'), t2 = css('--text-2'), t3 = css('--text-3'), txt = css('--text'), bg = css('--surface');
      ctx.clearRect(0, 0, w, h);
      const all = st.data; if (!all.length) return;
      const n = Math.min(st.view, all.length);
      const end = Math.max(n, all.length - st.offset);
      const data = all.slice(end - n, end);
      const MAS = st.ma || []; const mas = {}; for (const m of MAS) mas[m] = ma(all, m).slice(end - n, end);
      const bb = st.bb ? bbCalc(all).slice(end - n, end) : null;
      const ich = st.ichi ? (() => { const I = ichiCalc(all); return { tk: I.tk.slice(end - n, end), kj: I.kj.slice(end - n, end), a: I.a.slice(end - n, end), b: I.b.slice(end - n, end) }; })() : null;
      const padR = 64, padB = 22, padT = 22;
      const volH = Math.max(40, (h - padB - padT) * 0.2);
      const ph = h - padB - padT - volH - 8; const pw = w - padR;
      let hi = -Infinity, lo = Infinity, vmax = 0;
      data.forEach((k, i) => { hi = Math.max(hi, k.h); lo = Math.min(lo, k.l); vmax = Math.max(vmax, k.v); for (const m of MAS) if (mas[m][i]) { hi = Math.max(hi, mas[m][i]); lo = Math.min(lo, mas[m][i]); } if (bb && bb[i]) { hi = Math.max(hi, bb[i].u); lo = Math.min(lo, bb[i].l); } });
      for (const L of st.lines) if (L.price) { hi = Math.max(hi, L.price); lo = Math.min(lo, L.price); }
      if (ich) for (const arr of [ich.tk, ich.kj, ich.a, ich.b]) for (const v of arr) if (v != null) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
      const pad = (hi - lo) * 0.08 || hi * 0.01; hi += pad; lo -= pad;
      const y = (p) => padT + ((hi - p) / (hi - lo)) * ph;
      const cw = pw / n; const bw = Math.max(1, Math.min(14, cw * 0.7));
      const x = (i) => i * cw + cw / 2;
      // grid
      ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = t3; ctx.font = font(11); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (let g = 0; g <= 4; g++) { const p = lo + ((hi - lo) * g) / 4; const yy = Math.round(y(p)) + 0.5; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(pw, yy); ctx.stroke(); ctx.fillText(nice(p, st.ccy), pw + 8, yy); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const step = Math.ceil(n / Math.max(2, Math.floor(pw / 90)));
      for (let i = 0; i < n; i += step) { const xx = Math.round(x(i)) + 0.5; if (xx < 26 || xx > pw - 20) continue; ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, h - padB); ctx.stroke(); ctx.fillText(fmtT(data[i].t, st.tf), xx, h - padB + 6); }
      // volume
      const vy0 = h - padB, vTop = vy0 - volH;
      ctx.fillStyle = t3; ctx.font = font(10, 600); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      if (st.sub === 'rsi') {
        const r = rsiCalc(all).slice(end - n, end); const yr = (v) => vTop + (1 - v / 100) * volH;
        ctx.strokeStyle = grid; for (const lv of [30, 70]) { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, yr(lv)); ctx.lineTo(pw, yr(lv)); ctx.stroke(); ctx.setLineDash([]); ctx.fillText(String(lv), pw + 8, yr(lv) - 6); }
        ctx.strokeStyle = '#B48CFF'; ctx.lineWidth = 1.4; ctx.beginPath(); let s0 = false; r.forEach((v, i) => { if (v == null) return; s0 ? ctx.lineTo(x(i), yr(v)) : (ctx.moveTo(x(i), yr(v)), (s0 = true)); }); ctx.stroke(); ctx.lineWidth = 1;
        const lr = r[r.length - 1]; ctx.fillStyle = t2; ctx.fillText('RSI(14) ' + (lr != null ? lr.toFixed(1) : '-'), 4, vTop + 2);
      } else if (st.sub === 'stoch') {
        const S = stochCalc(all); const kk = S.k.slice(end - n, end), dd = S.d.slice(end - n, end); const yr = (v) => vTop + (1 - v / 100) * volH;
        ctx.strokeStyle = grid; for (const lv of [20, 80]) { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, yr(lv)); ctx.lineTo(pw, yr(lv)); ctx.stroke(); ctx.setLineDash([]); ctx.fillText(String(lv), pw + 8, yr(lv) - 6); }
        for (const [arr, col] of [[kk, '#F5B94A'], [dd, '#5B9BFF']]) { ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.beginPath(); let s1 = false; arr.forEach((v, i) => { if (v == null) return; s1 ? ctx.lineTo(x(i), yr(v)) : (ctx.moveTo(x(i), yr(v)), (s1 = true)); }); ctx.stroke(); }
        ctx.lineWidth = 1; const lk = kk[kk.length - 1], ld = dd[dd.length - 1]; ctx.fillStyle = t2; ctx.fillText(`스토캐스틱(14,3,3) %K ${lk != null ? lk.toFixed(1) : '-'} %D ${ld != null ? ld.toFixed(1) : '-'}`, 4, vTop + 2);
      } else if (st.sub === 'macd') {
        const M = macdCalc(all); const m = M.m.slice(end - n, end), sg = M.sig.slice(end - n, end), hs = M.hist.slice(end - n, end);
        let mx = 0; [...m, ...sg, ...hs].forEach((v) => { if (v != null) mx = Math.max(mx, Math.abs(v)); }); mx = mx || 1;
        const ym = (v) => vTop + volH / 2 - (v / mx) * (volH / 2);
        ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(0, ym(0)); ctx.lineTo(pw, ym(0)); ctx.stroke();
        hs.forEach((v, i) => { if (v == null) return; ctx.fillStyle = v >= 0 ? up : down; ctx.globalAlpha = 0.5; ctx.fillRect(x(i) - bw / 2, Math.min(ym(0), ym(v)), bw, Math.abs(ym(v) - ym(0))); }); ctx.globalAlpha = 1;
        for (const [arr, col] of [[m, '#F5B94A'], [sg, '#5B9BFF']]) { ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.beginPath(); let s1 = false; arr.forEach((v, i) => { if (v == null) return; s1 ? ctx.lineTo(x(i), ym(v)) : (ctx.moveTo(x(i), ym(v)), (s1 = true)); }); ctx.stroke(); }
        ctx.lineWidth = 1; ctx.fillStyle = t2; ctx.fillText('MACD(12,26,9)', 4, vTop + 2);
      } else {
        data.forEach((k, i) => { const vh = vmax ? (k.v / vmax) * volH : 0; ctx.fillStyle = k.c >= k.o ? up : down; ctx.globalAlpha = 0.45; ctx.fillRect(x(i) - bw / 2, vy0 - vh, bw, vh); });
        ctx.globalAlpha = 1; ctx.fillStyle = t2; ctx.fillText('거래량', 4, vTop + 2);
      }
      if (ich) {
        // 구름대 (선행스팬1·2 사이)
        for (let i = 1; i < n; i++) { const a0 = ich.a[i - 1], b0 = ich.b[i - 1], a1 = ich.a[i], b1 = ich.b[i]; if ([a0, b0, a1, b1].some((v) => v == null)) continue; ctx.fillStyle = a1 >= b1 ? up : down; ctx.globalAlpha = 0.08; ctx.beginPath(); ctx.moveTo(x(i - 1), y(a0)); ctx.lineTo(x(i), y(a1)); ctx.lineTo(x(i), y(b1)); ctx.lineTo(x(i - 1), y(b0)); ctx.closePath(); ctx.fill(); }
        ctx.globalAlpha = 1;
        for (const [arr, col, w] of [[ich.tk, '#FF9F43', 1.2], [ich.kj, '#54A0FF', 1.2], [ich.a, up, 0.8], [ich.b, down, 0.8]]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = w < 1 ? 0.6 : 1; ctx.beginPath(); let s2 = false; arr.forEach((v, i) => { if (v == null) return; s2 ? ctx.lineTo(x(i), y(v)) : (ctx.moveTo(x(i), y(v)), (s2 = true)); }); ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
      }
      if (bb) {
        ctx.fillStyle = css('--brand'); ctx.globalAlpha = 0.07; ctx.beginPath(); let st0 = -1;
        bb.forEach((b, i) => { if (!b) return; if (st0 < 0) { st0 = i; ctx.moveTo(x(i), y(b.u)); } else ctx.lineTo(x(i), y(b.u)); });
        for (let i = bb.length - 1; i >= 0; i--) if (bb[i]) ctx.lineTo(x(i), y(bb[i].l));
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        for (const key of ['u', 'l']) { ctx.strokeStyle = '#7FB3FF'; ctx.lineWidth = 1; ctx.beginPath(); let s2 = false; bb.forEach((b, i) => { if (!b) return; s2 ? ctx.lineTo(x(i), y(b[key])) : (ctx.moveTo(x(i), y(b[key])), (s2 = true)); }); ctx.stroke(); }
      }
      // candles
      data.forEach((k, i) => {
        const c = k.c > k.o ? up : k.c < k.o ? down : t2; ctx.strokeStyle = c; ctx.fillStyle = c;
        const xx = Math.round(x(i)) + 0.5; ctx.beginPath(); ctx.moveTo(xx, y(k.h)); ctx.lineTo(xx, y(k.l)); ctx.stroke();
        const top = y(Math.max(k.o, k.c)), bot = y(Math.min(k.o, k.c)); ctx.fillRect(x(i) - bw / 2, top, bw, Math.max(1, bot - top));
      });
      // MA
      const mcol = { 5: '#F5B94A', 7: '#F5B94A', 20: css('--brand'), 25: css('--brand'), 60: '#B48CFF', 99: '#B48CFF', 120: '#5BC0DE' };
      for (const m of MAS) { ctx.strokeStyle = mcol[m]; ctx.lineWidth = 1.2; ctx.beginPath(); let s = false; mas[m].forEach((v, i) => { if (v == null) return; s ? ctx.lineTo(x(i), y(v)) : (ctx.moveTo(x(i), y(v)), (s = true)); }); ctx.stroke(); }
      ctx.lineWidth = 1;
      // 리딩 라인 (진입/목표/손절)
      for (const L of st.lines) {
        if (!L.price) continue; const yy = Math.round(y(L.price)) + 0.5;
        ctx.setLineDash([4, 4]); ctx.strokeStyle = L.color; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(pw, yy); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = L.color; ctx.fillRect(pw, yy - 9, padR, 18); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = font(10, 700); ctx.fillText(L.label, pw + 4, yy);
      }
      // 그리기 도구 (수평선·추세선) — 시각(t) 기준으로 저장되어 확대·이동해도 유지
      const xOfT = (t) => { let lo2 = 0, hi2 = data.length - 1; if (!data.length) return -1; if (t <= data[0].t) return x(0) - (data[0].t - t) / ((data[1] ? data[1].t - data[0].t : 1) || 1) * cw; while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; if (data[m].t < t) lo2 = m + 1; else hi2 = m; } return x(lo2); };
      for (const D of st.draws || []) {
        ctx.save(); ctx.strokeStyle = D.c || '#F5B94A'; ctx.lineWidth = 1.4;
        if (D.k === 'h') { const yy = Math.round(y(D.p)) + 0.5; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(pw, yy); ctx.stroke(); ctx.fillStyle = D.c || '#F5B94A'; ctx.fillRect(pw, yy - 9, padR, 18); ctx.fillStyle = '#101216'; ctx.font = font(10, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(nice(D.p, st.ccy), pw + 4, yy); }
        else if (D.k === 't') { const x1 = xOfT(D.t1), x2 = xOfT(D.t2); const y1 = y(D.p1), y2 = y(D.p2); const sl = (y2 - y1) / ((x2 - x1) || 1); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(pw, y1 + sl * (pw - x1)); ctx.stroke(); ctx.fillStyle = D.c || '#F5B94A'; [[x1, y1], [x2, y2]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(a, b, 3, 0, Math.PI * 2); ctx.fill(); }); }
        ctx.restore();
      }
      if (st._pend) { ctx.fillStyle = '#F5B94A'; const px1 = xOfT(st._pend.t), py1 = y(st._pend.p); ctx.beginPath(); ctx.arc(px1, py1, 4, 0, Math.PI * 2); ctx.fill(); }
      // 현재가 라벨
      const last = data[data.length - 1]; const ly = Math.round(y(last.c)) + 0.5; const lc = last.c >= (data[data.length - 2] || last).c ? up : down;
      ctx.setLineDash([2, 3]); ctx.strokeStyle = lc; ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(pw, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = lc; ctx.fillRect(pw, ly - 10, padR, 20); ctx.fillStyle = '#fff'; ctx.font = font(11, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(nice(last.c, st.ccy), pw + 6, ly);
      // 크로스헤어
      const hv = st.hover >= 0 && st.hover < n ? data[st.hover] : last; const hi_ = st.hover >= 0 && st.hover < n ? st.hover : n - 1;
      if (st.hover >= 0 && st.hover < n) {
        ctx.strokeStyle = t3; ctx.setLineDash([3, 3]); const xx = Math.round(x(st.hover)) + 0.5; ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, h - padB); ctx.stroke();
        if (st.my != null && st.my < padT + ph) { ctx.beginPath(); ctx.moveTo(0, st.my); ctx.lineTo(pw, st.my); ctx.stroke(); const pv = hi - ((st.my - padT) / ph) * (hi - lo); ctx.setLineDash([]); ctx.fillStyle = txt; ctx.fillRect(pw, st.my - 9, padR, 18); ctx.fillStyle = bg; ctx.font = font(10, 700); ctx.fillText(nice(pv, st.ccy), pw + 6, st.my); }
        ctx.setLineDash([]);
      }
      if (st.tip) {
        const chg = hv.c - (data[hi_ - 1] || hv).c;
        st.tip.innerHTML = `<span>${fmtT(hv.t, st.tf === 'm' ? 'm' : 'D')}${st.tf === 'm' ? '' : ''}</span><span>시 <b>${nice(hv.o, st.ccy)}</b></span><span>고 <b class="up">${nice(hv.h, st.ccy)}</b></span><span>저 <b class="down">${nice(hv.l, st.ccy)}</b></span><span>종 <b class="${U.cls(chg)}">${nice(hv.c, st.ccy)}</b></span><span>량 <b>${U.compact(hv.v)}</b></span>${MAS.map((m) => `<span style="color:${mcol[m]}">MA${m}</span>`).join('')}${bb ? '<span style="color:#7FB3FF">BB(20,2)</span>' : ''}`;
      }
      st._geom = { cw, n, pw, hi, lo, ph, padT, data };
    }
    // 인터랙션
    const pos = (e) => { const r = canvas.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
    let drag = null;
    canvas.addEventListener('mousemove', (e) => { const p = pos(e); if (drag) { const dx = p.x - drag.x; const sh = Math.round(dx / (st._geom ? st._geom.cw : 8)); if (sh) { st.offset = Math.max(0, Math.min(st.data.length - st.view, st.offset + sh)); drag.x = p.x; } } if (!st._geom) return; st.hover = p.x < st._geom.pw ? Math.floor(p.x / st._geom.cw) : -1; st.my = p.y; draw(); });
    canvas.addEventListener('mouseleave', () => { st.hover = -1; drag = null; draw(); });
    canvas.addEventListener('mousedown', (e) => { drag = pos(e); drag.x0 = drag.x; drag.y0 = drag.y; });
    // 그리기 모드: 클릭으로 수평선(1점)·추세선(2점) 추가
    const pick = (p) => { const g = st._geom; if (!g || p.x > g.pw || !g.data.length) return null; const i = Math.max(0, Math.min(g.data.length - 1, Math.floor(p.x / g.cw))); return { t: g.data[i].t, p: g.hi - ((p.y - g.padT) / g.ph) * (g.hi - g.lo) }; };
    canvas.addEventListener('click', (e) => {
      if (!st.drawMode) return; const p = pos(e); const k = pick(p); if (!k) return;
      if (st.drawMode === 'h') { st.draws = [...(st.draws || []), { k: 'h', p: k.p }]; st.onDraw && st.onDraw(st.draws); }
      else if (st.drawMode === 't') { if (!st._pend) st._pend = k; else { st.draws = [...(st.draws || []), { k: 't', t1: st._pend.t, p1: st._pend.p, t2: k.t, p2: k.p }]; st._pend = null; st.onDraw && st.onDraw(st.draws); } }
      draw();
    });
    window.addEventListener('mouseup', () => { drag = null; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); st.view = Math.max(20, Math.min(st.data.length, Math.round(st.view * (e.deltaY > 0 ? 1.12 : 0.89)))); st.offset = Math.min(st.offset, Math.max(0, st.data.length - st.view)); draw(); }, { passive: false });
    let tx = null;
    canvas.addEventListener('touchstart', (e) => { tx = pos(e).x; }, { passive: true });
    canvas.addEventListener('touchmove', (e) => { const p = pos(e); if (tx != null && st._geom) { const sh = Math.round((p.x - tx) / st._geom.cw); if (sh) { st.offset = Math.max(0, Math.min(st.data.length - st.view, st.offset + sh)); tx = p.x; } st.hover = Math.floor(p.x / st._geom.cw); draw(); } }, { passive: true });
    canvas.addEventListener('touchend', () => { tx = null; st.hover = -1; draw(); });
    const ro = new ResizeObserver(() => draw()); ro.observe(canvas);
    return { set(o) { Object.assign(st, o); draw(); }, draw, destroy() { ro.disconnect(); }, patch(px) { const L = st.data[st.data.length - 1]; if (!L || !isFinite(px) || L.c === px) return; L.c = px; if (px > L.h) L.h = px; if (px < L.l) L.l = px; draw(); } };
  }

  // 라인/영역 차트
  function line(canvas, { points, color, fill = true, labels, fmt = U.compact, base }) {
    const { ctx, w, h } = setup(canvas); ctx.clearRect(0, 0, w, h);
    if (!points || points.length < 2) { ctx.fillStyle = css('--text-3'); ctx.font = font(12); ctx.textAlign = 'center'; ctx.fillText('데이터가 쌓이면 그래프가 표시됩니다', w / 2, h / 2); return; }
    const padL = 6, padR = 58, padT = 10, padB = labels ? 22 : 8;
    const vals = points.map((p) => p[1]); let hi = Math.max(...vals, base ?? -Infinity), lo = Math.min(...vals, base ?? Infinity); const pd = (hi - lo) * 0.1 || hi * 0.02 || 1; hi += pd; lo -= pd;
    const x = (i) => padL + (i / (points.length - 1)) * (w - padL - padR); const y = (v) => padT + ((hi - v) / (hi - lo)) * (h - padT - padB);
    const col = color || css('--brand');
    ctx.strokeStyle = css('--chart-grid'); ctx.fillStyle = css('--text-3'); ctx.font = font(10); ctx.textBaseline = 'middle';
    for (let g = 0; g <= 3; g++) { const v = lo + ((hi - lo) * g) / 3; const yy = Math.round(y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke(); ctx.fillText(fmt(v), w - padR + 6, yy); }
    if (base != null) { ctx.setLineDash([3, 3]); ctx.strokeStyle = css('--text-3'); ctx.beginPath(); ctx.moveTo(padL, y(base)); ctx.lineTo(w - padR, y(base)); ctx.stroke(); ctx.setLineDash([]); }
    if (labels) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const step = Math.ceil(points.length / 6); for (let i = 0; i < points.length; i += step) ctx.fillText(points[i][0].slice(5).replace('-', '.'), x(i), h - padB + 6); }
    ctx.beginPath(); points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p[1])) : ctx.moveTo(x(i), y(p[1])))); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    if (fill) { ctx.lineTo(x(points.length - 1), h - padB); ctx.lineTo(x(0), h - padB); ctx.closePath(); const g = ctx.createLinearGradient(0, padT, 0, h - padB); g.addColorStop(0, col + '33'); g.addColorStop(1, col + '00'); ctx.fillStyle = g; ctx.fill(); }
    const lp = points[points.length - 1]; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x(points.length - 1), y(lp[1]), 3.5, 0, 7); ctx.fill();
  }
  function spark(canvas, vals, color) {
    const { ctx, w, h } = setup(canvas); ctx.clearRect(0, 0, w, h); if (vals.length < 2) return;
    const hi = Math.max(...vals), lo = Math.min(...vals); const x = (i) => (i / (vals.length - 1)) * w; const y = (v) => 2 + ((hi - v) / (hi - lo || 1)) * (h - 4);
    ctx.beginPath(); vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)))); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // 막대 (매수/매도 쌍)
  function bars(canvas, { labels, series }) {
    const { ctx, w, h } = setup(canvas); ctx.clearRect(0, 0, w, h);
    const padL = 6, padR = 58, padT = 10, padB = 24;
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const gw = (w - padL - padR) / labels.length; const bw = Math.min(16, (gw * 0.7) / series.length);
    ctx.strokeStyle = css('--chart-grid'); ctx.fillStyle = css('--text-3'); ctx.font = font(10); ctx.textBaseline = 'middle';
    for (let g = 0; g <= 3; g++) { const v = (max * g) / 3; const yy = Math.round(padT + (1 - g / 3) * (h - padT - padB)) + 0.5; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke(); ctx.fillText(U.compact(v), w - padR + 6, yy); }
    labels.forEach((lb, i) => {
      series.forEach((s, j) => { const v = s.values[i]; const bh = (v / max) * (h - padT - padB); ctx.fillStyle = s.color; ctx.fillRect(padL + gw * i + gw / 2 - (bw * series.length) / 2 + j * bw, h - padB - bh, bw - 2, bh); });
      ctx.fillStyle = css('--text-3'); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; if (labels.length <= 16 || i % 2 === 0) ctx.fillText(lb, padL + gw * i + gw / 2, h - padB + 6);
    });
  }
  return { candle, line, spark, bars, css };
})();
