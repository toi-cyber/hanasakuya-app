import React, { useEffect, useState, useCallback, useRef } from 'react';
import DetectionOverlay from '../components/DetectionOverlay';
import { DEFAULT_SETTINGS, type Settings } from '../components/SettingsModal';
import { useNativeCore, type UpdateStatus } from '../hooks/useNativeCore';

export default function DetectionScreen() {
  const [imageSize, setImageSize] = useState({ width: 960, height: 540 });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [started, setStarted] = useState(false);
  const [activeTab, setActiveTab] = useState<'camera' | 'video'>('camera');
  const core = useNativeCore();

  const dark = settings.theme === 'dark';

  useEffect(() => {
    if (core.ready) {
      // Windows でカメラ許可ダイアログを出してから列挙
      window.coreApi.requestCameraPermission().finally(() => {
        // カメラ開放を待ってから OpenCV で列挙（Windows でカメラが即座に解放されない場合がある）
        setTimeout(() => core.listCameras(), 500);
      });
    }
  }, [core.ready]);

  const handleStart = () => {
    if (core.cameras.length > 0) {
      core.startDetection(settings.cameraId);
      setStarted(true);
    }
  };

  const handleStop = () => {
    core.stopDetection();
    setStarted(false);
  };

  const applySettings = (key: keyof Settings, value: number | string) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    if (key === 'cameraId' && started) {
      core.stopDetection();
      core.startDetection(value as number);
    }
    if (key === 'confidenceThreshold') {
      core.setThreshold((value as number) / 100);
    }
    if (key === 'jpegQuality') {
      window.coreApi.send({ cmd: 'set_jpeg_quality', value });
    }
    if (key === 'displayResolution') {
      window.coreApi.send({ cmd: 'set_display_resolution', value });
    }
  };

  const detection = core.lastDetection;
  const frameJpeg = detection?.frameJpeg;

  // テーマカラー
  const t = {
    bg: dark ? 'bg-[#1a1a1a]' : 'bg-gray-100',
    waitBg: dark ? 'bg-[#1a1a1a]' : 'bg-white',
    title: dark ? 'text-white' : 'text-gray-800',
    sub: dark ? 'text-gray-500' : 'text-gray-400',
    drawerBg: dark ? 'bg-[#242424]' : 'bg-white',
    drawerBorder: dark ? 'border-[#333]' : 'border-gray-200',
    drawerHeaderBorder: dark ? 'border-[#333]' : 'border-gray-100',
    drawerTitle: dark ? 'text-white' : 'text-gray-800',
    sectionTitle: 'text-sakura-500',
    label: dark ? 'text-gray-400' : 'text-gray-500',
    rangeHint: dark ? 'text-gray-600' : 'text-gray-400',
    inputBg: dark ? '#2a2a2a' : '#f9fafb',
    inputBorder: dark ? '#3a3a3a' : '#e5e7eb',
    inputColor: dark ? '#e5e7eb' : '#374151',
    chipBg: dark ? 'bg-black/50' : 'bg-white/80',
    chipValue: dark ? 'text-white' : 'text-gray-800',
    chipLabel: dark ? 'text-gray-400' : 'text-gray-500',
    selectStyle: {
      width: '100%',
      padding: '5px 10px',
      border: `1px solid ${dark ? '#3a3a3a' : '#e5e7eb'}`,
      borderRadius: '6px',
      fontSize: '13px',
      color: dark ? '#e5e7eb' : '#374151',
      background: dark ? '#2a2a2a' : '#f9fafb',
      outline: 'none',
    } as React.CSSProperties,
  };

  return (
    <div className={`h-screen w-screen flex ${t.bg} overflow-hidden`}>
      {/* Draggable title bar region */}
      <div
        className="absolute top-0 left-0 right-0 h-8 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Left sidebar */}
      <div className={`w-20 shrink-0 flex flex-col items-center ${dark ? 'bg-[#1a1a1a]' : 'bg-gray-100'}`}>
        {/* Space for traffic lights */}
        <div className="h-8 w-full shrink-0" />
        <div className="flex-1" />
        {/* Update button */}
        <UpdateButton
          update={core.update}
          onCheck={core.checkForUpdate}
          onDownload={core.downloadUpdate}
          onInstall={core.installUpdate}
          dark={dark}
        />
        {/* Version */}
        <div className={`mb-3 text-[10px] ${dark ? 'text-gray-600' : 'text-gray-400'} select-none`}>
          v{APP_VERSION}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 relative flex flex-col">
        {/* Tab bar */}
        <div className={`flex shrink-0 border-b ${t.drawerBorder} ${dark ? 'bg-[#1a1a1a]' : 'bg-gray-100'}`} style={{ marginTop: '32px' }}>
          <button
            onClick={() => setActiveTab('camera')}
            className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'camera'
                ? 'border-sakura-500 text-sakura-500'
                : `border-transparent ${dark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`
            }`}
          >
            カメラ検出
          </button>
          <button
            onClick={() => setActiveTab('video')}
            className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'video'
                ? 'border-sakura-500 text-sakura-500'
                : `border-transparent ${dark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`
            }`}
          >
            動画処理
          </button>
        </div>

        {/* Camera tab */}
        <div className={`flex-1 relative ${activeTab !== 'camera' ? 'hidden' : ''}`}>
        {!started ? (
          <div className={`absolute inset-0 flex flex-col items-center justify-center ${t.waitBg}`}>
            <div className="w-20 h-20 rounded-full bg-sakura-500 opacity-80 mb-6" />
<p className={`${t.sub} text-sm mb-8`}>
              {core.ready
                ? `${core.cameras.length} 台のカメラを検出`
                : 'コア起動中...'}
            </p>
            <button
              onClick={handleStart}
              disabled={!core.ready || core.cameras.length === 0}
              className="bg-sakura-500 hover:bg-sakura-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl px-10 py-4 text-lg font-semibold transition-colors"
            >
              検出を開始
            </button>
          </div>
        ) : (
          <>
            {frameJpeg ? (
              <img
                src={`data:image/jpeg;base64,${frameJpeg}`}
                alt="camera"
                className="absolute inset-0 w-full h-full object-cover"
                onLoad={(e) => {
                  const img = e.target as HTMLImageElement;
                  setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-4 border-sakura-200 border-t-sakura-500 animate-spin" />
              </div>
            )}
            {detection && detection.boxes.length > 0 && (
              <DetectionOverlay
                boxes={detection.boxes}
                width={imageSize.width}
                height={imageSize.height}
              />
            )}

            {/* Stats */}
            <div className="absolute top-4 right-4 flex flex-col gap-2">
              <StatChip label="検出" value={`${detection?.count ?? 0}`} highlight dark={dark} />
              <StatChip label="推論" value={`${detection?.inferenceMs ?? 0}ms`} dark={dark} />
              <StatChip label="FPS" value={`${(detection?.fps ?? 0).toFixed(1)}`} dark={dark} />
            </div>

            <button
              onClick={handleStop}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg px-6 py-2 text-sm font-medium transition-colors"
            >
              ⏸ 停止
            </button>
          </>
        )}

        {core.error && (
          <div className="absolute bottom-4 left-4 bg-red-500/80 text-white text-sm rounded-lg px-4 py-2 backdrop-blur-sm max-w-md">
            {core.error}
          </div>
        )}
        </div>

        {/* Video tab */}
        {activeTab === 'video' && (
          <div className="flex-1 relative">
            <VideoPanel core={core} settings={settings} dark={dark} t={t} />
          </div>
        )}
      </div>

      {/* Right drawer */}
      <div className={`w-64 ${t.drawerBg} border-l ${t.drawerBorder} flex flex-col overflow-y-auto`}>
        <div className={`px-5 py-4 border-b ${t.drawerHeaderBorder}`}>
          <h2 className={`text-base font-bold ${t.drawerTitle}`}>設定</h2>
        </div>

        <div className="px-5 py-4 space-y-5 text-sm flex-1">
          {/* カメラ */}
          <Section title="カメラ" dark={dark}>
            <Label text="デバイス" dark={dark}>
              <select
                value={settings.cameraId}
                onChange={(e) => applySettings('cameraId', parseInt(e.target.value))}
                style={t.selectStyle}
              >
                {core.cameras.length > 0 ? (
                  core.cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>{cam.name}</option>
                  ))
                ) : (
                  <option value={0}>カメラなし</option>
                )}
              </select>
            </Label>
          </Section>

          {/* 検出 */}
          <Section title="検出" dark={dark}>
            <Label text={`信頼度閾値: ${settings.confidenceThreshold}%`} dark={dark}>
              <input
                type="range"
                min={10} max={90} step={5}
                value={settings.confidenceThreshold}
                onChange={(e) => applySettings('confidenceThreshold', parseInt(e.target.value))}
                className="w-full accent-sakura-500"
              />
              <div className={`flex justify-between text-[10px] ${t.rangeHint} mt-0.5`}>
                <span>10%</span><span>90%</span>
              </div>
            </Label>
          </Section>

          {/* モデル */}
          <Section title="モデル" dark={dark}>
            <Label text="入力サイズ" dark={dark}>
              <select
                value={settings.inputSize}
                onChange={(e) => applySettings('inputSize', parseInt(e.target.value))}
                style={t.selectStyle}
              >
                <option value={320}>320x320 (高速)</option>
                <option value={640}>640x640 (標準)</option>
              </select>
            </Label>
          </Section>

          {/* 表示 */}
          <Section title="表示" dark={dark}>
            <Label text={`JPEG品質: ${settings.jpegQuality}%`} dark={dark}>
              <input
                type="range"
                min={20} max={95} step={5}
                value={settings.jpegQuality}
                onChange={(e) => applySettings('jpegQuality', parseInt(e.target.value))}
                className="w-full accent-sakura-500"
              />
              <div className={`flex justify-between text-[10px] ${t.rangeHint} mt-0.5`}>
                <span>高速</span><span>高画質</span>
              </div>
            </Label>
            <Label text="表示解像度" dark={dark}>
              <select
                value={settings.displayResolution}
                onChange={(e) => applySettings('displayResolution', parseInt(e.target.value))}
                style={t.selectStyle}
              >
                <option value={640}>640px (高速)</option>
                <option value={960}>960px (標準)</option>
                <option value={1280}>1280px (高画質)</option>
                <option value={1920}>1920px (フル)</option>
              </select>
            </Label>
            <Label text="テーマ" dark={dark}>
              <div className="flex gap-2">
                <button
                  onClick={() => applySettings('theme', 'light' as any)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    !dark
                      ? 'bg-sakura-500 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  ライト
                </button>
                <button
                  onClick={() => applySettings('theme', 'dark' as any)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    dark
                      ? 'bg-sakura-500 text-white'
                      : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                  }`}
                >
                  ダーク
                </button>
              </div>
            </Label>
          </Section>
        </div>
      </div>

    </div>
  );
}

function Section({ title, children, dark }: { title: string; children: React.ReactNode; dark: boolean }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-sakura-500 mb-2 uppercase tracking-wider">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Label({ text, children, dark }: { text: string; children: React.ReactNode; dark: boolean }) {
  return (
    <div>
      <label className={`block text-xs ${dark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>{text}</label>
      {children}
    </div>
  );
}

