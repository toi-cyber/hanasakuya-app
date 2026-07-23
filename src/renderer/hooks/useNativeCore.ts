import { useEffect, useState, useCallback, useRef } from 'react';

declare global {
  interface Window {
    coreApi: {
      send: (cmd: Record<string, unknown>) => void;
      onEvent: (callback: (event: any) => void) => void;
      rendererReady: () => void;
      openVideoDialog: () => Promise<string | null>;
      saveVideoDialog: () => Promise<string | null>;
      checkForUpdate: () => void;
      downloadUpdate: () => void;
      installUpdate: () => void;
      requestCameraPermission: () => Promise<boolean>;
    };
  }
}

interface VideoState {
  processing: boolean;
  currentFrame: number;
  totalFrames: number;
  inputPath: string | null;
  outputPath: string | null;
  completedOutputPath: string | null;
  error: string | null;
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  percent?: number;
  message?: string;
}

interface CoreState {
  ready: boolean;
  cameras: { id: string; name: string }[];
  detecting: boolean;
  lastDetection: {
    boxes: { x1: number; y1: number; x2: number; y2: number; confidence: number; track_id: number }[];
    count: number;
    inferenceMs: number;
    fps: number;
    frameJpeg: string | null;
  } | null;
  error: string | null;
  video: VideoState;
  update: UpdateState;
  logs: string[];
}

const initialVideoState: VideoState = {
  processing: false,
  currentFrame: 0,
  totalFrames: 0,
  inputPath: null,
  outputPath: null,
  completedOutputPath: null,
  error: null,
};

