import { useEffect, useState } from "react";

export type TabStrip = "horizontal" | "vertical";
export type TabStripPref = "auto" | TabStrip;
const PREF_KEY = "tabStripPref";

/**
 * Chrome のタブが横（上）か縦（左）かを推測する。拡張機能から設定を読む API は無いので、
 * ウィンドウの外枠と表示領域の差（上のツールバー類の高さ・左の幅）から判断する。
 * - 横タブ：左右の差はほぼ 0、上は タブ列＋ツールバー で 80px 以上
 * - 縦タブ：左に縦のタブ列（折りたたみ時でも 40px 以上）、上は ツールバーだけ
 * サイドパネルを開いていると左右の差が大きくなるので、上の高さも合わせて見る
 */
export function detectTabStrip(zoom = 1): { strip: TabStrip; side: number; top: number } {
  const side = Math.round(window.outerWidth - window.innerWidth * zoom);
  const top = Math.round(window.outerHeight - window.innerHeight * zoom);
  const strip: TabStrip = side >= 40 && top < 95 ? "vertical" : "horizontal";
  return { strip, side, top };
}

export function useTabStrip() {
  const [pref, setPrefState] = useState<TabStripPref>("auto");
  const [detected, setDetected] = useState<ReturnType<typeof detectTabStrip>>({ strip: "horizontal", side: 0, top: 0 });
  useEffect(() => {
    void chrome.storage.local.get(PREF_KEY).then((r) => { if (r[PREF_KEY]) setPrefState(r[PREF_KEY] as TabStripPref); });
    const measure = async () => {
      let zoom = 1;
      try { zoom = await chrome.tabs.getZoom(); } catch { /* タブの外では取得できない */ }
      setDetected(detectTabStrip(zoom));
    };
    void measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const setPref = (p: TabStripPref) => { setPrefState(p); void chrome.storage.local.set({ [PREF_KEY]: p }); };
  return { pref, setPref, detected, strip: pref === "auto" ? detected.strip : pref };
}
