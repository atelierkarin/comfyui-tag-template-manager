# ComfyUI Tag Template Manager — 設計書 v1.0

作成日：2026-11-12  
対象：ComfyUIカスタムノード（Pythonバックエンド＋JavaScriptフロントエンド）  
開発用途：Codexに渡す初期実装仕様

## 1. 目的と背景

従来、キャラクター・衣装・背景・仕上げ品質・ネガティブプロンプトなどの定番タグを、接続されないテキストノードとしてワークフロー上に大量に置き、必要に応じてコピーしていた。その結果、ワークフローが煩雑になり、目的のタグを探す負担が増えている。

本プラグインは、タグテンプレートをワークフローから独立したローカルライブラリに保存し、生成時はテンプレート／ブロック／プリセットを選択して組み立てる仕組みを提供する。白鳥かりんに限らず、任意のキャラクター、背景、品質、用途に使用可能な汎用管理システムとする。

## 2. スコープ

### 必須（MVP）
- テンプレートの一覧、検索、作成、編集、複製、削除、保存、読み込み
- 1テンプレートに複数の順序付きタグブロックを格納
- ブロックごとの有効／無効切り替え
- Positive / Negativeの両方を管理
- テンプレート内部のプリセット（特定ブロックの有効状態を一括切替）
- 複数テンプレートを組み合わせ、自由入力を追加
- Positive / Negativeを個別のSTRINGとして出力
- JSONによる永続化、インポート／エクスポート
- ワークフロー再読み込み後の選択状態復元
- 保存／読み込み失敗の明確なエラー表示

### 初期対象外
- LLMによるタグ自動提案や意味的矛盾診断
- Taggerからの自動分類・自動登録
- クラウド同期・共同編集
- LoRAファイルの自動解析
- 複雑なDanbooru構文パーサー

## 3. 基本概念とデータモデル

### Template
再利用可能なタグブロック群。例：白鳥かりん、背景、通常イラスト、アクスタ制作。

### Block
名前、タグ本文、出力先（positive/negative）、既定ON/OFF、並び順、任意の排他グループを持つ単位。タグ本文は手書きの自由テキストとし、強制的に単語単位へ正規化しない。

### Preset
テンプレート内のブロック選択状態を名前付きで保存したもの。例：正装／私服／コスプレ。プリセット適用後に個別ブロックを変更できる。

### Selection（ノードインスタンス状態）
各ノードに固有の、現在選択したテンプレート、プリセット、ブロックON/OFFと追加タグ。テンプレートの共有マスターを変更しない。

### Bundle
Template NodeからMain Nodeへ渡す専用の内部データ型。positive/negative文字列、テンプレートID、状態情報を保持。普通のSTRINGとは区別する。

## 4. 推奨ノード構成

### 4.1 Tag Template Node
- 入力UI：テンプレート選択、プリセット選択、ブロック一覧、各ブロックON/OFF、編集ボタン、更新ボタン
- 出力：`TAG_BUNDLE`（1）
- 入力なしでも利用できる
- 初期ロード時はテンプレート既定値を反映。既存ワークフローの保存済み選択を優先
- テンプレートが見つからない場合は警告し、黙って空文字列を出さない

### 4.2 Tag Main Node
- 入力：`TAG_BUNDLE`を複数接続（安定実装を優先。動的ポートが不安定なら初期4～8口＋拡張方法を用意）
- 入力UI：自由入力Positive、自由入力Negative、重複除去ON/OFF、結合プレビュー
- 出力：`positive: STRING`、`negative: STRING`
- 結合順：接続ポート順、各テンプレート内ブロック順、最後に自由入力
- 空ブロックは無視。PositiveとNegativeを別々に処理
- 文字列プレビューは最終出力と一致すること

