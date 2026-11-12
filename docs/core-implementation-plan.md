# Core 実装計画

設計: [Phase 1 Core](ComfyUI_Tag_Template_Manager_Core_Design_v1.md)。Python 3.10 以上、標準ライブラリのみ。ComfyUI への依存は設けない。

1. `services/schema.py`: 検証済みデータのコピーと JSON の重複キー検知。型、ID、参照、排他をテストする。
2. `services/template_store.py`: 検証済み JSON の一覧、読み込み、新規作成、更新、削除。衝突、破損、パス、保存失敗をテストする。
3. `services/prompt_builder.py`: 選択の初期化・プリセット・個別切替と純粋な結合。順序、独立性、排他、複雑な構文の保持をテストする。
4. README にサービスの使用方法を記載し、全テストを同梱 Python で実行する。

各段階で先にテストを書いて失敗を確認し、実装後にテストを再実行する。親 ComfyUI の Git リポジトリにはコミットしない。
