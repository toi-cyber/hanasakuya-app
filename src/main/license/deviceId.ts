import { app } from 'electron';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const DEVICE_ID_FILE = path.join(app.getPath('userData'), 'device.id');

export function getDeviceId(): string {
  if (fs.existsSync(DEVICE_ID_FILE)) {
    return fs.readFileSync(DEVICE_ID_FILE, 'utf-8').trim();
  }
  const id = randomUUID();
  fs.writeFileSync(DEVICE_ID_FILE, id, 'utf-8');
  return id;
}
