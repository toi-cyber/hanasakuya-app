import { ipcMain } from 'electron';
import {
  loadCredentials,
  saveCredentials,
  clearCredentials,
  hasCredentials,
} from '../license/licenseStore';
import { verifyLicense } from '../license/verifier';

export function registerLicenseIpc(): void {
  ipcMain.handle('license:getStatus', () => {
    const creds = loadCredentials();
    return {
      registered: hasCredentials(),
      key: creds?.key ?? null,
    };
  });

  ipcMain.handle(
    'license:register',
    async (_event, { key, clientSecret }: { key: string; clientSecret: string }) => {
      const result = await verifyLicense(key, clientSecret);
      if (result.valid) {
        saveCredentials({ key, clientSecret });
      }
      return result;
    }
  );

  ipcMain.handle('license:clear', () => {
    clearCredentials();
  });
}
