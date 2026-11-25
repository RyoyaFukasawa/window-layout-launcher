# Window Layout Launcher

決めた URL・固定タブ・タブグループ・ディスプレイ・位置とサイズのウィンドウ構成を、名前付きの「レイアウトセット」として登録して開く Chrome 拡張機能。

- アイコンのクリック／ショートカット（Mac: ⌘+Shift+Y / Windows: Ctrl+Shift+Y）でセットの一覧が開き、選んだセットを開く
- ★ を付けたセットは Chrome の起動時に自動で開く
- 各セットは「ドック時（ディスプレイ2枚以上）」「ノートPCのみ」の2つのレイアウトを持つ（片方が空ならもう一方を使う）

## ビルド

```bash
npm install
npm run build      # 型チェック + dist/ に出力
npm run dev        # 開発中：保存するたびに dist/ を再ビルド
```

## テスト

```bash
npm test          # 1回実行
npm run test:watch  # 変更のたびに実行
```

`npm run build` でもテストが通らないとビルドされません。

### E2E テスト（実際の拡張機能を Chromium に読み込んで操作）

```bash
npx playwright install chromium   # 初回だけ（テスト用の Chromium をダウンロード）
npm run e2e                       # ビルドしてから実行
HEADED=1 npm run e2e              # 画面を出して実行
VIDEO=1 npm run e2e               # 操作を動画に残す（e2e/.results/videos）
```

通常の Chrome は `--load-extension` を受け付けないため、Playwright のテスト用 Chromium を使います。
タブのドラッグ（少しずつ動かして置き場所が逆戻りしないか）、別ウィンドウへの移動、セットを開いたときの
固定タブ・タブグループの再現を、本物の Chrome API で確かめています（`e2e/`）。テストは各ファイルの隣（`*.test.ts`）にあります。
タブのドラッグ＆ドロップの書き換え（`src/features/tab-drag`）・グループの整合（`src/entities/window`）・位置計算・保存形式などを確認しています。

## Chrome への読み込み

1. `chrome://extensions` で「デベロッパー モード」を ON
2. 「パッケージ化されていない拡張機能を読み込む」で **`dist/` フォルダ**を選ぶ
3. ソースを変えたら `npm run build` → 拡張機能の ↻（再読み込み）

Windows で使うだけなら、ビルド済みの `dist/` をコピーして読み込めば OK（Node.js 不要）。

## 構成（Feature-Sliced Design）

`src/` は [FSD](https://feature-sliced.design/) の層に分けています。上の層は下の層だけを import でき、
同じ層の別スライスは import しません（`npm run lint:fsd` で確認。`npm run build` でも実行されます）。
スライスの外からは、各スライスの `index.ts`（公開 API）経由で import します。

```
src/
├── app/                 入り口（ページごとの main・バックグラウンド・全体のスタイル・エラー表示）
│   ├── background/      Chrome の起動時・メッセージで、セットを開く
│   ├── options/         設定画面の入り口
│   ├── popup/           ポップアップの入り口
│   ├── providers/       ErrorBoundary
│   └── styles/          Tailwind と shadcn/ui のテーマ
├── pages/
│   ├── options/         設定画面（セット・配置図・ウィンドウの編集をまとめる）
│   └── popup/           アイコンのクリックで開くセット選択
├── widgets/
│   ├── layout-preview/  配置図（interact.js でドラッグ移動・リサイズ、吸着とガイド線）
│   ├── set-list/        レイアウトセットの一覧（並べ替え・名前の変更・★）
│   └── window-editor/   ウィンドウの切り替えタブと、Chrome 風のタブ編集（横タブ・縦タブ）
├── features/
│   ├── tab-drag/        タブのドラッグ＆ドロップ（並び・固定・グループの決め方、ドラッグ中の表示）
│   ├── tab-strip/       Chrome のタブの向き（横・縦）の推測と切り替え
│   ├── capture-windows/ 今開いているウィンドウ配置の取り込み
│   ├── resolve-title/   URL のタイトルを開いているタブ・履歴から探す
│   └── open-set/        セットを実際に開く（ウィンドウ・固定タブ・タブグループ）
├── entities/
│   ├── layout-set/      レイアウトセットと保存形式（旧形式からの移行。データが無いときはセットなし）
│   └── window/          ウィンドウ・タブ・タブグループ・ディスプレイの型と計算
│       └── @x/          layout-set だけに見せる一部（FSD のクロスインポート）
├── shared/
│   ├── ui/              shadcn/ui のコンポーネント、ファビコン
│   └── lib/             id・URL・プラットフォーム判定・汎用フック
└── testing/             テスト用のデータ作り（テストからだけ使う）
```

- `public/manifest.json` … そのまま dist/ にコピー
- `e2e/` … Playwright の E2E テスト
- `scripts/check-fsd.mjs` … FSD の依存ルールの確認
