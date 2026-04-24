import React, { useState, useEffect } from 'react';

interface Camera {
  id: number;
  name: string;
}

type Theme = 'light' | 'dark';

interface Settings {
  // カメラ
  cameraId: number;
  // 検出
  confidenceThreshold: number;
  // モデル
  inputSize: number;
  // アプリ
  jpegQuality: number;
  displayResolution: number;
  theme: Theme;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  cameras: Camera[];
  currentSettings: Settings;
  onApply: (settings: Settings) => void;
}

const DEFAULT_SETTINGS: Settings = {
  cameraId: 0,
  confidenceThreshold: 30,
  inputSize: 640,
  jpegQuality: 60,
  displayResolution: 960,
  theme: 'dark',
};

export { DEFAULT_SETTINGS };
export type { Settings, Theme };

export default function SettingsModal({
  open,
  onClose,
  cameras,
  currentSettings,
  onApply,
}: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(currentSettings);

  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings, open]);

  if (!open) return null;

  const update = (key: keyof Settings, value: number | string) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-[480px] max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">設定</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* カメラ設定 */}
          <Section title="カメラ">
            <Label text="デバイス">
              <select
                value={settings.cameraId}
                onChange={(e) => update('cameraId', parseInt(e.target.value))}
                className="input-field"
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

          {/* 検出設定 */}
          <Section title="検出">
            <Label text={`信頼度閾値: ${settings.confidenceThreshold}%`}>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={settings.confidenceThreshold}
                onChange={(e) => update('confidenceThreshold', parseInt(e.target.value))}
                className="w-full accent-sakura-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>10% (多め)</span>
                <span>90% (厳密)</span>
              </div>
            </Label>
          </Section>

          {/* モデル設定 */}
          <Section title="モデル">
            <Label text="入力サイズ">
              <select
                value={settings.inputSize}
                onChange={(e) => update('inputSize', parseInt(e.target.value))}
                className="input-field"
              >
                <option value={320}>320×320 (高速)</option>
                <option value={640}>640×640 (標準)</option>
              </select>
            </Label>
          </Section>

          {/* アプリ設定 */}
          <Section title="アプリ">
            <Label text={`表示品質 (JPEG): ${settings.jpegQuality}%`}>
              <input
                type="range"
                min={20}
                max={95}
                step={5}
                value={settings.jpegQuality}
                onChange={(e) => update('jpegQuality', parseInt(e.target.value))}
                className="w-full accent-sakura-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>20% (高速)</span>
                <span>95% (高画質)</span>
              </div>
            </Label>
            <Label text="表示解像度 (幅)">
              <select
                value={settings.displayResolution}
                onChange={(e) => update('displayResolution', parseInt(e.target.value))}
                className="input-field"
              >
                <option value={640}>640px (高速)</option>
                <option value={960}>960px (標準)</option>
                <option value={1280}>1280px (高画質)</option>
                <option value={1920}>1920px (フル)</option>
              </select>
            </Label>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={() => { onApply(settings); onClose(); }}
            className="px-6 py-2 text-sm bg-sakura-500 hover:bg-sakura-600 text-white rounded-lg font-medium transition-colors"
          >
            適用
          </button>
        </div>
      </div>

      {/* Styles for input fields */}
      <style>{`
        .input-field {
          width: 100%;
          padding: 6px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
          color: #374151;
          background: #f9fafb;
        }
        .input-field:focus {
          outline: none;
          border-color: #ec4899;
          box-shadow: 0 0 0 2px rgba(236, 72, 153, 0.1);
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-sakura-500 mb-3">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{text}</label>
      {children}
    </div>
  );
}
