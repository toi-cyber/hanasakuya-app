# リリース手順

## 概要

`v*` という形式の git tag を push すると `.github/workflows/release.yml` が起動し、Windows のインストーラを `toi-cyber/hanasakuya-releases` の Releases に publish する。既存ユーザのアプリは electron-updater がそこを polling して自動更新を取りに行く。

## リポジトリ分割

| リポジトリ | 用途 | 公開 |
|---|---|---|
| `toi-cyber/hanasakuya-app` | ソースコード本体 (このリポジトリ) | public |
| `toi-cyber/hanasakuya-releases` | リリース成果物 (`.exe` + `latest.yml`) のホスト | public |

分けている理由: ソースコードの commit 履歴を汚さずにバイナリを配布するため。auto-update 用の `latest.yml` も Releases リポジトリ側に置く。

## リリース手順

### 1. fix / feat コミット
通常の開発フローでコミット。

### 2. バージョン bump
```powershell
# package.json の version を更新 (例: 1.0.25 → 1.0.26)
git add package.json
git commit -m "chore: bump version to 1.0.26"
```

### 3. tag 付け & push
```powershell
git tag v1.0.26
git push origin main
git push origin v1.0.26
```

tag を push した瞬間に Release ワークフローが走る。

### 4. CI 監視
```powershell
gh run watch                        # ライブ追従
gh run list --limit 3 --workflow=release.yml
```

通常 5〜6 分で完了。

### 5. 確認
- [Releases ページ](https://github.com/toi-cyber/hanasakuya-releases/releases) に新しいリリースが出ているか
- 既存のインストール済みアプリを起動 → 自動で更新ダウンロードが始まるか

## CI ワークフローの中身

`.github/workflows/release.yml` のジョブ構成:

### `build-windows`
1. Rust toolchain インストール
2. `actions/cache@v4` で `native-core/target` を復元 (キー: `windows-rust-${Cargo.lock のハッシュ}`)
3. LLVM (chocolatey 経由)
4. OpenCV 4.11.0 をダウンロード → `C:\tools\opencv\` に解凍
5. ONNX Runtime 1.24.2 をダウンロード → `resources/lib/onnxruntime.dll` に配置
6. `cargo build --release`
7. OpenCV ランタイム DLL を `native-core/target/release/` にコピー (extraResource バンドル用)
8. `npm install --legacy-peer-deps`
9. `npx electron-forge make` で Squirrel.Windows インストーラ生成
10. `actions/upload-artifact@v4` (retention-days: 1) で `release` ジョブに受け渡し

### `release`
1. ubuntu-latest で artifact ダウンロード
2. `latest.yml` を生成 (electron-updater が読むメタデータ)
3. `gh release create` で `toi-cyber/hanasakuya-releases` に publish

## キャッシュ戦略

`native-core/target` をキャッシュしているため、`Cargo.lock` が変わらない限り Rust の再ビルドは走らない。
- 利点: フレッシュビルドだと 10〜15 分かかる opencv-rust の binding generation を毎回避けられる
- 欠点: 環境依存の問題が表面化しにくい (新しい LLVM や opencv が壊しても気づかない)

`Cargo.lock` を変更したくないが強制再ビルドしたい場合: GitHub Actions の Caches タブから手動で削除。

## 失敗時の対応

### `cargo build --release` が失敗
- 大抵は LLVM/OpenCV のバージョン非互換。CI ログで `unreachable code` panic が出ていれば binding generator の問題
- ローカルでは `dev-setup.md` の通りに環境を作り直すと再現できる

### モデルロードで無音停止 (release バイナリ)
- ONNX Runtime のバージョンが `ort` クレートと合っていない
- 現在 `ort = "2.0.0-rc.12"` → ONNX Runtime **1.24.2** が必須
- `release.yml` のダウンロード URL を該当バージョンに合わせる

### OpenCV ランタイム DLL がパッケージに入らない
- `forge.config.ts` の `extraResource` から外れていないか確認
- `Copy OpenCV runtime DLLs (Windows)` ステップが Rust ビルドの後に実行されているか

## ストレージ管理

GitHub Actions の artifact は public リポでも 500MB の無料枠を持つため、毎リリースの windows-build artifact (~155MB) を貯めると quota 警告が出る。`retention-days: 1` で 1 日後に自動削除。

過去の artifact をまとめて削除する場合:
```powershell
$r = gh api "repos/toi-cyber/hanasakuya-app/actions/artifacts?per_page=100" | ConvertFrom-Json
$r.artifacts | ForEach-Object { gh api -X DELETE "repos/toi-cyber/hanasakuya-app/actions/artifacts/$($_.id)" }
```

## SmartScreen 警告

未署名の EXE は Windows Defender SmartScreen に「認識されないアプリ」と警告される。回避策:
1. ユーザに「詳細情報」→「実行」を案内 (現状の運用)
2. Azure Trusted Signing で署名 (約 $10/月、CI から `azure/trusted-signing-action` で自動化可)
3. EV Code Signing 証明書を購入 (年 ¥3〜10 万、即時警告解消)

詳細は別途検討。
