# Stability: 復旧と競合検出実装計画

**Goal:** 破損ファイルがライブラリ全体を塞がず、編集と削除時のデータ保全と競合検出を提供する。

**Architecture:** 保存領域内のバックアップ、内容ハッシュとプロセス内ロックを store が管理する。エディターは版を伴う専用 API を利用し、競合時には下書きを保持する。外部プロセスとの完全な原子性は保証しない。

**Tech Stack:** Python 3.10+、aiohttp、JavaScript、Node.js。

**Spec:** docs/superpowers/specs/2026-11-13-stability-design.md

## 制約

単一ユーザー、既存 ID と状態形式を維持する。元データ保全に失敗した場合は更新しない。破損を空テンプレートとみなさない。コミットしない。

## タスク

- [x] 破損を含む一覧、版付き更新・削除、バックアップと失敗時の保全を core テストから実装する。
- [x] API の版確認と競合エラー、バックアップの閲覧・復元、および復元時の欠損・破損をテストから実装する。
- [x] エディターとノードの一覧・エラー・競合・復元操作をテストから実装する。
- [x] README を更新し、全テストと実機確認の可否を記録する。


## Verification

Python: 35 tests passed. JavaScript: four test scripts passed. Manual ComfyUI and browser checks remain unverified.
