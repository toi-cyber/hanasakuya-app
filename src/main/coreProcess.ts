import { spawn, ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';

export interface DetectionBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

export interface CoreEvent {
  event: string;
  [key: string]: unknown;
}

type EventCallback = (event: CoreEvent) => void;

const isDev = !!process.env.MAIN_WINDOW_VITE_DEV_SERVER_URL || process.argv.includes('--dev') || process.defaultApp;

export class CoreProcess {
  private process: ChildProcess | null = null;
  private listeners: EventCallback[] = [];

  start(corePath?: string): void {
    const execPath = corePath ?? this.findCoreBinary();
    const ortPath = this.findOrtLibrary();

    console.log(`[CoreProcess] Binary: ${execPath}`);
    console.log(`[CoreProcess] ORT: ${ortPath}`);

    this.process = spawn(execPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: isDev ? path.join(__dirname, '../..') : path.dirname(execPath),
      env: {
        ...process.env,
        ORT_DYLIB_PATH: ortPath,
      },
    });

    const rl = readline.createInterface({
      input: this.process.stdout!,
    });

    rl.on('line', (line: string) => {
      try {
        const event = JSON.parse(line) as CoreEvent;
        this.listeners.forEach((cb) => cb(event));
      } catch {
        console.error('[CoreProcess] Invalid JSON from core:', line.substring(0, 100));
      }
    });

    const stderrRl = readline.createInterface({ input: this.process.stderr! });
    stderrRl.on('line', (line: string) => {
      console.error('[CoreProcess stderr]', line);
      this.listeners.forEach((cb) => cb({ event: 'log', message: line }));
    });

    this.process.on('exit', (code) => {
      console.log(`[CoreProcess] exited with code ${code}`);
      this.process = null;
    });
  }

  send(cmd: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) {
      console.error('[CoreProcess] Not running');
      return;
    }
    const json = JSON.stringify(cmd) + '\n';
    this.process.stdin.write(json);
  }

  on(callback: EventCallback): void {
    this.listeners.push(callback);
  }

  stop(): void {
    if (this.process) {
      this.send({ cmd: 'stop' });
      setTimeout(() => {
        this.process?.kill();
        this.process = null;
      }, 1000);
    }
  }

  private findCoreBinary(): string {
    const binaryName = process.platform === 'win32' ? 'oocyte-core.exe' : 'oocyte-core';

    const candidates = isDev
      ? [
          path.join(__dirname, '../../../native-core/target/debug', binaryName),
          path.join(__dirname, '../../native-core/target/debug', binaryName),
          path.join(process.cwd(), 'native-core/target/debug', binaryName),
          path.join(process.cwd(), 'native-core/target/release', binaryName),
        ]
      : [
          path.join(process.resourcesPath, binaryName),
        ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        console.log(`[CoreProcess] Found core at: ${p}`);
        return p;
      }
    }

    console.error('[CoreProcess] Core binary not found! Tried:', candidates);
    return candidates[0];
  }

  private findOrtLibrary(): string {
    const libName = process.platform === 'win32' ? 'onnxruntime.dll' : 'libonnxruntime.dylib';

    const candidates = isDev
      ? [
          '/opt/homebrew/lib/libonnxruntime.dylib',
          'C:\\onnxruntime\\lib\\onnxruntime.dll',
        ]
      : [
          path.join(process.resourcesPath, 'lib', libName),
        ];

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return candidates[0];
  }
}
