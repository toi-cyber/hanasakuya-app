import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';

const STORE_FILE = path.join(app.getPath('userData'), 'webhook.json');

export function saveWebhookUrl(url: string): void {
  fs.writeFileSync(STORE_FILE, JSON.stringify({ url }), 'utf-8');
}

export function loadWebhookUrl(): string {
  if (!fs.existsSync(STORE_FILE)) return '';
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
    return data.url || '';
  } catch {
    return '';
  }
}

export async function sendLogsToSlack(webhookUrl: string, logs: string[], appVersion: string): Promise<void> {
  if (!webhookUrl) throw new Error('Webhook URL が未設定です');

  const hostname = os.hostname();
  const platform = `${os.platform()} ${os.release()}`;
  const header = `*hanasakuya-app ログ*\nPC: \`${hostname}\` | OS: \`${platform}\` | Version: \`v${appVersion}\``;
  const logText = logs.length > 0 ? logs.join('\n') : '(ログなし)';

  // Slack は 40,000 文字制限あり、余裕を持って切り詰め
  const maxLen = 3500;
  const trimmed = logText.length > maxLen
    ? `...(${logText.length - maxLen}文字省略)...\n` + logText.slice(-maxLen)
    : logText;

  const payload = JSON.stringify({
    text: `${header}\n\`\`\`\n${trimmed}\n\`\`\``,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode === 200) resolve();
      else reject(new Error(`Slack送信失敗: HTTP ${res.statusCode}`));
    });
    req.on('error', (e) => reject(new Error(`Slack送信エラー: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('Slack送信タイムアウト')); });
    req.write(payload);
    req.end();
  });
}
