# アーキテクチャ

## 全体像

```
┌─────────────────────────────────────────────┐
│  Electron Renderer (React + Vite)           │
│  - カメラ映像取得 (getUserMedia)             │
│  - JPEG エンコード → IPC で main へ          │
│  - 検出結果オーバーレイ描画                   │
└──────────────┬──────────────────────────────┘
               │ contextBridge (preload.ts)
┌──────────────▼──────────────────────────────┐
│  Electron Main (main.ts)                    │
│  - ウィンドウ管理                             │
│  - autoUpdater (electron-updater)           │
│  - oocyte-core.exe を spawn して stdio で対話 │
└──────────────┬──────────────────────────────┘
               │ stdin/stdout (改行区切り JSON)
┌──────────────▼──────────────────────────────┐
│  Rust Native Core (oocyte-core.exe)         │
│  - OpenCV: カメラ列挙 / 動画パイプライン       │
│  - ONNX Runtime: YOLOv8 推論                │
│  - postprocess: NMS, 座標変換               │
└─────────────────────────────────────────────┘
```

## レンダラー駆動モード (renderer-driven mode)

カメラフレーム取得は **レンダラー側** で `getUserMedia` + `<video>` を使う。Rust 側は推論だけ担当。

理由: Windows では Electron からネイティブにカメラを直接掴むより、Web API (Chromium) で取った方が安定（権限ダイアログ・デバイス検出が OS 標準）。

フロー:
1. Renderer: `<video>` から `<canvas>` に描画 → JPEG base64 化
2. Renderer → Main → Core: `{cmd: "infer_frame", jpeg_base64: ...}`
3. Core: JPEG decode → 前処理 (NCHW [1,3,640,640] f32) → ONNX 推論 → NMS
4. Core → Main → Renderer: `{event: "detection", boxes: [...], inference_ms: N}`

`src/renderer/hooks/useNativeCore.ts` でこのループを管理。前のフレームの推論が完了するまで次を送らない (`inferPendingRef`)。

## モジュール一覧

### `src/`
| ファイル | 役割 |
|---|---|
| `main.ts` | Electron エントリ。Squirrel イベント、ウィンドウ生成、autoUpdater、IPC ハンドラ |
| `preload.ts` | `contextBridge` でレンダラーに `coreApi` を公開 |
| `main/coreProcess.ts` | Rust コアの spawn / 終了 / stdio パース |
| `renderer/App.tsx` | ルート (`DetectionScreen` を表示するだけ) |
| `renderer/pages/DetectionScreen.tsx` | メイン画面。左ドロワーにメニュー、右ドロワーに設定、中央にカメラ / 動画タブ |
| `renderer/components/DetectionOverlay.tsx` | 検出枠の SVG オーバーレイ |
| `renderer/components/SettingsModal.tsx` | 設定の型定義 + デフォルト値 |
| `renderer/components/StatsBar.tsx` | (未使用？要確認) |
| `renderer/hooks/useNativeCore.ts` | コアとの通信を React state に整流するフック |

### `native-core/src/`
| ファイル | 役割 |
|---|---|
| `main.rs` | stdio JSON プロトコルのループ。コマンドディスパッチ |
| `inference.rs` | ONNX Runtime セッション。`load()` / `run()` |
| `camera.rs` | OpenCV `VideoCapture`。デバイス列挙、フレーム取得、前処理 |
| `pipeline.rs` | カメラ駆動モード (Rust 側でカメラ→推論→送信のスレッド) |
| `video_pipeline.rs` | 動画ファイル処理パイプライン |
| `postprocess.rs` | YOLO 出力の NMS / スケール変換 |
| `shared_memory_bridge.rs` | (未使用？) 共有メモリ越し IPC の試作 |

## stdio JSON プロトコル

メインプロセス ⇔ Rust コアは改行区切り JSON。

### コマンド (Main → Core)
```jsonc
{"cmd": "list_cameras"}
{"cmd": "start", "device_id": "0"}
{"cmd": "stop"}
{"cmd": "set_threshold", "value": 0.3}
{"cmd": "set_jpeg_quality", "value": 80}
{"cmd": "set_display_resolution", "value": 720}
{"cmd": "infer_frame", "jpeg_base64": "..."}
{"cmd": "process_video", "input_path": "...", "output_path": "...", "conf_threshold": 0.3}
{"cmd": "stop_video"}
```

### イベント (Core → Main)
```jsonc
{"event": "ready"}
{"event": "cameras", "devices": [{"id": 0, "name": "..."}]}
{"event": "detection", "boxes": [{"x1":..,"y1":..,"x2":..,"y2":..,"confidence":..}], "count": N, "inference_ms": N, "fps": N, "frame_jpeg": null|"base64"}
{"event": "video_progress", "current": N, "total": N}
{"event": "video_done", "output_path": "..."}
{"event": "error", "message": "..."}
{"event": "log", "message": "..."}  // stderr 由来
```

## 自動更新 (electron-updater)

- `resources/app-update.yml` で publish 先を指定 (`toi-cyber/hanasakuya-releases`)
- アプリ起動時に `autoUpdater.checkForUpdates()` 自動実行
- `autoDownload = true` なので更新があれば自動ダウンロード
- ダウンロード完了で 2 秒後に `quitAndInstall()` 自動再起動

詳細は `src/main.ts` の `setupAutoUpdater` 関数。

## モデル

`resources/models/yolov8n_oocyte.onnx` (YOLOv8 nano、卵母細胞 1 クラス)

入力: `[1, 3, 640, 640]` f32 RGB (0〜1 正規化)
出力: `[1, 5, N]` (cx, cy, w, h, conf)

`postprocess.rs` で confidence 閾値 + NMS をかけて最終バウンディングボックスを返す。

## 開発時の DLL 探索

| 環境 | OpenCV DLL の探索 | ONNX Runtime DLL |
|---|---|---|
| dev | `native-core/target/debug/` (手動配置) → PATH | `C:\onnxruntime\lib\onnxruntime.dll` (ハードコード、`coreProcess.ts:findOrtLibrary`) |
| 本番 | `<app>/resources/` (`extraResource` 経由) | `<app>/resources/lib/onnxruntime.dll` |

`coreProcess.ts` の `start()` で `ORT_DYLIB_PATH` 環境変数を子プロセスに渡し、`ort` クレートの `load-dynamic` 機能でランタイムロード。

## 既知の制約

- macOS / Linux でのネイティブビルドは未検証 (Forge config に macOS dylib 名が残っているのは初期実装の名残)
- カメラが MSMF バックエンドだとオープン失敗することがある (DSHOW へのフォールバックあり)
- 共有メモリ IPC は試作のみ、現在は使われていない
