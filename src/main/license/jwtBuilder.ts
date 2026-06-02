import * as jwt from 'jsonwebtoken';

export function buildJwt(
  licenseKey: string,
  deviceId: string,
  clientSecret: string
): string {
  return jwt.sign(
    { key: licenseKey, device_id: deviceId },
    clientSecret,
    { algorithm: 'HS256', expiresIn: '5m' }
  );
}
