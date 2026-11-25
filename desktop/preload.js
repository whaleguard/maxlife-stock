// 웹 화면에서 쓰는 PC 프로그램 기능 (알림·배지·새 창)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mlsApp', {
  isApp: true,
  notify: (title, body) => ipcRenderer.invoke('mls:notify', title, body),
  badge: (n) => ipcRenderer.invoke('mls:badge', n),
  newWindow: (hash) => ipcRenderer.invoke('mls:newWindow', hash),
});
