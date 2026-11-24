// 初期値。普段は設定画面（拡張機能アイコンを右クリック →「オプション」）で編集する。
// 設定画面で保存した内容があれば、そちらが優先される。
import type { Layouts } from "./types";

export const LAYOUTS: Layouts = {
  // ディスプレイが2枚以上のとき
  docked: [
    {
      display: "external",
      area: "max",
      tabs: [
        { url: "https://example.com", pinned: true },
        { url: "https://example.org", pinned: true },
        { url: "https://www.wikipedia.org" },
      ],
    },
    {
      display: "internal",
      area: "left",
      tabs: [{ url: "https://developer.chrome.com/docs/extensions" }],
    },
  ],

  // ノートPCの画面だけのとき
  laptop: [
    {
      display: "primary",
      area: "left",
      tabs: [
        { url: "https://example.com", pinned: true },
        { url: "https://example.org", pinned: true },
        { url: "https://www.wikipedia.org" },
      ],
    },
    {
      display: "primary",
      area: "right",
      tabs: [{ url: "https://developer.chrome.com/docs/extensions" }],
    },
  ],
};

/** Chrome起動時に開く空の「新しいタブ」だけのウィンドウを閉じるか */
export const CLOSE_EMPTY_STARTUP_WINDOWS = true;
