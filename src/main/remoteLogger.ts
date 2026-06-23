import { spawn } from 'child_process';
import type { CoreEvent } from './coreProcess';

let webhookUrl = '';

export function setWebhookUrl(url: string): void {
  webhookUrl = url;
}

export function getWebhookUrl(): string {
  return webhookUrl;
}

function postToSlack(text: string): void {
  if (!webhookUrl) return;
  try {
    spawn('curl', [
      '-X', 'POST',
      '-H', 'Content-type: application/json',
      '--data', JSON.stringify({ text }),
      webhookUrl,
    ], { stdio: 'ignore' });
  } catch {
    // curl が使えない環境でも本体処理に影響させない
  }
}

// --- log: 3秒バッチ送信 ---
let logBuffer: string[] = [];
let logTimer: ReturnType<typeof setTimeout> | null = null;

function flushLogs(): void {
  if (logBuffer.length === 0) return;
  postToSlack('```\n' + logBuffer.join('\n') + '\n```');
  logBuffer = [];
  logTimer = null;
}

export function queueLog(message: string): void {
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
  const avg = Math.round(stats.totalInferenceMs / stats.frames);
  postToSlack(
    `*[検出集計]* frames=${stats.frames} detections=${stats.totalDetections} avgInference=${avg}ms`
  );
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
  flushDetection();
}

// --- 公開API ---
export function forwardToRemote(event: CoreEvent): void {
  if (!webhookUrl) return;
  switch (event.event) {
    case 'log':
      queueLog(event.message as string);
      break;
    case 'error':
      postToSlack(`:warning: *[error]* ${event.message}`);
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
