// タブグループの共通処理
import type { GroupColor, GroupSpec, TabSpec, WindowSpec } from "./types";

/** Chrome のグループ色（ライト表示での近い色） */
export const GROUP_COLORS: Record<GroupColor, { hex: string; label: string }> = {
  grey: { hex: "#5f6368", label: "グレー" },
  blue: { hex: "#1a73e8", label: "青" },
  red: { hex: "#d93025", label: "赤" },
  yellow: { hex: "#e8a700", label: "黄" },
  green: { hex: "#188038", label: "緑" },
  pink: { hex: "#d01884", label: "ピンク" },
  purple: { hex: "#a142f4", label: "紫" },
  cyan: { hex: "#007b83", label: "シアン" },
  orange: { hex: "#fa903e", label: "オレンジ" },
};
export const GROUP_COLOR_KEYS = Object.keys(GROUP_COLORS) as GroupColor[];

export const groupOf = (w: WindowSpec, t: TabSpec): GroupSpec | undefined =>
  t.group ? w.groups?.find((g) => g.id === t.group) : undefined;

/** 次に使う色（そのウィンドウでまだ使っていない色を優先） */
export function nextGroupColor(w: WindowSpec): GroupColor {
  const used = new Set((w.groups ?? []).map((g) => g.color));
  return GROUP_COLOR_KEYS.find((c) => c !== "grey" && !used.has(c)) ?? "blue";
}

/**
 * グループの整合をとる（w を直接書き換える）
 * - 固定タブはグループに入れない（Chrome でも入れられない）
 * - 存在しないグループへの参照を外す、タブが無いグループを消す
 * - 同じグループのタブを、最初のタブの位置にまとめる（Chrome では連続している必要がある）
 * - 固定タブを先頭に並べる（Chrome と同じ）
 */
export function normalizeGroups(w: WindowSpec) {
  const groups = w.groups ?? [];
  for (const t of w.tabs) {
    if (t.group && (t.pinned || !groups.some((g) => g.id === t.group))) delete t.group;
  }
  const order: TabSpec[] = w.tabs.filter((t) => t.pinned);
  const placed = new Set<string>();
  for (const t of w.tabs) {
    if (t.pinned) continue;
    if (!t.group) { order.push(t); continue; }
    if (placed.has(t.group)) continue;
    placed.add(t.group);
    order.push(...w.tabs.filter((x) => x.group === t.group));
  }
  w.tabs = order;
  const live = groups.filter((g) => placed.has(g.id));
  if (live.length) w.groups = live;
  else delete w.groups;
}

/** 並べ替えで移動したタブのグループを、前後のタブから決める（Chrome と同じ考え方） */
export function adoptNeighborGroup(w: WindowSpec, tabId: string) {
  const i = w.tabs.findIndex((t) => t.id === tabId);
  if (i < 0) return;
  const t = w.tabs[i], prev = w.tabs[i - 1]?.group, next = w.tabs[i + 1]?.group;
  if (t.pinned) return;
  if (prev && prev === next) t.group = prev;
  else if (t.group && (prev === t.group || next === t.group)) { /* そのまま */ }
  else delete t.group;
}

/**
 * 並べ替えで移動したタブを、置いた場所で固定／解除する（Chrome と同じ考え方）
 * - 固定タブの前、または固定タブどうしの間 → 固定
 * - 固定でないタブの後ろ → 固定を外す
 * - 固定と通常の境目 → 今のまま
 */
export function adoptNeighborPinned(w: WindowSpec, tabId: string) {
  const i = w.tabs.findIndex((t) => t.id === tabId);
  if (i < 0) return;
  const t = w.tabs[i], prev = w.tabs[i - 1], next = w.tabs[i + 1];
  if (next?.pinned && (!prev || prev.pinned)) { t.pinned = true; delete t.group; }
  else if (prev && !prev.pinned) t.pinned = false;
}
