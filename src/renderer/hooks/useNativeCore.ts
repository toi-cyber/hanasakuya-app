import { useEffect, useState, useCallback } from 'react';

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
  cameras: { id: number; name: string }[];
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
  });

  useEffect(() => {
    window.coreApi.onEvent((event: any) => {
      switch (event.event) {
        case 'ready':
          setState((s) => ({ ...s, ready: true }));
          break;
        case 'cameras':
          setState((s) => ({ ...s, cameras: event.devices }));
          break;
        case 'detection':
          setState((s) => ({
            ...s,
            detecting: true,
            lastDetection: {
              boxes: event.boxes,
              count: event.count,
              inferenceMs: event.inference_ms,
              fps: event.fps,
              frameJpeg: event.frame_jpeg || null,
            },
          }));
          break;
        case 'frame_ready':
          break;
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
      }
    });

    window.coreApi.rendererReady();
  }, []);

  const listCameras = useCallback(() => {
    window.coreApi.send({ cmd: 'list_cameras' });
  }, []);

  const startDetection = useCallback((deviceId: number) => {
    window.coreApi.send({ cmd: 'start', device_id: deviceId });
  }, []);

  const stopDetection = useCallback(() => {
    window.coreApi.send({ cmd: 'stop' });
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
