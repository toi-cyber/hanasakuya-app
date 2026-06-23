import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { setRemoteLoggingEnabled, getRemoteLoggingEnabled } from '../remoteLogger';

const PREF_FILE = path.join(app.getPath('userData'), 'logger-prefs.json');

function loadPref(): boolean {
  try {
    const raw = fs.readFileSync(PREF_FILE, 'utf-8');
    return JSON.parse(raw).remoteLogging === true;
  } catch {
    return false;
  }
}

function savePref(enabled: boolean): void {
  fs.writeFileSync(PREF_FILE, JSON.stringify({ remoteLogging: enabled }), 'utf-8');
}

export function initLoggerPrefs(): void {
  const enabled = loadPref();
  setRemoteLoggingEnabled(enabled);
}

export function registerLoggerIpc(): void {
  ipcMain.handle('logger:getEnabled', () => getRemoteLoggingEnabled());

  ipcMain.handle('logger:setEnabled', (_event, enabled: boolean) => {
    setRemoteLoggingEnabled(enabled);
    savePref(enabled);
  });
}