function StatChip({ label, value, highlight = false, dark }: { label: string; value: string; highlight?: boolean; dark: boolean }) {
  return (
    <div className={`${dark ? 'bg-black/50' : 'bg-white/80'} backdrop-blur-sm rounded-lg px-3 py-1.5 text-right min-w-20`}>
      <div className={`text-lg font-bold leading-tight ${highlight ? 'text-sakura-400' : dark ? 'text-white' : 'text-gray-800'}`}>
        {value}
      </div>
      <div className={`text-[10px] ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</div>
    </div>
  );
}

function UpdateButton({ update, onCheck, onDownload, onInstall, dark }: {
  update: { status: UpdateStatus; version?: string; percent?: number; message?: string };
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  dark: boolean;
}) {
  const s = update.status;
  const busy = s === 'checking' || s === 'downloading';
  const [showPopup, setShowPopup] = useState(false);

  // 結果が出たらポップアップを表示
  useEffect(() => {
    if (s === 'up-to-date' || s === 'available' || s === 'ready' || s === 'error') {
      setShowPopup(true);
      if (s === 'up-to-date') {
        const t = setTimeout(() => setShowPopup(false), 3000);
        return () => clearTimeout(t);
      }
    }
  }, [s]);

  const handleClick = () => {
    if (s === 'available') { onDownload(); setShowPopup(false); }
    else if (s === 'ready') onInstall();
    else if (!busy) { onCheck(); setShowPopup(false); }
  };

  const popupContent: Partial<Record<UpdateStatus, { text: string; color: string }>> = {
    'up-to-date': { text: '最新版です', color: dark ? 'text-green-400' : 'text-green-600' },
    'available': { text: `v${update.version} あり`, color: 'text-sakura-500' },
    'ready': { text: '再起動して更新', color: 'text-sakura-500' },
    'downloading': { text: `${update.percent ?? 0}%`, color: dark ? 'text-gray-300' : 'text-gray-600' },
    'error': { text: 'エラー', color: 'text-red-400' },
  };

  const popup = popupContent[s];

  return (
    <div className="relative mb-2 flex flex-col items-center">
      <button
        onClick={handleClick}
        disabled={busy}
        title={s === 'error' ? `エラー: ${update.message ?? ''}` : undefined}
        className={`w-9 h-9 rounded-full ${
          s === 'available' || s === 'ready'
            ? 'bg-sakura-500 hover:bg-sakura-600 text-white'
            : dark
              ? 'bg-[#2a2a2a] hover:bg-[#333]'
              : 'bg-white hover:bg-gray-200'
        } flex items-center justify-center transition-colors disabled:opacity-50`}
      >
        {busy ? (
          <div className="w-4 h-4 rounded-full border-2 border-sakura-200 border-t-sakura-500 animate-spin" />
        ) : (
          <svg viewBox="0 0 24 24" className={`w-5 h-5 ${s === 'available' || s === 'ready' ? 'text-white' : dark ? 'text-gray-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M12 4v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* ステータステキスト */}
      {(showPopup && popup) || s === 'downloading' ? (
        <span className={`text-[9px] mt-0.5 text-center leading-tight ${(popup || popupContent['downloading'])?.color}`}>
          {s === 'downloading' ? `${update.percent ?? 0}%` : popup?.text}
        </span>
      ) : null}
    </div>
  );
}

function VideoPanel({ core, settings, dark, t }: {
  core: ReturnType<typeof import('../hooks/useNativeCore').useNativeCore>;
  settings: import('../components/SettingsModal').Settings;
  dark: boolean;
  t: Record<string, any>;
}) {
  const { video, logs, pickInputVideo, pickOutputPath, startVideoProcessing, stopVideoProcessing } = core;
  const progress = video.totalFrames > 0 ? video.currentFrame / video.totalFrames : 0;
  const logRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const pathStyle: React.CSSProperties = {
    flex: 1,
    padding: '5px 10px',
    border: `1px solid ${dark ? '#3a3a3a' : '#e5e7eb'}`,
    borderRadius: '6px',
    fontSize: '12px',
    color: dark ? '#9ca3af' : '#6b7280',
    background: dark ? '#2a2a2a' : '#f9fafb',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-12">
      {/* 入力動画 */}
      <div className="w-full max-w-lg">
        <div className={`text-xs mb-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>入力動画</div>
        <div className="flex gap-2 items-center">
          <div style={pathStyle}>{video.inputPath ?? '未選択'}</div>
          <button
            onClick={pickInputVideo}
            className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${dark ? 'bg-[#333] hover:bg-[#444] text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
          >
            選択...
          </button>
        </div>
      </div>

      {/* 出力先 */}
      <div className="w-full max-w-lg">
        <div className={`text-xs mb-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>出力先</div>
        <div className="flex gap-2 items-center">
          <div style={pathStyle}>{video.outputPath ?? '未選択'}</div>
          <button
            onClick={pickOutputPath}
            className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${dark ? 'bg-[#333] hover:bg-[#444] text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
          >
            選択...
          </button>
        </div>
      </div>

      {/* プログレスバー */}
      {video.processing && (
        <div className="w-full max-w-lg">
          <div className={`text-xs mb-1 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
            {video.totalFrames > 0
              ? `${video.currentFrame} / ${video.totalFrames} フレーム`
              : `${video.currentFrame} フレーム処理中...`}
          </div>
          {video.totalFrames > 0 ? (
            <div className={`h-2 rounded-full ${dark ? 'bg-[#333]' : 'bg-gray-200'}`}>
              <div
                className="h-2 rounded-full bg-sakura-500 transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          ) : (
            <div className={`h-2 rounded-full ${dark ? 'bg-[#333]' : 'bg-gray-200'} overflow-hidden`}>
              <div className="h-2 w-1/3 rounded-full bg-sakura-500 animate-pulse" />
            </div>
          )}
        </div>
      )}

      {/* 完了通知 */}
      {video.completedOutputPath && !video.processing && (
        <div className={`text-sm ${dark ? 'text-green-400' : 'text-green-600'}`}>
          完了: {video.completedOutputPath}
        </div>
      )}

      {/* エラー */}
      {video.error && (
        <div className="text-sm text-red-400">{video.error}</div>
      )}

      {/* ボタン */}
      <div className="flex gap-4">
        {!video.processing ? (
          <button
            onClick={() => startVideoProcessing(settings.confidenceThreshold / 100)}
            disabled={!video.inputPath || !video.outputPath}
            className="bg-sakura-500 hover:bg-sakura-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl px-8 py-3 text-sm font-semibold transition-colors"
          >
            処理開始
          </button>
        ) : (
          <button
            onClick={stopVideoProcessing}
            className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-8 py-3 text-sm font-semibold transition-colors"
          >
            キャンセル
          </button>
        )}
      </div>

      {/* デバッグログ */}
      {logs.length > 0 && (
        <div className="w-full max-w-lg">
          <div className={`text-xs mb-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>ログ</div>
          <div
            ref={logRef}
            className={`h-32 overflow-y-auto rounded-md p-2 font-mono text-[10px] leading-relaxed ${dark ? 'bg-black/60 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
          >
            {logs.map((line, i) => (
              <div key={i} className={line.includes('error') || line.includes('Error') || line.includes('failed') || line.includes('Failed') ? 'text-red-400' : ''}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
