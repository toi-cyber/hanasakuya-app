import { net } from 'electron';
import type { CoreEvent } from './coreProcess';

const SERVER_URL = 'https://application.hanakuya.ai/log.php'; // TODO: 本番URLに変更
const LOG_TOKEN  = 'log-token';          // TODO: log.php の EXPECTED_TOKEN と一致させる

function post(payload: object): void {
  try {
    const req = net.request({ method: 'POST', url: SERVER_URL });
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('X-Hanasakuya-Log-Token', LOG_TOKEN);
    req.on('error', () => {});
    req.write(JSON.stringify(payload));
    req.end();
  } catch {
    // ネットワーク不可時も本体処理に影響させない
  }
}

// --- log: 3秒バッチ送信 ---
let logBuffer: string[] = [];
let logTimer: ReturnType<typeof setTimeout> | null = null;

function flushLogs(): void {
  if (logBuffer.length === 0) return;
  post({ level: 'log', messages: logBuffer, timestamp: new Date().toISOString() });
  logBuffer = [];
  logTimer = null;
}

function queueLog(message: string): void {
  logBuffer.push(message);
  if (!logTimer) {
    logTimer = setTimeout(flushLogs, 3000);
  }
}

// --- detection: 60秒集計送信 ---
let stats = { frames: 0, totalDetections: 0, totalInferenceMs: 0 };
let detectionTimer: ReturnType<typeof setInterval> | null = null;

function flushDetection(): void {
  if (stats.frames === 0) return;
  post({
    level: 'detection',
    frames: stats.frames,
    totalDetections: stats.totalDetections,
    avgInferenceMs: Math.round(stats.totalInferenceMs / stats.frames),
    timestamp: new Date().toISOString(),
  });
  stats = { frames: 0, totalDetections: 0, totalInferenceMs: 0 };
}

function startDetectionTimer(): void {
  if (detectionTimer) return;
  detectionTimer = setInterval(flushDetection, 60_000);
}

function stopDetectionTimer(): void {
  if (!detectionTimer) return;
  clearInterval(detectionTimer);
  detectionTimer = null;
  flushDetection(); // 停止時に残分を送信
}

// --- ログ送信の有効/無効 ---
let remoteLoggingEnabled = false;

export function setRemoteLoggingEnabled(value: boolean): void {
  remoteLoggingEnabled = value;
}

export function getRemoteLoggingEnabled(): boolean {
  return remoteLoggingEnabled;
}

// --- 公開API ---
export function forwardToRemote(event: CoreEvent): void {
  if (!remoteLoggingEnabled) return;
  switch (event.event) {
    case 'log':
      queueLog(event.message as string);
      break;

    case 'error':
      post({ level: 'error', message: event.message, timestamp: new Date().toISOString() });
      break;

    case 'detection':
      startDetectionTimer();
      stats.frames++;
      stats.totalDetections += (event.count as number) ?? 0;
      stats.totalInferenceMs += (event.inference_ms as number) ?? 0;
      break;

    case 'stopped':
      stopDetectionTimer();
      break;
  }
}
