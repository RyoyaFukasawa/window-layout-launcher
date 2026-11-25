import { ensureIds, type Layouts, type Mode, type WindowSpec } from "@/entities/window/@x/layout-set";
import { newId } from "@/shared/lib/id";
import type { AppState, LayoutSet } from "./types";

// 保存形式（chrome.storage.local の "appState"）と、旧形式からの移行

export const STATE_KEY = "appState";

export function newSet(name: string, layouts?: Layouts): LayoutSet {
  return { id: newId("s"), name, layouts: ensureIds(layouts ? structuredClone(layouts) : { docked: [], laptop: [] }) };
}

/** データが無いときの状態（セットなし） */
export function defaultState(): AppState {
  return { version: 2, sets: [], startupSetId: null };
}

function normalize(s: AppState): AppState {
  for (const set of s.sets) ensureIds(set.layouts);
  if (s.startupSetId && !s.sets.some((x) => x.id === s.startupSetId)) s.startupSetId = null;
  return s;
}

/** 保存済みの状態を読む。旧形式（layouts だけ）なら「メイン」セットとして移行する */
export async function loadState(): Promise<AppState> {
  const stored = await chrome.storage.local.get([STATE_KEY, "layouts"]);
  const st = stored[STATE_KEY] as AppState | undefined;
  if (st?.sets) return normalize(st);
  const old = stored.layouts as Layouts | undefined;
  if (old) {
    const set = newSet("メイン", old);
    return { version: 2, sets: [set], startupSetId: set.id };
  }
  return defaultState();
}

export const saveState = (s: AppState) => chrome.storage.local.set({ [STATE_KEY]: s });

/** そのモードのレイアウトが空なら、もう一方を使う */
export function layoutFor(set: LayoutSet, mode: Mode): WindowSpec[] {
  const other: Mode = mode === "docked" ? "laptop" : "docked";
  return set.layouts[mode]?.length ? set.layouts[mode] : (set.layouts[other] ?? []);
}

export function setStats(set: LayoutSet, mode: Mode) {
  const wins = layoutFor(set, mode);
  const tabs = wins.flatMap((w) => w.tabs.filter((t) => t.url));
  return { windows: wins.length, tabs: tabs.length, sample: tabs.slice(0, 10) };
}

/** 書き出した JSON を読み込む（新形式はそのまま、旧形式は 1 つのセットとして） */
export function parseImported(data: unknown): { kind: "state"; state: AppState } | { kind: "set"; set: LayoutSet } {
  const d = data as Partial<AppState> & { layouts?: Layouts };
  if (Array.isArray(d?.sets)) return { kind: "state", state: normalize({ version: 2, sets: d.sets, startupSetId: d.startupSetId ?? null }) };
  const l = d?.layouts ?? (data as Layouts);
  if (l && Array.isArray(l.docked) && Array.isArray(l.laptop)) return { kind: "set", set: newSet("読み込んだセット", l) };
  throw new Error("形式が違います");
}
