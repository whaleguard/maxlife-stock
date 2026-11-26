// MAX라이프 주식 — PC 프로그램 (웹 버전과 같은 서버·계좌를 사용)
const { app, BrowserWindow, Menu, Tray, shell, nativeImage, Notification, ipcMain, session } = require('electron');
const path = require('path');

const SITE = 'https://whaleguard.github.io/maxlife-stock/';
const ADMIN = SITE + 'admin.html';
const UA_TAG = ' MAXLifeHTS/' + app.getVersion();
let tray = null; let quitting = false; const wins = new Set();

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { const w = [...wins][0]; if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } else createWindow(); });
app.setAppUserModelId('kr.goraedeung.maxlifestock');

function createWindow(url = SITE, opts = {}) {
  const w = new BrowserWindow({
    width: opts.width || 1480, height: opts.height || 920, minWidth: 380, minHeight: 600,
    backgroundColor: '#101216', title: 'MAX라이프 주식', icon: path.join(__dirname, 'build/icon.png'), show: false,
    autoHideMenuBar: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false, devTools: !app.isPackaged, sandbox: true },
  });
  // 화면 보호: 운영체제 캡처·녹화·화면 공유에 창 내용이 검게 나옴 (윈도우 10 2004+ / macOS)
  w.setContentProtection(true);
  w.webContents.setUserAgent(w.webContents.getUserAgent() + UA_TAG);
  w.loadURL(url);
  w.once('ready-to-show', () => w.show());
  // 외부 링크는 기본 브라우저로
  w.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith(SITE)) { createWindow(u, { width: 1100, height: 820 }); return { action: 'deny' }; }
    shell.openExternal(u); return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, u) => { if (!u.startsWith(SITE)) { e.preventDefault(); shell.openExternal(u); } });
  w.webContents.on('did-fail-load', (e, code, desc, failedUrl, isMain) => { if (isMain && code !== -3) w.loadFile(path.join(__dirname, 'offline.html'), { query: { u: failedUrl || url } }); });
  w.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F5' || ((i.control || i.meta) && i.key.toLowerCase() === 'r')) { e.preventDefault(); w.webContents.reload(); }
    if (i.key === 'F11') { e.preventDefault(); w.setFullScreen(!w.isFullScreen()); }
    // 개발자 도구·소스 보기·저장·인쇄 차단
    const k = (i.key || '').toLowerCase(); const c = i.control || i.meta;
    if (k === 'f12' || (c && i.shift && ['i', 'j', 'c'].includes(k)) || (c && ['u', 's', 'p'].includes(k))) { e.preventDefault(); if (!app.isPackaged && k === 'f12' && i.shift) w.webContents.toggleDevTools(); }
  });
  // 마지막 창은 닫아도 트레이에 남김
  w.on('close', (e) => { if (!quitting && wins.size === 1 && tray) { e.preventDefault(); w.hide(); notify('MAX라이프 주식', '트레이에서 계속 실행 중입니다. 체결·알림을 계속 받습니다.'); } });
  w.webContents.on('devtools-opened', () => { if (app.isPackaged) w.webContents.closeDevTools(); });
  w.on('closed', () => wins.delete(w));
  wins.add(w);
  return w;
}

