# Stability: インポート／エクスポート実装計画

**Goal:** 保存済みテンプレートを安全に持ち出し、既存データを上書きせず取り込めるようにする。

**Architecture:** 既存の保存・スキーマ検証を使用し、生バイトを受け取る専用 API とエディター操作を追加する。後続の復旧・競合・Snapshot は独立した段階として設計案に従って計画する。

**Tech Stack:** Python 3.10+、aiohttp、JavaScript、Node.js tests。

**Spec:** docs/superpowers/specs/2026-11-13-stability-design.md

## 制約と重点

単一ユーザー制限、既存 ID と保存形式を維持する。重複キー、不正 UTF-8、サイズ超過、既存 ID、失敗後の下書きと既存データ保全を検証する。コミットしない。

## タスク

- [x] API テストで生バイトの取り込み、無効データ、衝突、新 ID 保存、および保存済み版の取得を検証する。先に失敗を確認し、専用ルートと制限を実装する。
- [x] UI テストでファイル選択、衝突時の別 ID 保存、キャンセル、保存済み版のエクスポートと下書きの保持を検証する。先に失敗を確認し、エディターを実装する。
- [x] README の日英を更新し、Python と JavaScript の全チェックを実行する。実際の ComfyUI の画面確認の可否を報告する。


## Verification

Python: 35 tests passed. JavaScript: four test scripts passed. Manual ComfyUI and browser checks remain unverified.
