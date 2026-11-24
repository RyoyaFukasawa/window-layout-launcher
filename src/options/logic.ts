// 設定画面のロジック（React に依存しない部分）
import { displayContaining, guessArea } from "@/shared/geometry";
import { normalizeGroups } from "@/shared/groups";
import type { Bounds, Display, DisplayKind, GroupColor, GroupSpec, Mode, Rect, TabSpec, WindowSpec } from "@/shared/types";

export const WINDOW_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];
export const colorOf = (i: number) => WINDOW_COLORS[i % WINDOW_COLORS.length];

export const IS_MAC = /Mac/i.test(navigator.platform);

export { newId, ensureIds } from "@/shared/store";
import { newId } from "@/shared/store";

export const shownDisplays = (displays: Display[], mode: Mode) =>
  mode === "laptop" ? [displays.find((d) => d.isPrimary) ?? displays[0]] : displays;

export const shortName = (d: Display, displays: Display[]) =>
  `${displays.indexOf(d) + 1} ${d.isInternal ? "本体" : "外部"}${d.isPrimary ? "・メイン" : ""}`;

/** 実際のディスプレイから、保存用の「ディスプレイの種類」を決める */
export function displayKind(d: Display, displays: Display[], mode: Mode): DisplayKind {
  if (mode === "laptop") return "primary";
  if (d.isInternal) return "internal";
  const hasInternal = displays.some((x) => x.isInternal);
  const externals = displays.filter((x) => !x.isInternal);
  if (hasInternal && externals.length === 1) return "external";
  if (displays.length > 2) {
    const byLeft = [...displays].sort((a, b) => a.bounds.left - b.bounds.left);
    if (d === byLeft[0]) return "leftmost";
    if (d === byLeft[byLeft.length - 1]) return "rightmost";
  }
  return d.isPrimary ? "primary" : "secondary";
}

export function fitInto(wa: Bounds, r: Bounds): Bounds {
  const width = Math.min(r.width, wa.width), height = Math.min(r.height, wa.height);
  return {
    left: Math.min(Math.max(r.left, wa.left), wa.left + wa.width - width),
    top: Math.min(Math.max(r.top, wa.top), wa.top + wa.height - height),
    width, height,
  };
}

/** 画面座標の矩形をウィンドウ設定に反映する（w を直接書き換える） */
export function applyBounds(w: WindowSpec, r: Bounds, displays: Display[], mode: Mode, snap = true) {
  const d = displayContaining(shownDisplays(displays, mode), r);
  const wa = d.workArea;
  const f = fitInto(wa, r);
  const round = (v: number) => Math.round(v * 10) / 10;
  const snapTo = (v: number) => (snap ? [0, 33.3, 50, 66.7, 100].find((s) => Math.abs(s - v) <= 1.5) : undefined) ?? round(v);
  const x1 = snapTo(((f.left - wa.left) / wa.width) * 100), x2 = snapTo(((f.left + f.width - wa.left) / wa.width) * 100);
  const y1 = snapTo(((f.top - wa.top) / wa.height) * 100), y2 = snapTo(((f.top + f.height - wa.top) / wa.height) * 100);
  const custom: Rect = { x: x1, y: y1, w: round(x2 - x1), h: round(y2 - y1) };
  const bounds: Bounds = {
    left: wa.left + (wa.width * custom.x) / 100, top: wa.top + (wa.height * custom.y) / 100,
    width: (wa.width * custom.w) / 100, height: (wa.height * custom.h) / 100,
  };
  const g = snap ? guessArea(wa, bounds, false) : { area: "custom" as const, custom };
  w.display = displayKind(d, displays, mode);
  if (!(g.area === "full" && w.area === "max")) {
    w.area = g.area;
    if (g.area === "custom") w.custom = g.custom;
  }
}