### 4.3 Tag Template Editor（画面UI）
- Template NodeのEditボタン、またはComfyUIの拡張メニューから起動するモーダル／サイドパネル
- ライブラリ一覧、カテゴリー、名前検索
- Template作成／複製／削除／名称変更
- Block追加／複製／削除／並び替え、タグ本文編集、出力先、既定状態、排他グループ設定
- Preset作成／改名／削除、プリセットごとのブロック状態編集
- Save、Save As、Import、Export、変更破棄確認
- 重要：管理用の常駐ノードは不要。画面UIはワークフローのグラフを汚さないこと

## 5. UI挙動

1. 新しいTag Template Nodeを追加すると、テンプレート一覧を取得して選択可能になる。
2. テンプレート選択後、当該テンプレートのブロック一覧を表示する。
3. プリセットを選ぶと複数のブロックの選択状態が一括更新される。
4. さらに任意のブロックを個別にON/OFFできる。
5. 排他グループ（例：衣装）は同時に1ブロックまでON。None選択も許可する。
6. Template Nodeを複数Main Nodeに接続し、Main NodeでPositiveとNegativeを生成する。
7. 同じマスターテンプレートを使用する複数ノードは、独立した選択状態を持つ。
8. 管理画面で保存するとライブラリに永続化される。ワークフロー保存はノードの選択状態を保存する。

## 6. JSONスキーマ例

```json
{
  "schema_version": 1,
  "id": "shiratori_karin",
  "name": "白鳥かりん",
  "category": "character",
  "description": "キャラクター基本・衣装・コスプレ",
  "blocks": [
    {
      "id": "base",
      "name": "基本",
      "channel": "positive",
      "default_enabled": true,
      "exclusive_group": null,
      "tags": "shiratori karin, black hair, long hair, high twintails, long twintails, sidelocks, ahoge, tareme, brown eyes, hair ribbon"
    },
    {
      "id": "formal",
      "name": "正装",
      "channel": "positive",
      "default_enabled": true,
      "exclusive_group": "outfit",
      "tags": "red beret, karin default outfit, karin kimono, karin mini kimono"
    },
    {
      "id": "casual",
      "name": "洋服",
      "channel": "positive",
      "default_enabled": false,
      "exclusive_group": "outfit",
      "tags": "pink_shirt, frills, denim skirt, black_thighhighs"
    }
  ],
  "presets": [
    {"id": "formal", "name": "正装", "enabled_block_ids": ["base", "formal"]},
    {"id": "casual", "name": "洋服", "enabled_block_ids": ["base", "casual"]}
  ]
}
```

テンプレートID／ブロックIDは表示名変更時も原則固定。IDが衝突したインポートでは上書きせず確認する。JSON読み込み時に型・重複ID・必須項目・排他グループ矛盾を検証する。

## 7. 保存先とAPI

- Python側でComfyUIの適切なユーザーデータディレクトリを取得し、`tag_templates/`を作成。インストール先への書き込みを避ける。
- テンプレートを個別JSONファイルとして永続化し、バックアップ／移行を容易にする。
- 読み書き・一覧取得・複製・削除・インポート／エクスポートはサーバー側APIへ集約。
- フロントエンドは公式の拡張機構を使い、内部実装やグローバルDOMの脆弱な書換えに依存しない。
- 保存時は一時ファイル→アトミック置換。無効JSON／不正パス／パストラバーサルを拒否。
- 削除は確認ダイアログ付き。必要に応じてバックアップを生成。

## 8. プロンプト結合仕様

- 両チャンネルを別々に結合する。
- 基本は文字列連結：先頭・末尾の空白と余分な区切りカンマだけを整理する。
- 入力タグ順序を維持する。
- 重複除去はOFFが初期値。ON時も単純な完全一致タグのみを対象にし、先に現れたタグを保持する。
- `(tag:1.2)`、`[tag]`、`BREAK`、複雑な括弧内構文などを誤って分割しないよう、MVPでは構文解析を伴う重複除去を実施しない。安全に分割可能な平文タグ以外は重複除去対象外とする。
- タグの意味的な衝突検出は将来機能。
- 余計なタグを暗黙で追加・削除しない。

