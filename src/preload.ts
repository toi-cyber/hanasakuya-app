import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('license', {
  getStatus: () =>
    ipcRenderer.invoke('license:getStatus'),
  register: (key: string, clientSecret: string) =>
    ipcRenderer.invoke('license:register', { key, clientSecret }),
  clear: () =>
    ipcRenderer.invoke('license:clear'),
});

contextBridge.exposeInMainWorld('logger', {
  getEnabled: () => ipcRenderer.invoke('logger:getEnabled'),
  setEnabled: (enabled: boolean) => ipcRenderer.invoke('logger:setEnabled', enabled),
  getWebhookUrl: () => ipcRenderer.invoke('logger:getWebhookUrl'),
  setWebhookUrl: (url: string) => ipcRenderer.invoke('logger:setWebhookUrl', url),
  forwardLog: (message: string) => ipcRenderer.invoke('logger:forwardLog', message),
});

contextBridge.exposeInMainWorld('coreApi', {
  send: (cmd: Record<string, unknown>) => ipcRenderer.send('core-command', cmd),
  onEvent: (callback: (event: unknown) => void) => {
    ipcRenderer.on('core-event', (_event, data) => callback(data));
  },
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  openVideoDialog: () => ipcRenderer.invoke('dialog-open-video'),
  saveVideoDialog: () => ipcRenderer.invoke('dialog-save-video'),
  checkForUpdate: () => ipcRenderer.send('check-for-update'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  // Windows カメラ許可取得（getUserMedia でOS許可ダイアログを出す）
  requestCameraPermission: async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch {
      return false;
    }
  },
});
