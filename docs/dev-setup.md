# 開発環境セットアップ (Windows)

このドキュメントは Windows 10/11 向け。macOS / Linux はサポート対象外（Electron は動くが Rust コアのビルドは未検証）。

> **重要**: バージョン縛りが厳しい箇所が複数あります。任意の "latest" を入れると噛み合わずビルドが失敗します。本書のバージョン指定に従ってください。

## 必要なソフトウェア一覧

| ソフトウェア | バージョン | 備考 |
|---|---|---|
| Node.js | 20.x 以上 (LTS) | winget でインストール可 |
| Rust | stable (1.95+) | rustup 経由 |
| Visual Studio Build Tools 2022 | C++ ワークロード | MSVC リンカ用 |
| **LLVM** | **19.x** | **22 系は opencv-binding-generator と非互換**。古いバージョンを明示的に入れる |
| **OpenCV** | **4.11.0** | 4.13+ は opencv-rust 0.93 が gapi 解析で panic。**opencv.org の公式 EXE** を使うこと（chocolatey 版でも可） |
| **ONNX Runtime** | **1.24.2** | `ort` クレート 2.0.0-rc.12 が要求する ABI。1.20 や 1.25 だとモデルロードが無言で詰まる |

---

## 1. Node.js

```powershell
winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
```

新しい PowerShell を開き直して `node -v` で確認。

PowerShell の実行ポリシーで npm がブロックされる場合:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 2. Rust

```powershell
winget install --id Rustlang.Rustup --silent --accept-package-agreements --accept-source-agreements
```

`%USERPROFILE%\.cargo\bin\cargo.exe --version` で確認 (新しいシェルなら `cargo --version`)。

## 3. Visual Studio Build Tools

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools `
  --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --includeRecommended" `
  --accept-package-agreements --accept-source-agreements
```

10〜30 分。

## 4. LLVM 19

> winget や choco の `LLVM` は最新版 (22.x) が入るが、これだと opencv-rust 0.93.7 の binding generator で `unreachable code` パニックが発生する。**必ず 19 系を入れる**。

[LLVM 19 リリース](https://github.com/llvm/llvm-project/releases?q=llvmorg-19) から `LLVM-19.x.x-win64.exe` をダウンロード → デフォルトで `C:\Program Files\LLVM` に入る。

確認:
```powershell
& "C:\Program Files\LLVM\bin\clang.exe" --version
```

## 5. OpenCV 4.11.0

[opencv 4.11.0 リリース](https://github.com/opencv/opencv/releases/tag/4.11.0) から `opencv-4.11.0-windows.exe` をダウンロード → 実行して `C:\tools\` を解凍先に指定（自己解凍 EXE）。`C:\tools\opencv\build\` に展開される。

確認:
```powershell
Test-Path "C:\tools\opencv\build\x64\vc16\bin\opencv_world4110.dll"  # True
```

## 6. ONNX Runtime 1.24.2

[onnxruntime 1.24.2 リリース](https://github.com/microsoft/onnxruntime/releases/tag/v1.24.2) から `onnxruntime-win-x64-1.24.2.zip` をダウンロード。展開して以下に DLL を配置:

```powershell
# 例: C:\onnxruntime\lib\onnxruntime.dll に置く
New-Item -Path "C:\onnxruntime\lib" -ItemType Directory -Force
Copy-Item "<extracted path>\lib\onnxruntime.dll" "C:\onnxruntime\lib\"
Copy-Item "<extracted path>\lib\onnxruntime_providers_shared.dll" "C:\onnxruntime\lib\"
```

`src/main/coreProcess.ts` の dev モードでこのパスをハードコードで参照している。

## 7. 環境変数 (User スコープ)

```powershell
[Environment]::SetEnvironmentVariable("LIBCLANG_PATH", "C:\Program Files\LLVM\bin", "User")
[Environment]::SetEnvironmentVariable("OPENCV_INCLUDE_PATHS", "C:\tools\opencv\build\include", "User")
[Environment]::SetEnvironmentVariable("OPENCV_LINK_PATHS", "C:\tools\opencv\build\x64\vc16\lib", "User")
[Environment]::SetEnvironmentVariable("OPENCV_LINK_LIBS", "opencv_world4110", "User")

# PATH に追加
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$add = "C:\tools\opencv\build\x64\vc16\bin;C:\Program Files\LLVM\bin"
[Environment]::SetEnvironmentVariable("Path", "$userPath;$add", "User")
```

設定後は **新しい PowerShell ウィンドウを開き直す**（既存セッションは PATH を読み直さない）。

## 8. リポジトリ取得 & 依存関係

```powershell
git clone https://github.com/toi-cyber/hanasakuya-app.git
cd hanasakuya-app
npm install --legacy-peer-deps
```

`--legacy-peer-deps` は vite 5 と @vitejs/plugin-react 6 のピア依存衝突を回避するため必須。

## 9. Rust コアのビルド

```powershell
cd native-core
cargo build
cd ..
```

10〜15 分。opencv-rust の binding generator が走るので初回は時間がかかる。

## 10. dev 用 DLL 配置

dev モードでは `oocyte-core.exe` が `target/debug/` から起動するので、同ディレクトリに OpenCV ランタイム DLL を置く必要がある (本番ビルドでは `forge.config.ts` の `extraResource` で自動バンドル)。

```powershell
$src = "C:\tools\opencv\build\x64\vc16\bin"
$dst = "native-core\target\debug"
Copy-Item "$src\opencv_world4110.dll" "$dst\"
Copy-Item "$src\opencv_videoio_ffmpeg4110_64.dll" "$dst\"
```

## 11. 起動

```powershell
npm start
```

コンソールに以下が出れば正常:
```
[CoreProcess] Found core at: ...\native-core\target\debug\oocyte-core.exe
[CoreProcess] ORT: C:\onnxruntime\lib\onnxruntime.dll
[main] Model path: Some("../resources/models/yolov8n_oocyte.onnx")
[inference] Model loaded successfully
[main] Inference engine ready
```

---

## トラブルシューティング

### `STATUS_DLL_NOT_FOUND (0xC0000135)` で起動失敗
- LLVM の bin が PATH にない → Step 7 を再確認
- OpenCV DLL が `target/debug/` に置かれていない → Step 10 を実行

### ビルド時に gapi モジュールで `unreachable code` panic
- LLVM が 22 系 → Step 4 で 19 系を入れ直す
- もしくは `native-core/Cargo.toml` の opencv 行に `default-features = false` がないか確認 (リポジトリには既に入っている)

### `Loading model` のあと `Model loaded successfully` が出ずに無音で止まる
- ONNX Runtime のバージョンが `ort` クレートの ABI と不一致 → 1.24.2 を入れ直す

### `npm install` が `ERESOLVE` で失敗
- `--legacy-peer-deps` を付け忘れ

### PowerShell で `npm` が「認識されない」
- ExecutionPolicy が `Restricted` のまま → `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

### カメラが認識されない
- DSHOW で device 1〜4 が "not opened" になるのは正常 (存在しないインデックスのプローブ警告)
- カメラ 0 で開けない場合は別アプリ（Zoom 等）が占有していないか確認

---

## CI でのビルド

GitHub Actions (`.github/workflows/release.yml`) が tag `v*` push でトリガされ、windows-latest ランナーで上記と同等のセットアップを自動実行する。詳細は [release.md](release.md) 参照。

ローカル環境と CI の差分:
- LLVM は choco 経由 (バージョンが揺らぐので将来要注意)
- OpenCV / ONNX Runtime は CI 内で都度ダウンロード
- `native-core/target` をキャッシュ (Cargo.lock のハッシュをキー)
