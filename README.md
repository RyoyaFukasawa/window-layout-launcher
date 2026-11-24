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
タブのドラッグ＆ドロップの書き換え（`src/options/dragTabs.ts`）・グループの整合（`src/shared/groups.ts`）・位置計算・保存形式などを確認しています。

## Chrome への読み込み

1. `chrome://extensions` で「デベロッパー モード」を ON
2. 「パッケージ化されていない拡張機能を読み込む」で **`dist/` フォルダ**を選ぶ
3. ソースを変えたら `npm run build` → 拡張機能の ↻（再読み込み）

Windows で使うだけなら、ビルド済みの `dist/` をコピーして読み込めば OK（Node.js 不要）。

## 構成

- `src/background.ts` … セットを開く（起動時の ★ セット、ポップアップ・設定画面からの指示）
- `src/popup/` … アイコンのクリックで開くセット選択（検索、今のウィンドウをセットとして保存）
- `src/options/` … 設定画面（React + Tailwind CSS + shadcn/ui）
  - `App.tsx` … 画面全体、並べ替え（dnd-kit）、キーボード操作
  - `LayoutPreview.tsx` … 配置図（interact.js でドラッグ移動・リサイズ、吸着とガイド線）
  - `WindowCard.tsx` … ウィンドウごとの設定
  - `dragTabs.ts` … タブのドラッグ＆ドロップで並び・固定・グループをどう変えるか（React に依存しない）
  - `ChromeFrame.tsx` … タブを実際の Chrome の見た目（横タブ／縦タブ）で表示・編集。タブの向きはウィンドウの枠の大きさから推測（`hooks.ts` の `detectTabStrip`）し、手動でも切り替え可
  - `logic.ts` / `hooks.ts` … 計算・保存・ディスプレイ情報
- `src/shared/` … 共通の型・位置計算・初期値・保存形式（`store.ts`、旧形式からの移行を含む）・タブグループの整合（`groups.ts`）
- `src/components/ui/` … shadcn/ui のコンポーネント（`npx shadcn@latest add ...` で追加）
- `public/manifest.json` … そのまま dist/ にコピー
