import React, { useEffect, useState, useCallback, useRef } from 'react';
import DetectionOverlay from '../components/DetectionOverlay';
import RegisterPanel from '../components/RegisterPanel';
import { DEFAULT_SETTINGS, type Settings } from '../components/SettingsModal';
import { useNativeCore, type UpdateStatus } from '../hooks/useNativeCore';
import License from './License';
import yokoLogo from '../assets/yoko-logo.png';
import markLogo from '../assets/mark.png';

export default function DetectionScreen() {
  const [imageSize, setImageSize] = useState({ width: 960, height: 540 });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [started, setStarted] = useState(false);
  const [activeTab, setActiveTab] = useState<'camera' | 'video' | 'register'>('camera');
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const core = useNativeCore();

  const dark = settings.theme === 'dark';

  useEffect(() => {
    if (core.ready) {
      core.listCameras();
    }
  }, [core.ready]);

  // カメラの抜き差しを検知して自動で再列挙
  useEffect(() => {
    const handler = () => core.listCameras();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, []);

  // detecting 状態に合わせて started を同期
  useEffect(() => {
    setStarted(core.detecting);
  }, [core.detecting]);

  const handleStart = () => {
    core.startDetection(settings.cameraId);
  };

  const handleStop = () => {
    core.stopDetection();
  };

  const applySettings = (key: keyof Settings, value: number | string) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    if (key === 'cameraId' && started) {
      core.stopDetection();
      core.startDetection(value as string);
    }
    if (key === 'confidenceThreshold') {
      core.setThreshold((value as number) / 100);
    }
    if (key === 'jpegQuality') {
      core.setJpegQuality(value as number);
    }
    if (key === 'inputSize') {
      core.setInferSize(value as number);
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

      {/* Left drawer */}
      <div className={`${menuCollapsed ? 'w-14' : 'w-56'} shrink-0 ${t.drawerBg} border-r ${t.drawerBorder} flex flex-col transition-all duration-200`}>
        {/* Space for traffic lights */}
        <div className="h-8 w-full shrink-0" />
        <div className={`${menuCollapsed ? 'px-0 justify-center' : 'px-5 justify-between'} py-4 border-b ${t.drawerHeaderBorder} flex items-center`}>
          {!menuCollapsed && <h2 className={`text-base font-bold ${t.drawerTitle}`}>メニュー</h2>}
          <button
            onClick={() => setMenuCollapsed((v) => !v)}
            title={menuCollapsed ? 'メニューを展開' : 'メニューを折りたたむ'}
            className={`${dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors`}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
        <nav className="flex flex-col py-2">
          <MenuItem
            icon={<CameraIcon />}
            label="カメラ検出"
            active={activeTab === 'camera'}
            onClick={() => setActiveTab('camera')}
            collapsed={menuCollapsed}
            dark={dark}
          />
          <MenuItem
            icon={<VideoIcon />}
            label="動画処理"
            active={activeTab === 'video'}
            onClick={() => setActiveTab('video')}
            collapsed={menuCollapsed}
            dark={dark}
          />
          <MenuItem
            icon={<UserIcon />}
            label="アカウント登録"
            active={activeTab === 'register'}
            onClick={() => setActiveTab('register')}
            collapsed={menuCollapsed}
            dark={dark}
          />
        </nav>
        <div className="flex-1" />
        {/* Bottom actions */}
        <div className="flex flex-col items-center pb-3">
          <SettingsMenuButton
            dark={dark}
            collapsed={menuCollapsed}
            settings={settings}
            applySettings={applySettings}
            cameras={core.cameras}
            logs={core.logs}
            t={t}
            update={core.update}
            onCheck={core.checkForUpdate}
            onDownload={core.downloadUpdate}
            onInstall={core.installUpdate}
          />
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 relative flex flex-col">
        {/* Top spacer for traffic light region */}
        <div className="h-8 shrink-0" />

        {/* Camera tab */}
        <div className={`flex-1 relative ${activeTab !== 'camera' ? 'hidden' : ''}`}>
        {/* video/canvas は常時 DOM に置く（startDetection 時点で ref が必要） */}
        {/* ブラウザ getUserMedia によるプレビュー */}
        <video
          ref={core.videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: started && !frameJpeg ? 'block' : 'none' }}
          onLoadedMetadata={(e) => {
            const v = e.target as HTMLVideoElement;
            setImageSize({ width: v.videoWidth, height: v.videoHeight });
          }}
        />
        <canvas ref={core.canvasRef} style={{ display: 'none' }} />
        {/* OpenCV直接キャプチャ時のプレビュー */}
        {started && frameJpeg && (
          <img
            src={`data:image/jpeg;base64,${frameJpeg}`}
            className="absolute inset-0 w-full h-full object-cover"
            alt="camera preview"
          />
        )}

        {/* 待機画面 */}
        {!started && (
          <div className={`absolute inset-0 flex flex-col items-center justify-center ${t.waitBg}`}>
            {dark ? (
              <img src={markLogo} alt="HANASAKUYA SPP" className="h-20 w-20 mb-6" />
            ) : (
              <img src={yokoLogo} alt="HANASAKUYA SPP" className="h-16 w-auto mb-6" />
            )}
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
        )}

        {/* 検出中オーバーレイ */}
        {started && (
          <>
            {detection && detection.boxes.length > 0 && (
              <DetectionOverlay
                boxes={detection.boxes}
                width={imageSize.width}
                height={imageSize.height}
              />
            )}
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

        {/* Register tab */}
        {activeTab === 'register' && (
          <div className="flex-1 relative">
            <RegisterPanel dark={dark} />
          </div>
        )}
      </div>

      {/* Right drawer removed — contents moved into SettingsMenuButton */}

    </div>
  );
}



function MenuItem({ icon, label, active, onClick, collapsed, dark }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; collapsed: boolean; dark: boolean }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex items-center ${collapsed ? 'justify-center px-0' : 'px-5'} py-2.5 text-sm font-medium text-left border-l-4 transition-colors ${
        active
          ? 'border-sakura-500 text-sakura-500 bg-sakura-500/10'
          : `border-transparent ${dark ? 'text-gray-400 hover:text-gray-200 hover:bg-[#2a2a2a]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`
      }`}
    >
      <span className={`shrink-0 ${collapsed ? '' : 'mr-3'}`}>{icon}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
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

function SettingsMenuButton({ dark, collapsed, settings, applySettings, cameras, logs, t, update, onCheck, onDownload, onInstall }: {
  dark: boolean; collapsed: boolean;
  settings: import('../components/SettingsModal').Settings;
  applySettings: (key: keyof import('../components/SettingsModal').Settings, value: number | string) => void;
  cameras: { id: string; name: string }[];
  logs: string[];
  t: Record<string, any>;
  update: { status: UpdateStatus; version?: string; percent?: number; message?: string };
  onCheck: () => void; onDownload: () => void; onInstall: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'settings' | 'license'>('settings');
  const [installing, setInstalling] = useState(false);
  const [webhookUrl, setWebhookUrlState] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const s = update.status;
  const busy = s === 'checking' || s === 'downloading' || installing;
  const hasUpdate = s === 'available' || s === 'ready';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      window.logger.getWebhookUrl().then(setWebhookUrlState);
    }
  }, [open]);

  const handleWebhookUrlSave = async () => {
    await window.logger.setWebhookUrl(webhookUrl);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleUpdate = () => {
    if (installing) return;
    if (s === 'available') onDownload();
    else if (s === 'ready') { setInstalling(true); onInstall(); }
    else if (!busy) onCheck();
  };

  const updateLabel: Partial<Record<UpdateStatus, string>> = {
    'idle': 'アップデートを確認',
    'checking': '確認中...',
    'up-to-date': '最新版です',
    'available': `v${update.version} をダウンロード`,
    'downloading': `ダウンロード中 ${update.percent ?? 0}%`,
    'ready': '再起動して更新',
    'error': `エラー: ${update.message ?? ''}`,
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="設定"
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors relative ${
          open
            ? 'bg-sakura-500/20 text-sakura-500'
            : dark
              ? 'bg-[#2a2a2a] hover:bg-[#333] text-gray-400 hover:text-gray-200'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700'
        }`}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        {hasUpdate && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sakura-500 border-2" style={{ borderColor: dark ? '#242424' : '#fff' }} />
        )}
      </button>

      {open && (
        <div className={`absolute bottom-0 left-full ml-2 w-72 min-h-120 max-h-[80vh] overflow-y-auto rounded-xl shadow-lg border ${
          dark ? 'bg-[#242424] border-[#333]' : 'bg-white border-gray-200'
        } py-4 px-5 z-50 space-y-4 text-sm`}>
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <h2 className={`text-base font-bold ${dark ? 'text-white' : 'text-gray-800'}`}>設定</h2>
            <button onClick={() => setOpen(false)} className={`${dark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} text-lg leading-none`}>×</button>
          </div>

          {/* タブ */}
          <div className={`flex border-b ${dark ? 'border-[#333]' : 'border-gray-200'} -mx-5 px-5`}>
            <button
              onClick={() => setTab('settings')}
              className={`py-2 text-xs font-medium mr-5 border-b-2 transition-colors ${
                tab === 'settings'
                  ? 'border-sakura-500 text-sakura-500'
                  : `border-transparent ${dark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`
              }`}
            >
              一般
            </button>
            <button
              onClick={() => setTab('license')}
              className={`py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === 'license'
                  ? 'border-sakura-500 text-sakura-500'
                  : `border-transparent ${dark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`
              }`}
            >
              ライセンス
            </button>
          </div>

          {tab === 'license' ? (
            <License dark={dark} />
          ) : (<>

          {/* カメラ */}
          <Section title="カメラ" dark={dark}>
            <Label text="デバイス" dark={dark}>
              <select
                value={settings.cameraId}
                onChange={(e) => applySettings('cameraId', e.target.value)}
                style={t.selectStyle}
              >
                {cameras.length > 0 ? (
                  cameras.map((cam) => (
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
            <Label text="テーマ" dark={dark}>
              <div className="flex gap-2">
                <button
                  onClick={() => applySettings('theme', 'light' as any)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    !dark
                      ? 'bg-sakura-500 text-white'
                      : 'bg-[#333] text-gray-400 hover:bg-[#3a3a3a]'
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

          {/* ログ送信 */}
          <Section title="ログ送信" dark={dark}>
            <div className="flex gap-1">
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrlState(e.target.value)}
                placeholder="Slack Webhook URL"
                className={`flex-1 text-[10px] px-2 py-1 rounded-md border font-mono truncate ${
                  dark
                    ? 'bg-[#1a1a1a] border-[#444] text-gray-300 placeholder-gray-600'
                    : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400'
                }`}
              />
              <button
                onClick={handleWebhookUrlSave}
                className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  dark ? 'bg-[#333] hover:bg-[#444] text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
              >
                保存
              </button>
            </div>
          </Section>

          {/* アップデート */}
          <Section title="アップデート" dark={dark}>
            <button
              onClick={handleUpdate}
              disabled={busy}
              className={`w-full py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-70 disabled:cursor-wait ${
                hasUpdate
                  ? 'bg-sakura-500 hover:bg-sakura-600 text-white'
                  : s === 'up-to-date'
                    ? dark ? 'bg-[#333] text-green-400' : 'bg-gray-100 text-green-600'
                    : s === 'error'
                      ? 'bg-red-500/20 text-red-400'
                      : dark ? 'bg-[#333] text-gray-300 hover:bg-[#3a3a3a]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {busy && (
                <span className="inline-block w-3 h-3 mr-1.5 rounded-full border-2 border-sakura-200 border-t-sakura-500 animate-spin align-middle" />
              )}
              {installing ? '再起動中...' : updateLabel[s] ?? 'アップデートを確認'}
            </button>
          </Section>

          {/* ログ */}
          {logs.length > 0 && (
            <div className={`border-t ${dark ? 'border-[#333]' : 'border-gray-100'} pt-3`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className={`text-[10px] font-semibold uppercase tracking-wider text-sakura-500`}>ログ</div>
                <CopyLogsButton logs={logs} dark={dark} />
              </div>
              <div
                ref={logRef}
                className={`h-28 overflow-y-auto rounded-md p-2 font-mono text-[9px] leading-relaxed ${dark ? 'bg-black/40 text-gray-400' : 'bg-gray-50 text-gray-600'}`}
              >
                {logs.map((line, i) => (
                  <div key={i} className={line.includes('error') || line.includes('Error') || line.includes('failed') || line.includes('Failed') ? 'text-red-400' : ''}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* バージョン */}
          <div className={`text-[10px] ${dark ? 'text-gray-600' : 'text-gray-400'} select-none text-center`}>
            v{APP_VERSION}
          </div>
          </>)}
        </div>
      )}
    </div>
  );
}

function CopyLogsButton({ logs, dark }: { logs: string[]; dark: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    const text = logs.join('\n');
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
        copied
          ? 'text-green-400'
          : dark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {copied ? 'コピーしました' : 'コピー'}
    </button>
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