/** 今開いている Chrome のウィンドウ配置を読み取る */
export async function captureWindows(displays: Display[], mode: Mode): Promise<WindowSpec[]> {
  const self = chrome.runtime.getURL("");
  const all = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const result: WindowSpec[] = [];
  for (const win of all) {
    // Chrome のグループ id → 保存用のグループ
    const groupMap = new Map<number, GroupSpec>();
    for (const t of win.tabs ?? []) {
      if (t.groupId === undefined || t.groupId < 0 || groupMap.has(t.groupId)) continue;
      try {
        const g = await chrome.tabGroups.get(t.groupId);
        groupMap.set(t.groupId, { id: newId("g"), title: g.title ?? "", color: g.color as GroupColor, collapsed: g.collapsed || undefined });
      } catch { /* 権限がない等。グループなしで取り込む */ }
    }
    const tabs: TabSpec[] = (win.tabs ?? [])
      .map((t) => ({
        id: newId("t"), url: t.pendingUrl || t.url || "", pinned: t.pinned, title: t.title || undefined,
        group: t.groupId !== undefined && t.groupId >= 0 ? groupMap.get(t.groupId)?.id : undefined,
      }))
      .filter((t) => t.url && !t.url.startsWith(self) && !t.url.startsWith("chrome://newtab"));
    if (!tabs.length) continue;
    const b: Bounds = { left: win.left ?? 0, top: win.top ?? 0, width: win.width ?? 800, height: win.height ?? 600 };
    const d = displayContaining(displays, b);
    const g = guessArea(d.workArea, b, win.state === "maximized" || win.state === "fullscreen");
    const spec: WindowSpec = { id: newId("w"), display: displayKind(d, displays, mode), ...g, tabs, groups: [...groupMap.values()] };
    normalizeGroups(spec);
    result.push(spec);
  }
  return result;
}

export const faviconUrl = (url: string) => {
  if (!/^https?:/.test(url)) return null;
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", url);
  u.searchParams.set("size", "32");
  return u.toString();
};

export interface DroppedUrl { url: string; title?: string }

/** ブラウザのタブ・リンク・アドレスバーからドロップされた URL（とリンク文字列）を取り出す */
export function urlFromDrop(dt: DataTransfer | null): DroppedUrl | null {
  if (!dt) return null;
  const list = dt.getData("text/uri-list").split(/\r?\n/).find((l) => l && !l.startsWith("#"));
  const text = list || dt.getData("text/plain").trim();
  if (!/^https?:\/\/\S+$/.test(text)) return null;
  // リンクをドラッグした場合は <a>リンク文字列</a> が text/html に入っている
  const html = dt.getData("text/html");
  const title = html ? new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() : "";
  return { url: text, title: title && title !== text ? title : undefined };
}

const normalizeUrl = (u: string) => u.replace(/#.*$/, "").replace(/\/+$/, "");

/** URL のタイトルを、開いているタブ → 閲覧履歴の順に探す（外部への通信はしない） */
export async function lookupTitle(url: string): Promise<string | null> {
  const target = normalizeUrl(url);
  try {
    const tabs = await chrome.tabs.query({});
    const open = tabs.find((t) => t.url && t.title && normalizeUrl(t.url) === target);
    if (open?.title) return open.title;
  } catch { /* 取得できなくても続ける */ }
  try {
    const items = await chrome.history.search({ text: url, startTime: 0, maxResults: 50 });
    const exact = items.find((h) => h.url && h.title && normalizeUrl(h.url) === target);
    if (exact?.title) return exact.title;
  } catch { /* 履歴の権限がない等 */ }
  return null;
}

/** タイトルが無いときの表示（ドメイン＋パス） */
export function fallbackTitle(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return url;
  }
}
export const isUrlDrag = (dt: DataTransfer | null) =>
  !!dt && (dt.types.includes("text/uri-list") || dt.types.includes("text/plain"));

/** URL 欄の入力に https:// を補う（「example.com/path」→「https://example.com/path」） */
export function normalizeInput(v: string) {
  const s = v.trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return /^[^\s/]+\.[^\s/]+/.test(s) ? `https://${s}` : s;
}
