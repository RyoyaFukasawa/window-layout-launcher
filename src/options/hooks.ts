import { useCallback, useEffect, useRef, useState } from "react";
import { STATE_KEY, defaultState, loadState, saveState } from "@/shared/store";
import type { AppState, Display } from "@/shared/types";

/**
 * 保存済みの状態（全セット）。変更は 300ms 後に自動保存。
 * ポップアップなど別の画面で変わったときは、その内容に追従する。
 */
export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const lastJson = useRef<string | null>(null);

  useEffect(() => {
    void loadState().then((s) => { lastJson.current = JSON.stringify(s); setState(s); });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const next = changes[STATE_KEY]?.newValue as AppState | undefined;
      if (area !== "local" || !next) return;
      const json = JSON.stringify(next);
      if (json === lastJson.current) return; // 自分で保存したもの
      lastJson.current = json;
      setState(next);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  useEffect(() => {
    if (!state) return;
    const json = JSON.stringify(state);
    if (json === lastJson.current) return;
    const t = window.setTimeout(() => {
      lastJson.current = json;
      void saveState(state).then(() => setSavedAt(Date.now()));
    }, 300);
    return () => window.clearTimeout(t);
  }, [state]);

  /** 複製したうえで fn に書き換えさせる */
  const update = useCallback((fn: (draft: AppState) => void) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  /** すぐに保存したいとき（ポップアップを閉じる直前など） */
  const saveNow = useCallback(async (s: AppState) => {
    lastJson.current = JSON.stringify(s);
    setState(s);
    await saveState(s);
  }, []);

  const replace = useCallback((s: AppState) => setState(structuredClone(s)), []);
  const reset = useCallback(() => setState(defaultState()), []);

  return { state, update, replace, reset, saveNow, savedAt };
}

export function useDisplays() {
  const [displays, setDisplays] = useState<Display[]>([]);
  useEffect(() => {
    const load = () => void chrome.system.display.getInfo().then(setDisplays);
    load();
    chrome.system.display.onDisplayChanged.addListener(load);
    return () => chrome.system.display.onDisplayChanged.removeListener(load);
  }, []);
  return displays;
}

/** OS のダークモードに合わせて <html class="dark"> を切り替える */
export function useSystemDark() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
}

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

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
