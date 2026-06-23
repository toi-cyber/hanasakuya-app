import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  setRemoteLoggingEnabled,
  getRemoteLoggingEnabled,
  setWebhookUrl,
  getWebhookUrl,
  queueLog,
} from '../remoteLogger';

const PREF_FILE = path.join(app.getPath('userData'), 'logger-prefs.json');

interface LoggerPrefs {
  remoteLogging: boolean;
  webhookUrl: string;
}

function loadPrefs(): LoggerPrefs {
  try {
    const raw = fs.readFileSync(PREF_FILE, 'utf-8');
    const json = JSON.parse(raw);
    return {
      remoteLogging: json.remoteLogging === true,
      webhookUrl: json.webhookUrl ?? '',
    };
  } catch {
    return { remoteLogging: false, webhookUrl: '' };
  }
}

function savePrefs(prefs: Partial<LoggerPrefs>): void {
  const current = loadPrefs();
  fs.writeFileSync(PREF_FILE, JSON.stringify({ ...current, ...prefs }), 'utf-8');
}

export function initLoggerPrefs(): void {
  const prefs = loadPrefs();
  setRemoteLoggingEnabled(prefs.remoteLogging);
  setWebhookUrl(prefs.webhookUrl);
}

export function registerLoggerIpc(): void {
  ipcMain.handle('logger:getEnabled', () => getRemoteLoggingEnabled());

  ipcMain.handle('logger:setEnabled', (_event, enabled: boolean) => {
    setRemoteLoggingEnabled(enabled);
    savePrefs({ remoteLogging: enabled });
  });

  ipcMain.handle('logger:getWebhookUrl', () => getWebhookUrl());

  ipcMain.handle('logger:setWebhookUrl', (_event, url: string) => {
    setWebhookUrl(url);
    savePrefs({ webhookUrl: url });
  });

  ipcMain.handle('logger:forwardLog', (_event, message: string) => {
    if (getRemoteLoggingEnabled()) {
      queueLog(message);
    }
  });
}
