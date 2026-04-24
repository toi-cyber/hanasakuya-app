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
    boxes: { x1: number; y1: number; x2: number; y2: number; confidence: number }[];
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

  // フレームを canvas → JPEG → Rust へ送信
  const captureFrame = useCallback(() => {
    if (!detectingRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setTimeout(captureFrame, 50);
      return;
    }

    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
    canvas.width = Math.round((video.videoWidth || maxWidth) * scale);
    canvas.height = Math.round((video.videoHeight || 480) * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const jpeg_base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
    window.coreApi.send({ cmd: 'infer_frame', jpeg_base64 });
  }, []);

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
          // 推論完了 → 次フレームをキャプチャ（推論速度でペーシング）
          captureFrame();
          break;
        }
        case 'stopped':
          setState((s) => ({ ...s, detecting: false }));
          break;
        case 'error':
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
    try {
      // getUserMedia でカメラ許可を取得（Windows カメラプライバシーダイアログをここで出す）
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // 許可拒否でも enumerateDevices は続ける
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          id: d.deviceId,
          name: d.label || `Camera ${i + 1}`,
        }));
      setState((s) => ({ ...s, cameras }));
    } catch {
      setState((s) => ({ ...s, cameras: [] }));
    }
  }, []);

  /** レンダラー getUserMedia でカメラを開く */
  const startDetection = useCallback(async (deviceId: string) => {
    detectingRef.current = true;
    fpsRef.current = { frames: 0, lastTime: Date.now(), fps: 0 };
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setState((s) => ({ ...s, detecting: true, error: null }));
      setTimeout(captureFrame, 200);
    } catch (e) {
      detectingRef.current = false;
      setState((s) => ({ ...s, error: `カメラエラー: ${e}`, detecting: false }));
    }
  }, [captureFrame]);

  const stopDetection = useCallback(() => {
    detectingRef.current = false;
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
    listCameras,
    startDetection,
    stopDetection,
    setThreshold,
    pickInputVideo,
    pickOutputPath,
    startVideoProcessing,
    stopVideoProcessing,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
  };
}
