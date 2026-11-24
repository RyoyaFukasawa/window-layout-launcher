import { useCallback, useEffect, useRef, useState } from "react";
import { defaultState, loadState, saveState, STATE_KEY } from "./store";
import type { AppState } from "./types";

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
