// MAX라이프 주식 — 화면 보호: 캡처·인쇄·복사·소스 보기 억제, 접속자 워터마크
// 웹 브라우저에서는 캡처를 100% 막을 수 없으므로, 억제 + 화면 가림 + 누가 찍었는지 남는 워터마크로 대응합니다.
// PC 프로그램은 운영체제 수준 캡처 차단(setContentProtection)이 함께 적용됩니다.
(() => {
  const IS_APP = /MAXLifeHTS/i.test(navigator.userAgent);
  const editable = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const css = document.createElement('style');
  css.textContent = `
    body.g-noselect, body.g-noselect * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
    body.g-noselect input, body.g-noselect textarea, body.g-noselect [contenteditable] { -webkit-user-select: text; user-select: text; }
    img { -webkit-user-drag: none; }
    #gShield { position: fixed; inset: 0; z-index: 99999; background: #0b0d10; color: #9aa4b2; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 8px; font: 600 15px/1.6 'Pretendard Variable', Pretendard, sans-serif; text-align: center; padding: 20px; }
    #gShield b { color: #eef1f5; font-size: 18px; }
    body.g-blur #app { filter: blur(18px) saturate(.6); transition: filter .05s; }
    body.g-shield #gShield { display: flex; }
    #gMark { position: fixed; inset: 0; z-index: 9998; pointer-events: none; background-repeat: repeat; opacity: .07; mix-blend-mode: normal; }
    [data-theme="light"] #gMark { opacity: .06; }
    @media print { body * { display: none !important; } body::after { content: '이 화면은 인쇄할 수 없습니다.'; display: block !important; padding: 40px; font-size: 18px; } }`;
  document.head.appendChild(css);
  const ready = (f) => (document.body ? f() : document.addEventListener('DOMContentLoaded', f));
  ready(() => {
    document.body.classList.add('g-noselect');
    const sh = document.createElement('div'); sh.id = 'gShield'; sh.innerHTML = '<b>화면 보호 중</b><span>캡처·녹화가 제한된 화면입니다.<br>화면을 다시 누르면 돌아옵니다.</span>'; document.body.appendChild(sh);
    sh.addEventListener('click', () => unshield());
  });
  let shT = 0;
  function shield(ms) { document.body.classList.add('g-shield', 'g-blur'); clearTimeout(shT); if (ms) shT = setTimeout(unshield, ms); }
  function unshield() { document.body.classList.remove('g-shield', 'g-blur'); }
  const wipeClip = () => { try { navigator.clipboard && navigator.clipboard.writeText(' ').catch(() => {}); } catch {} };

  // 우클릭·드래그·복사 차단 (입력칸 제외)
  document.addEventListener('contextmenu', (e) => { if (!editable(e.target)) e.preventDefault(); }, true);
  document.addEventListener('dragstart', (e) => { if (!editable(e.target)) e.preventDefault(); }, true);
  ['copy', 'cut'].forEach((ev) => document.addEventListener(ev, (e) => { if (!editable(e.target)) { e.preventDefault(); } }, true));

  // 단축키: 개발자 도구·소스 보기·저장·인쇄·캡처
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase(); const c = e.ctrlKey || e.metaKey;
    const block = k === 'f12' || (c && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) || (c && e.altKey && ['i', 'j', 'c', 'u'].includes(k)) || (c && ['u', 's', 'p'].includes(k)) ||
      (e.metaKey && e.shiftKey && ['3', '4', '5', '6', 's'].includes(k)) || (e.key === 'PrintScreen');
    if (block) { e.preventDefault(); e.stopImmediatePropagation(); if (e.key === 'PrintScreen' || e.shiftKey) { wipeClip(); shield(2500); } }
  }, true);
  document.addEventListener('keyup', (e) => { if (e.key === 'PrintScreen') { wipeClip(); shield(2500); } }, true);

  // 캡처 도구가 창을 가져가면 (윈도우 캡처 도구, 맥 스크린샷 등) 화면 가림
  let blurOn = true;
  if (!IS_APP) {
    window.addEventListener('blur', () => { if (blurOn && !document.querySelector('iframe:focus')) document.body.classList.add('g-blur'); });
    window.addEventListener('focus', () => document.body.classList.remove('g-blur'));
    document.addEventListener('visibilitychange', () => { if (blurOn && document.hidden) document.body.classList.add('g-blur'); });
  }

  // 접속자 워터마크 (닉네임·아이디 일부·시각) — 화면을 찍어도 누가 찍었는지 남음
  let markText = '';
  function drawMark() {
    if (!markText) return; let el = document.getElementById('gMark');
    if (!el) { el = document.createElement('div'); el.id = 'gMark'; document.body.appendChild(el); }
    const dark = document.documentElement.dataset.theme !== 'light';
    const cv = document.createElement('canvas'); cv.width = 340; cv.height = 200; const x = cv.getContext('2d');
    x.translate(170, 100); x.rotate(-0.42); x.textAlign = 'center'; x.fillStyle = dark ? '#ffffff' : '#000000';
    x.font = "700 15px 'Pretendard Variable', Pretendard, sans-serif"; x.fillText(markText, 0, -6);
    const d = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
    x.font = "500 12px 'Pretendard Variable', Pretendard, sans-serif"; x.fillText(d + ' KST', 0, 14);
    el.style.backgroundImage = `url(${cv.toDataURL()})`;
  }
  setInterval(drawMark, 60000);
  new MutationObserver(() => { drawMark(); const el = document.getElementById('gMark'); if (markText && !el) drawMark(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // 워터마크를 지우면 다시 그림
  setInterval(() => { if (markText && !document.getElementById('gMark')) drawMark(); }, 3000);

  window.MLSGuard = { mark(t) { markText = t; ready(drawMark); }, shield, unshield, IS_APP,
    apply(g) { g = g || {}; blurOn = g.blur !== false; if (g.mark === false) { markText = ''; const el = document.getElementById('gMark'); if (el) el.remove(); } } };
  // 콘솔 경고
  try { setTimeout(() => console.log('%c멈추세요!', 'color:#FF626B;font-size:32px;font-weight:800', '\n이 기능은 개발자용입니다. 누군가 여기에 무언가를 붙여넣으라고 했다면 계정 탈취 시도입니다.'), 1500); } catch {}
})();
