import type { Bounds, Display, DisplayKind, Mode, Rect, WindowSpec } from "../model/types";
import { displayContaining, guessArea } from "./geometry";

/**
 * ノートPCのみのときに使う画面。ノートPCだけで使うときの画面＝本体の画面（判別できなければメイン）。
 * 外部ディスプレイをつないで編集していても、本体の画面を基準にする
 */
export const laptopDisplay = (displays: Display[]): Display =>
  displays.find((d) => d.isInternal) ?? displays.find((d) => d.isPrimary) ?? displays[0];

/** 配置図に出す画面（ノートPCのみのときは本体の画面だけ） */
export const shownDisplays = (displays: Display[], mode: Mode) =>
  mode === "laptop" ? [laptopDisplay(displays)] : displays;

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
