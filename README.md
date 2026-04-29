# Hanasakuya

YOLOv8 をリアルタイムで動かす卵母細胞検出デスクトップアプリ。Electron + React + Rust ネイティブコア (OpenCV / ONNX Runtime) で構成。

## クイックリンク

- [開発環境セットアップ (Windows)](docs/dev-setup.md)
- [アーキテクチャ概要](docs/architecture.md)
- [配布フロー](docs/release.md)

## 構成

```
hanasakuya-app/
├── src/
│   ├── main.ts              Electron main プロセス
│   ├── preload.ts           IPC ブリッジ
│   ├── main/coreProcess.ts  Rust コアの spawn / IPC
│   └── renderer/            React UI (App / pages / components / hooks)
├── native-core/             Rust 推論コア (ONNX + OpenCV)
├── resources/
│   ├── models/              ONNX モデル
│   ├── lib/                 ONNX Runtime ライブラリ
│   └── app-update.yml       electron-updater 設定
├── forge.config.ts          Electron Forge 設定 (パッケージング)
└── .github/workflows/       CI (Windows ビルド + Release publish)
```

## ライセンス

MIT
