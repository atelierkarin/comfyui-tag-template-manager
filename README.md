# ComfyUI Tag Template Manager

タグテンプレートをローカルで管理し、ComfyUI のワークフローで組み合わせるためのカスタムノードです。仕様は [設計書](docs/ComfyUI_Tag_Template_Manager_Design_v1.md) を参照してください。

## 現在の状態

Core、`Tag Template` / `Tag Main` ノード、テンプレート編集画面、保存・プレビュー API を実装しています。ComfyUI 0.22.0 のノード実行経路は確認済みですが、ブラウザー上での UI 操作確認は未完了です。

## 開発環境

- 確認した環境: ComfyUI 0.22.0、Windows ポータブル版の Python 3.13.12
- プロジェクトの Python 要件: 3.10 以上（ComfyUI に合わせる）
- 現時点では追加の Python パッケージは不要です。

このリポジトリから、ポータブル版に同梱された Python を使ってテストを実行できます。以下は現在の環境の PowerShell での例です。

```powershell
& "D:/apps/ComfyUI_windows_portable/python_embeded/python.exe" -m unittest discover -s tests -v
```

JavaScript を検証する場合は Node.js で `node tests/test_state.mjs`、`node tests/test_editor.mjs`、`node tests/test_editor_ui.mjs`、`node tests/test_template_ui.mjs` を実行します。UI テストは簡易 DOM での検証です。

別の環境では、その環境の Python で `python -m unittest discover -s tests -v` を実行してください。実装時には対象の ComfyUI でノードの読み込みと UI も確認してください。

## ディレクトリ

- `services/`: データ検証、保存、プロンプト結合などの独立した処理
- `api/`: ComfyUI サーバー向け API
- `web/`: ComfyUI フロントエンド拡張
- `tests/`: 標準ライブラリ `unittest` によるテスト

Core の詳細は [Core 設計書](docs/ComfyUI_Tag_Template_Manager_Core_Design_v1.md)、ノードは [Nodes 設計書](docs/ComfyUI_Tag_Template_Manager_Nodes_Design_v1.md)、編集画面は [Editor 設計書](docs/ComfyUI_Tag_Template_Manager_Editor_Design_v1.md) を参照してください。今後は Stability を進めます。

## ノードの使用方法

このリポジトリを ComfyUI の `custom_nodes/comfyui-tag-template-manager` に配置し、単一ユーザーモードで ComfyUI を再起動すると、`Tag Template Manager` カテゴリーに 2 つのノードが表示されます。マルチユーザーモードは現在未対応で、利用時にエラーになります。

1. `Tag Template` を追加し、`Edit library` からエディターを開きます。`New` で作成し、名前・ブロック・プリセットを入力して `Save` します。テンプレートの ID は新規保存前に設定できます。保存後は固定されます。
2. エディターではテンプレートの名前・ID・カテゴリーによる検索、保存、`Save As / Duplicate`、削除、ブロックの追加・複製・並べ替え、プリセットの編集ができます。各ブロックは見出しをクリックすると折りたためます。テンプレート選択時は、プリセットがなくても各ブロックの既定 ON / OFF が使われます。選択はノードごとにワークフローへ保存されます。
3. 出力を `Tag Main` の `bundle_1`〜`bundle_8` に接続し、`channel` で `positive` または `negative` を選び、必要に応じて `text` に自由入力を追加します。Positive 用と Negative 用に `Tag Main` をそれぞれ配置し、各 STRING 出力を対応する CLIP Text Encode に接続します。
4. `Update preview` で現在の結合内容を確認できます。プレビューは手動更新です。入力、接続、またはテンプレートを変更した後は再度更新してください。プレビューは Template Node と通常の Reroute の接続を対象とし、自由入力ウィジェットを外部ノードに接続した場合は利用できません。

`Tag Main` の `exclude` に一時的に取り除きたいタグをカンマまたは改行区切りで入力できます。たとえば `ribbon` は `ribbon` というタグを除外します。大文字・小文字は区別しません。タグ全体が一致する場合だけ除外するため、`hair ribbon` や `(ribbon:1.2)` は残ります。括弧やエスケープを含む複雑な構文は安全のため変更せず、不正に閉じられていない断片もそのまま残します。除外は選択した Main の出力と自由入力に適用され、テンプレート自体は変更されません。

Template と Main の出力では、カンマ区切りの前後や平文タグ内の余分な空白・改行を整えます。括弧内などの複雑な構文は保持します。排他グループは Positive と Negative を別々に判定するため、同じグループ名でも各チャンネルから 1 ブロックずつ選べます。

`Tag Template` の `positive` / `negative` STRING 出力は、現在 ON のブロックをそれぞれ結合したものです。`Tag Main` を経由せず、CLIP Text Encode や Inspire Pack の Regional Conditioning By Color Mask の `prompt` など、STRING 入力に直接接続できます。対象のテキスト欄に入力端子がない場合は、ComfyUI のウィジェットを入力端子に変換して接続してください。これは実行時の値の接続で、テキスト欄へのコピーではありません。

テンプレートが欠損・破損した場合は実行を停止します。編集後の更新時は、残っているブロックの選択を維持し、追加されたブロックには Default を適用します。既存選択と同じチャンネル・排他グループで競合する新規ブロックは OFF にします。既存選択同士が矛盾する場合はリセットまたはプリセットを再適用してください。Live モードのため、テンプレートを編集すると同じワークフローでも出力が変わります。

保存先は ComfyUI のユーザーディレクトリ内の `default/tag_templates/` です（標準設定では `ComfyUI/user/default/tag_templates/`）。同じテンプレートを複数画面や外部ツールで同時編集した場合の競合検出はまだありません。インポート／エクスポート画面とバックアップは後続段階です。

### API

- `GET /tag-template-manager/templates`：`{"templates": [{"id", "name", "category"}]}`
- `GET /tag-template-manager/templates/{id}`：検証済みテンプレート JSON
- `POST /tag-template-manager/templates`：テンプレート JSON を新規作成。既存 ID は 409。
- `PUT /tag-template-manager/templates/{id}`：同じ ID の既存テンプレートを更新。
- `DELETE /tag-template-manager/templates/{id}`：既存テンプレートを削除。
- `POST /tag-template-manager/preview-single`：`{"states": [...], "channel": "positive", "text": "", "deduplicate": false, "exclude": ""}` を受け取り、選択されたチャンネルの `{"text": "..."}` を返す。各 state は `version`, `template_id`, `preset_id`, `blocks` を持つ。`exclude` は省略可能。

エラーは `{"error": "..."}` で返します。未対応のユーザーモードは 403、未存在は 404、ID 衝突は 409、入力不正は 400、ライブラリ読み書き失敗は 500 です。

## Core の使い方

`services.schema.validate_template(data)` で JSON 相当の辞書を検証し、コピーを取得できます。`services.template_store.TemplateStore(directory)` は保存先を明示的に受け取り、`create(data)`、`load(id)`、`list()`、`update(data)`、`delete(id)` を提供します。

`services.prompt_builder` の `default_selection(template)`、`apply_preset(template, preset_id)`、`set_block(template, selection, block_id, enabled)` は独立した選択状態を返します。`build_prompts([(template, selection), ...], positive='', negative='', deduplicate=False)` は接続順の入力から Positive と Negative の文字列を返します。これらは ComfyUI 本体を起動せず使用できます。

## Git について

GitHub リポジトリは `atelierkarin/comfyui-tag-template-manager` です。開発用のリポジトリと ComfyUI が読み込む配置先を分ける場合は、変更をテストする前に配置先へ反映してください。
