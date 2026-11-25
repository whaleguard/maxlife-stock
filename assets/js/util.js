// 공통 유틸
const U = (() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const nf0 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const won = (v) => nf0.format(Math.round(v || 0)) + '원';
  const n0 = (v) => nf0.format(Math.round(v || 0));
  const n2 = (v) => nf2.format(v || 0);
  const usd = (v) => '$' + nf2.format(v || 0);
  const px = (v, ccy) => (ccy === 'USD' ? usd(v) : n0(v));
  const pxu = (v, ccy) => (ccy === 'USD' ? usd(v) : won(v));
  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const pct = (v) => sign(v) + Math.abs(v || 0).toFixed(2) + '%';
  const signed = (v, ccy) => sign(v) + (ccy === 'USD' ? usd(Math.abs(v)) : n0(Math.abs(v)));
  const signedWon = (v) => sign(v) + won(Math.abs(v));
  const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
  const compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e12) return (v / 1e12).toFixed(1) + '조';
    if (a >= 1e8) return (v / 1e8).toFixed(a >= 1e10 ? 0 : 1) + '억';
    if (a >= 1e4) return (v / 1e4).toFixed(0) + '만';
    return n0(v);
  };
  const two = (n) => String(n).padStart(2, '0');
  const dt = (t, withSec) => {
    const d = new Date(t);
    return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}${withSec ? ':' + two(d.getSeconds()) : ''}`;
  };
  const date = (t) => { const d = new Date(t); return `${d.getFullYear()}.${two(d.getMonth() + 1)}.${two(d.getDate())}`; };
  const time = (t) => { const d = new Date(t); return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`; };
  const ago = (t) => {
    const s = (Date.now() - new Date(t).getTime()) / 1000;
    if (s < 60) return '방금 전'; if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전'; if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전';
    return date(t);
  };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
  const mask = (name) => { const s = String(name || ''); if (s.length <= 1) return s; if (s.length === 2) return s[0] + '*'; return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1]; };

  // KRX 호가단위 (2023.01~ 코스피·코스닥 통일)
  const tickKR = (p) => (p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000);
  const tick = (p, ccy) => (ccy === 'USD' ? 0.01 : tickKR(p));
  const roundTick = (p, ccy, mode = 'round') => {
    if (ccy === 'USD') return Math.round(p * 100) / 100;
    const t = tickKR(p); const f = mode === 'floor' ? Math.floor : mode === 'ceil' ? Math.ceil : Math.round;
    return f(p / t) * t;
  };
  const stepPrice = (p, ccy, dir) => {
    if (ccy === 'USD') return Math.max(0.01, Math.round((p + dir * 0.01) * 100) / 100);
    if (dir > 0) return p + tickKR(p);
    const t = tickKR(p - 1); return Math.max(t, p - t);
  };

  async function sha256(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  // 시드 고정 난수 (샘플 차트 재현성)
  function rng(seed) {
    let h = 2166136261 >>> 0;
    for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Toast / Modal
  function toast(msg, err) {
    let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    for (const o of box.children) if (o.textContent === msg) { o.remove(); }
    const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 3200);
  }
  function modal({ title, body, foot, size, onMount }) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${size || ''}" role="dialog" aria-modal="true"><div class="modal-h"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="닫기">${ICON.x}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-x]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bg);
    onMount && onMount(bg.querySelector('.modal'), close);
    return close;
  }
  function confirmBox(title, html, okText = '확인', okCls = 'btn-brand') {
    return new Promise((res) => {
      let done = false;
      const close = modal({
        title, body: html, foot: `<button class="btn" data-no>취소</button><button class="btn ${okCls}" data-ok>${esc(okText)}</button>`,
        onMount: (m, c) => {
          m.querySelector('[data-no]').onclick = () => { done = true; c(); res(false); };
          m.querySelector('[data-ok]').onclick = () => { done = true; c(); res(true); };
        },
      });
      const obs = new MutationObserver(() => { if (!document.body.contains(document.querySelector('.modal-bg')) && !done) { done = true; res(false); obs.disconnect(); } });
      obs.observe(document.body, { childList: true });
    });
  }

  const ICON = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 9 12 4l9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18"/></svg>',
    lead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 12l3-3 2 2 3-3" stroke-linecap="round"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 20h8M10 17h4v3h-4z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0" stroke-linecap="round"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 5h18v11H3zM9 20h6M12 16v4"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg>',
  };

  // 로고 (GPT 디자인 시스템 컬러 기반)
  const LOGO_MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#101216"/><path d="M11 44L11 24L21 14L34 27L53 8L53 23L34 42L21 29L21 44Z" fill="#B7E77A"/><path d="M43 39L53 29L53 52L43 52Z" fill="#B7E77A"/></svg>`;
  const logo = (wm = true) => `<span class="logo">${LOGO_MARK}${wm ? `<span class="wm" style="font-weight:800;font-size:19px;letter-spacing:-0.04em;white-space:nowrap"><span style="font-weight:900;color:var(--brand)">MAX</span>라이프<span style="font-weight:600;font-size:17px;margin-left:5px">주식</span></span>` : ''}</span>`;

  const emitter = () => { const m = {}; return { on: (e, f) => ((m[e] = m[e] || []).push(f), () => (m[e] = m[e].filter((x) => x !== f))), emit: (e, d) => (m[e] || []).forEach((f) => f(d)) }; };

  return { $, $$, esc, uid, won, n0, n2, usd, px, pxu, pct, signed, signedWon, cls, compact, dt, date, time, ago, today, mask, tick, tickKR, roundTick, stepPrice, sha256, rng, toast, modal, confirmBox, ICON, LOGO_MARK, logo, emitter, two };
})();
