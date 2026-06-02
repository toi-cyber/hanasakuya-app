import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface LicenseCredentials {
  key: string;
  clientSecret: string;
}

const STORE_FILE = path.join(app.getPath('userData'), 'license.enc');

export function saveCredentials(creds: LicenseCredentials): void {
  const encrypted = safeStorage.encryptString(JSON.stringify(creds));
  fs.writeFileSync(STORE_FILE, encrypted);
}

export function loadCredentials(): LicenseCredentials | null {
  if (!fs.existsSync(STORE_FILE)) return null;
  try {
    const encrypted = fs.readFileSync(STORE_FILE);
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
}

export function hasCredentials(): boolean {
  return fs.existsSync(STORE_FILE);
}
