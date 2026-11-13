# Stability: Snapshot 実装計画

**Goal:** ワークフローに検証済みテンプレートと選択を保存し、外部ライブラリに依存せず再実行・プレビューできるようにする。

**Architecture:** 状態 v1 を Live として維持し、v2 にテンプレート全体を保存する。サーバーは共通の検証と prompt builder を使い、UI はライブラリが使えない場合も v2 を表示する。

**Tech Stack:** Python 3.10+、JavaScript、Node.js。

**Spec:** docs/superpowers/specs/2026-11-13-stability-design.md

## 制約と検証

ノード種別・出力順、ID、単一ユーザー制限を維持する。v2 の不正状態、ライブラリ欠損・変更、v1 互換、プレビューと実行の一致、モード変更の確認と保存／再読込を検証する。コミットしない。

## タスク

- [x] node_service とプレビューで v2 を検証・実行し、ファイル変更・欠損に影響されないことを Python テストで確認する。
- [x] UI で Live から Snapshot の作成、明示的な更新、Live 復帰、欠損時の表示と選択を JS テストから実装する。
- [x] README 日英を更新し、全自動テストと実機確認の可否を記録する。


## Verification

Python: 35 tests passed. JavaScript: four test scripts passed. Manual ComfyUI and browser checks remain unverified.