function notify(title, body) { try { if (Notification.isSupported()) new Notification({ title, body, icon: path.join(__dirname, 'build/icon.png') }).show(); } catch {} }
function focused() { return BrowserWindow.getFocusedWindow() || [...wins][0]; }
function go(hash) { const w = focused() || createWindow(); w.show(); w.loadURL(SITE + 'index.html' + hash); }

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: '파일', submenu: [
      { label: '새 창', accelerator: 'CmdOrCtrl+N', click: () => createWindow(focused() ? focused().webContents.getURL() : SITE, { width: 1200, height: 820 }) },
      { label: '주문 창 열기', accelerator: 'CmdOrCtrl+Shift+O', click: () => createWindow(SITE + 'index.html#/stock/005930', { width: 1200, height: 860 }) },
      { label: '관리자 화면', click: () => createWindow(ADMIN) },
      { type: 'separator' },
      { label: '창 닫기', accelerator: 'CmdOrCtrl+W', role: 'close' },
      { label: '프로그램 종료', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit(); } },
    ] },
    { label: '이동', submenu: [
      ['홈', '#/home', 'Alt+1'], ['시세·순위', '#/market', 'Alt+2'], ['조건검색', '#/screen', 'Alt+3'], ['관심종목', '#/watch', 'Alt+4'],
      ['잔고', '#/balance', 'Alt+6'], ['거래내역', '#/history', 'Alt+7'], ['입출금', '#/cash', 'Alt+8'], ['MAX 버프', '#/buff', 'Alt+9'], ['AI 분석', '#/ai', null], ['코인 선물', '#/futures/BTC', null], ['스테이킹', '#/staking', null], ['이벤트·투자 대회', '#/events', null], ['이용 가이드', '#/guide', null], ['마이페이지', '#/my', 'Alt+0'],
    ].map(([label, h, acc]) => ({ label, ...(acc ? { accelerator: acc, registerAccelerator: false } : {}), click: () => go(h) })) },
    { label: '보기', submenu: [
      { label: '새로고침', accelerator: 'CmdOrCtrl+R', click: () => focused() && focused().webContents.reload() },
      { type: 'separator' },
      { label: '원래 크기', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' }, { label: '확대', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' }, { label: '축소', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { type: 'separator' }, { label: '전체 화면', accelerator: 'F11', role: 'togglefullscreen' },
      { label: '항상 위에 표시', type: 'checkbox', click: (m) => focused() && focused().setAlwaysOnTop(m.checked) },
    ] },
    { label: '도움말', submenu: [
      { label: '단축키 안내', accelerator: 'F1', registerAccelerator: false, click: () => focused() && focused().webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F1' }) },
      { label: '고객센터', click: () => go('#/help') },
      { label: '업데이트 확인', click: () => checkUpdate(true) },
      { label: `버전 ${app.getVersion()}`, enabled: false },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function buildTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build/tray.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createFromPath(path.join(__dirname, 'build/icon.png')).resize({ width: 16, height: 16 }) : img);
  tray.setToolTip('MAX라이프 주식');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '열기', click: () => { const w = [...wins][0] || createWindow(); w.show(); w.focus(); } },
    { label: '새 창', click: () => createWindow() },
    { type: 'separator' },
    { label: '종료', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { const w = [...wins][0] || createWindow(); w.isVisible() ? w.focus() : w.show(); });
}

let updater = null;
function checkUpdate(manual) {
  try {
    if (!updater) { updater = require('electron-updater').autoUpdater; updater.autoDownload = true;
      updater.on('update-downloaded', (i) => notify('업데이트 준비 완료', `새 버전 ${i.version}이 내려받아졌습니다. 프로그램을 다시 시작하면 적용됩니다.`));
      updater.on('update-not-available', () => { if (updater._manual) notify('최신 버전입니다', `현재 버전 ${app.getVersion()}`); });
      updater.on('error', () => { if (updater._manual) notify('업데이트 확인 실패', '인터넷 연결을 확인해 주세요.'); });
    }
    updater._manual = !!manual; updater.checkForUpdatesAndNotify();
  } catch {}
}

ipcMain.handle('mls:notify', (e, t, b) => { notify(String(t || ''), String(b || '')); return true; });
ipcMain.handle('mls:badge', (e, n) => { try { app.setBadgeCount(Number(n) || 0); } catch {} if (tray) tray.setToolTip(n ? `MAX라이프 주식 · 알림 ${n}건` : 'MAX라이프 주식'); return true; });
ipcMain.handle('mls:newWindow', (e, hash) => { createWindow(SITE + 'index.html' + (hash || ''), { width: 1200, height: 820 }); return true; });

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['notifications', 'clipboard-sanitized-write', 'media'].includes(perm)));
  buildMenu(); buildTray(); createWindow();
  setTimeout(() => checkUpdate(false), 8000);
  setInterval(() => checkUpdate(false), 6 * 3600 * 1000);
});
app.on('before-quit', () => { quitting = true; });
app.on('activate', () => { const w = [...wins][0]; if (w) w.show(); else createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
