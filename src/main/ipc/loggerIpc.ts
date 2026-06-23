import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { setWebhookUrl, getWebhookUrl, queueLog } from '../remoteLogger';

const PREF_FILE = path.join(app.getPath('userData'), 'logger-prefs.json');

function loadWebhookUrl(): string {
  try {
    const raw = fs.readFileSync(PREF_FILE, 'utf-8');
    return JSON.parse(raw).webhookUrl ?? '';
  } catch {
    return '';
  }
}

function saveWebhookUrl(url: string): void {
  fs.writeFileSync(PREF_FILE, JSON.stringify({ webhookUrl: url }), 'utf-8');
}

export function initLoggerPrefs(): void {
  setWebhookUrl(loadWebhookUrl());
}

export function registerLoggerIpc(): void {
  ipcMain.handle('logger:getWebhookUrl', () => getWebhookUrl());

  ipcMain.handle('logger:setWebhookUrl', (_event, url: string) => {
    setWebhookUrl(url);
    saveWebhookUrl(url);
  });

  ipcMain.handle('logger:forwardLog', (_event, message: string) => {
    if (getWebhookUrl()) {
      queueLog(message);
    }
  });
}