## 9. ワークフロー再現性と更新

- Liveモード：サーバー上の最新版テンプレートを読む。テンプレート内容の更新が既存ワークフローの出力に影響し得ることを明示。
- Snapshotモード：テンプレート内容・選択状態をワークフローのノード状態に保存し、外部JSONが変わっても生成結果の文字列を固定。
- 初期実装はLiveを基本とし、SnapshotをMVP後半で追加可能。ただしJSON消失時の対応と古いワークフローの互換性を先に考慮する。
- 実行キャッシュ対策：テンプレート変更がComfyUIの再実行判定へ反映されるよう、バックエンドがファイル内容ハッシュ／リビジョンを評価する仕組みを設計する。単に画面のプレビューを変えるだけでは不十分。

## 10. 想定利用例

- テンプレートA「白鳥かりん」：基本 + 私服／正装／コスプレのいずれか
- テンプレートB「背景」：桜並木 or 室内 or 高原
- テンプレートC「基準品質」：通常イラスト or アクスタ制作
- テンプレートD「ネガティブ」：通常用 or 透過素材用
- Main自由入力：「sitting on bed, looking at viewer」等、生成回ごとの固有タグ
- Main出力 Positive → CLIP Text Encode (Positive)
- Main出力 Negative → CLIP Text Encode (Negative)

## 11. 実装構成案

```text
ComfyUI-TagTemplateManager/
├── __init__.py
├── pyproject.toml
├── README.md
├── nodes.py
├── services/
│   ├── template_store.py
│   ├── schema.py
│   ├── prompt_builder.py
│   └── cache_revision.py
├── api/
│   └── routes.py
├── web/
│   ├── index.js
│   ├── template_node.js
│   ├── main_node.js
│   └── editor.js
└── tests/
    ├── test_store.py
    ├── test_schema.py
    ├── test_builder.py
    └── test_workflow_state.py
```

## 12. 開発フェーズ

1. **Core**：JSONモデル、保存、スキーマ検証、結合エンジン、単体テスト。
2. **Nodes**：Template Node、Main Node、Positive/Negative STRING出力、複数テンプレート接続。
3. **Editor**：テンプレート一覧、検索、ブロック編集、プリセット、保存・読み込み。
4. **Stability**：実行キャッシュ、Live/Snapshot、インポート／エクスポート、破損復旧、エラー表示。
5. **Optional**：WD14タグ診断連携、カテゴリ横断検索、タグの使用履歴、テンプレートの依存関係。

## 13. 受け入れ基準

- [ ] ワークフロー内にコピペ保管用の未接続タグノードを置く必要がない。
- [ ] テンプレート作成／保存／ロード／編集／削除がGUIで完結する。
- [ ] 同一テンプレートを別ノードで異なる衣装状態にしても相互干渉しない。
- [ ] 正装と私服は排他グループ設定時に同時有効にならない。
- [ ] 通常イラストとアクスタ制作の仕上げタグをプリセットで切り替えられる。
- [ ] Positive／Negativeを混ぜずに、接続順で統合できる。
- [ ] 保存後ComfyUIを再起動してもテンプレートとワークフロー設定が復元される。
- [ ] Liveモードではテンプレート更新後に正しい出力が反映される。
- [ ] テンプレート欠損／JSON破損が黙って空文字列にならず検知できる。
- [ ] 普通のCLIP Text EncodeノードのSTRING入力に接続できる。

## 14. Codexへの実装指示

上記仕様に沿ってComfyUIカスタムノードを開発する。まずインストール済みComfyUIのバージョンと公式拡張APIを確認し、そのバージョンで安定する実装を選ぶこと。バックエンドとフロントエンドを分離し、テスト可能な純粋関数としてプロンプト結合ロジックを構成する。動的入力、ウィジェット保存、テンプレート変更時の再実行判定については、仮定で実装せず対象バージョンのAPIに沿って検証する。MVPを段階的に完成させ、既存ワークフローの破壊的変更を避けること。
