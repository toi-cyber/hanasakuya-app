import * as https from 'https';
import { getDeviceId } from './deviceId';
import { buildJwt } from './jwtBuilder';

const API_URL = 'https://plan.hanasakuya.ai/api/license/verify';

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  expires_at?: string | null;
}

export async function verifyLicense(
  key: string,
  clientSecret: string
): Promise<VerifyResult> {
  const token = buildJwt(key, getDeviceId(), clientSecret);

  return new Promise((resolve) => {
    const req = https.request(
      API_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as VerifyResult);
          } catch {
            resolve({ valid: false, reason: 'parse_error' });
          }
        });
      }
    );
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ valid: false, reason: 'network_error' });
    });
    req.on('error', () => resolve({ valid: false, reason: 'network_error' }));
    req.end();
  });
}