export function useNativeCore() {
  const [state, setState] = useState<CoreState>({
    ready: false,
    cameras: [],
    detecting: false,
    lastDetection: null,
    error: null,
    video: initialVideoState,
    update: { status: 'idle' },
    logs: [],
  });

  // カメラ関連 refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectingRef = useRef(false);
  const fpsRef = useRef({ frames: 0, lastTime: Date.now(), fps: 0 });
  // 設定 refs（captureFrame クロージャから参照）
  const jpegQualityRef = useRef(0.6);  // 0.0–1.0
  const inferSizeRef = useRef(640);    // 320 or 640
  // 推論中フラグ（フレームの多重送信を防ぐ）
  const inferPendingRef = useRef(false);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // null=未確認/再試行, false=drawImage使用, true=ImageCapture使用（GPUオーバーレイ対策）
  const useImageCaptureRef = useRef<boolean | null>(null);
  // 黒フレーム連続カウント（キャプチャーボードのGPUオーバーレイ検出用）
  const consecutiveBlackFramesRef = useRef(0);
  // 送信フレーム数カウント（診断ログ用）
  const framesSentRef = useRef(0);

  // レンダラー側ログをUIログビューアーへ追加
  const addLog = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    const line = `[${ts}] ${msg}`;
    setState((s) => ({ ...s, logs: [...s.logs.slice(-199), line] }));
    window.logger?.forwardLog(line);
  }, []);

  // フレームを canvas → JPEG → Rust へ送信（インターバルから呼ばれる）
  // キャプチャーボードのGPUオーバーレイ問題への対策:
  //   1. ImageCapture.grabFrame() を優先試行（1回の失敗で諦めない）
  //   2. キャプチャ後に黒フレーム検出 → 取得方法を自動切り替え
  const captureFrame = useCallback(async () => {
    if (!detectingRef.current) return;
    if (inferPendingRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) return;

    inferPendingRef.current = true;

    try {
      const maxWidth = inferSizeRef.current;
      const scale = Math.min(1, maxWidth / w);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) { inferPendingRef.current = false; return; }

      // ImageCapture.grabFrame() を試行（キャプチャーボードのGPUオーバーレイ対策）
      // 1回の例外で永久に諦めず、毎フレーム再試行する
      let usedGrabFrame = false;
      if (useImageCaptureRef.current !== false) {
        const track = streamRef.current?.getVideoTracks()[0];
        if (track && typeof ImageCapture !== 'undefined') {
          try {
            const bitmap = await new ImageCapture(track).grabFrame();
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            usedGrabFrame = true;
            if (useImageCaptureRef.current === null) {
              addLog('[フレーム] ImageCapture.grabFrame() 使用開始');
              useImageCaptureRef.current = true;
            }
          } catch {
            // 失敗しても null のまま → 次フレームで再試行
            console.log('[captureFrame] grabFrame failed, retrying next frame');
          }
        } else if (useImageCaptureRef.current === null) {
          useImageCaptureRef.current = false;
        }
      }

      if (!usedGrabFrame) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      // 黒フレーム検出: 32x32サンプルで平均輝度を計算
      // キャプチャーボードのGPUオーバーレイは真っ黒フレームを返すことがある
      const sample = ctx.getImageData(0, 0, Math.min(canvas.width, 32), Math.min(canvas.height, 32));
      let brightnessSum = 0;
      for (let i = 0; i < sample.data.length; i += 4) {
        brightnessSum += sample.data[i] + sample.data[i + 1] + sample.data[i + 2];
      }
      const meanBrightness = brightnessSum / (sample.data.length / 4 * 3);

      if (meanBrightness < 8) {
        consecutiveBlackFramesRef.current++;
        const method = usedGrabFrame ? 'grabFrame' : 'drawImage';
        // 最初の3回と30フレームごとに警告ログ
        if (consecutiveBlackFramesRef.current <= 3 || consecutiveBlackFramesRef.current % 30 === 0) {
          addLog(`[フレーム] 黒フレーム検出 (輝度=${meanBrightness.toFixed(1)}, ${method}) → 取得方法を切り替えます`);
        }
        // 取得方法を切り替えて次フレームで再試行
        useImageCaptureRef.current = usedGrabFrame ? false : null;
        inferPendingRef.current = false;
        return;
      }
      consecutiveBlackFramesRef.current = 0;

      const jpeg_base64 = canvas.toDataURL('image/jpeg', jpegQualityRef.current).split(',')[1];
      if (!jpeg_base64) { inferPendingRef.current = false; return; }

      framesSentRef.current++;
      if (framesSentRef.current <= 3 || framesSentRef.current % 50 === 0) {
        addLog(`[推論] フレーム送信 #${framesSentRef.current} (${canvas.width}x${canvas.height}, jpeg=${jpeg_base64.length}B, 輝度=${meanBrightness.toFixed(1)})`);
      }
      window.coreApi.send({ cmd: 'infer_frame', jpeg_base64 });
    } catch (e) {
      inferPendingRef.current = false;
      console.error('[captureFrame] Error:', e);
    }
  }, [addLog]);

  useEffect(() => {
    window.coreApi.onEvent((event: any) => {
      switch (event.event) {
        case 'ready':
          setState((s) => ({ ...s, ready: true }));
          break;
        case 'cameras':
          // Rust 側カメラ列挙は使わない（互換性のため残す）
          break;
        case 'detection': {
          // 推論完了 → 次フレーム送信可能
          inferPendingRef.current = false;
          if (framesSentRef.current <= 3 || framesSentRef.current % 50 === 0) {
            addLog(`[推論] 応答: 検出数=${event.count} 推論=${event.inference_ms}ms`);
          }
          // FPS をレンダラー側で計算
          const c = fpsRef.current;
          c.frames++;
          const elapsed = (Date.now() - c.lastTime) / 1000;
          if (elapsed >= 1.0) {
            c.fps = c.frames / elapsed;
            c.frames = 0;
            c.lastTime = Date.now();
          }
          setState((s) => ({
            ...s,
            detecting: detectingRef.current,
            lastDetection: {
              boxes: event.boxes,
              count: event.count,
              inferenceMs: event.inference_ms,
              fps: c.fps,
              frameJpeg: event.frame_jpeg || null,
            },
          }));
          break;
        }
        case 'stopped':
          setState((s) => ({ ...s, detecting: false }));
          break;
        case 'error':
          // 推論エラー時もフラグをリセット（解除しないとフレーム送信が永久に止まる）
          inferPendingRef.current = false;
          setState((s) => ({ ...s, error: event.message }));
          break;
        case 'video_progress':
          setState((s) => ({
            ...s,
            video: {
              ...s.video,
              processing: true,
              currentFrame: event.current_frame,
              totalFrames: event.total_frames,
            },
          }));
          break;
        case 'video_complete':
          setState((s) => ({
            ...s,
            video: {
              ...s.video,
              processing: false,
              completedOutputPath: event.output_path,
            },
          }));
          break;
        case 'video_error':
          setState((s) => ({
            ...s,
            video: { ...s.video, processing: false, error: event.message },
          }));
          break;
        case 'video_cancelled':
          setState((s) => ({
            ...s,
            video: { ...s.video, processing: false },
          }));
          break;
        case 'update':
          setState((s) => ({
            ...s,
            update: {
              status: event.status,
              version: event.version,
              percent: event.percent,
              message: event.message,
            },
          }));
          break;
        case 'log':
          setState((s) => ({
            ...s,
            logs: [...s.logs.slice(-199), event.message as string],
          }));
          break;
      }
    });

    window.coreApi.rendererReady();
  }, [captureFrame]);

  /** Web API でカメラを列挙（Windows カメラ許可ダイアログも内部で処理） */
  const listCameras = useCallback(async () => {
    addLog('[カメラ列挙] 開始...');

    // getUserMedia でカメラ許可を取得（Windows カメラプライバシーダイアログをここで出す）
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      addLog('[カメラ列挙] getUserMedia 成功 (カメラ許可取得済み)');
    } catch (e: any) {
      addLog(`[カメラ列挙] getUserMedia 失敗: ${e?.name}: ${e?.message}`);
      // 許可拒否でも enumerateDevices は続ける
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      addLog(`[カメラ列挙] enumerateDevices: ${devices.length} デバイス検出`);

      // 全デバイスをログ出力（診断用）
      devices.forEach((d, i) => {
        addLog(`[カメラ列挙]   [${i}] kind=${d.kind} label="${d.label}" id=${d.deviceId.slice(0, 12)}...`);
      });

      const cameras = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          id: d.deviceId,
          name: d.label || `Camera ${i + 1}`,
        }));

      addLog(`[カメラ列挙] videoinput: ${cameras.length} 台のカメラ`);
      cameras.forEach((c, i) => {
        addLog(`[カメラ列挙]   カメラ${i + 1}: "${c.name}"`);
      });

      setState((s) => ({ ...s, cameras }));
    } catch (e: any) {
      addLog(`[カメラ列挙] enumerateDevices 失敗: ${e?.name}: ${e?.message}`);
      setState((s) => ({ ...s, cameras: [] }));
    }
  }, [addLog]);

  /** レンダラー getUserMedia でカメラを開く */
  const startDetection = useCallback(async (deviceId: string) => {
    detectingRef.current = true;
    inferPendingRef.current = false;
    useImageCaptureRef.current = null; // キャプチャ方法を再確認（カメラ切り替え対応）
    fpsRef.current = { frames: 0, lastTime: Date.now(), fps: 0 };
    framesSentRef.current = 0;
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // 顕微鏡カメラなどで play() がハングするケースに備えてタイムアウトを設定
        await Promise.race([
          videoRef.current.play(),
          new Promise<void>((resolve) => setTimeout(resolve, 5000)),
        ]).catch(() => {});
      }

      setState((s) => ({ ...s, detecting: true, error: null }));

      // 100ms ごとにフレームを送る（推論中はスキップするので多重送信なし）
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = setInterval(captureFrame, 100);
    } catch (e) {
      detectingRef.current = false;
      setState((s) => ({ ...s, error: `カメラエラー: ${e}`, detecting: false }));
    }
  }, [captureFrame]);

  const stopDetection = useCallback(() => {
    detectingRef.current = false;
    inferPendingRef.current = false;
    useImageCaptureRef.current = null;
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState((s) => ({ ...s, detecting: false, lastDetection: null }));
  }, []);

  const setThreshold = useCallback((value: number) => {
    window.coreApi.send({ cmd: 'set_threshold', value });
  }, []);

  const setJpegQuality = useCallback((percent: number) => {
    jpegQualityRef.current = percent / 100;
  }, []);

  const setInferSize = useCallback((size: number) => {
    inferSizeRef.current = size;
  }, []);

  const pickInputVideo = useCallback(async () => {
    const path = await window.coreApi.openVideoDialog();
    if (path) {
      setState((s) => ({
        ...s,
        video: { ...s.video, inputPath: path, completedOutputPath: null, error: null },
      }));
    }
  }, []);

  const pickOutputPath = useCallback(async () => {
    const path = await window.coreApi.saveVideoDialog();
    if (path) {
      setState((s) => ({ ...s, video: { ...s.video, outputPath: path } }));
    }
  }, []);

  const startVideoProcessing = useCallback((confThreshold: number) => {
    setState((s) => {
      const { inputPath, outputPath } = s.video;
      if (!inputPath || !outputPath) return s;
      window.coreApi.send({
        cmd: 'process_video',
        input_path: inputPath,
        output_path: outputPath,
        conf_threshold: confThreshold,
      });
      return { ...s, video: { ...s.video, processing: true, completedOutputPath: null, error: null, currentFrame: 0 } };
    });
  }, []);

  const stopVideoProcessing = useCallback(() => {
    window.coreApi.send({ cmd: 'stop_video' });
  }, []);

  const checkForUpdate = useCallback(() => {
    window.coreApi.checkForUpdate();
  }, []);

  const downloadUpdate = useCallback(() => {
    window.coreApi.downloadUpdate();
  }, []);

  const installUpdate = useCallback(() => {
    window.coreApi.installUpdate();
  }, []);

  return {
    ...state,
    videoRef,
    canvasRef,
    addLog,
    listCameras,
    startDetection,
    stopDetection,
    setThreshold,
    setJpegQuality,
    setInferSize,
    pickInputVideo,
    pickOutputPath,
    startVideoProcessing,
    stopVideoProcessing,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
  };
}
