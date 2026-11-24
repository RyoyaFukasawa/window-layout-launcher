// ディスプレイの選び方とウィンドウ位置の計算（background と設定画面で共通）
import type { Area, Bounds, Display, DisplayKind, Rect, WindowSpec } from "./types";

export const DISPLAY_OPTIONS: [DisplayKind, string][] = [
  ["external", "外部ディスプレイ"],
  ["internal", "ノートPC本体の画面"],
  ["primary", "メインディスプレイ"],
  ["secondary", "メイン以外のディスプレイ"],
  ["leftmost", "いちばん左のディスプレイ"],
  ["rightmost", "いちばん右のディスプレイ"],
];

export const AREA_OPTIONS: [Area, string][] = [
  ["max", "最大化"],
  ["full", "画面いっぱい"],
  ["left", "左半分"],
  ["right", "右半分"],
  ["top", "上半分"],
  ["bottom", "下半分"],
  ["custom", "カスタム（%指定）"],
];

const PRESET_RECTS: Record<Exclude<Area, "custom">, Rect> = {
  max: { x: 0, y: 0, w: 100, h: 100 },
  full: { x: 0, y: 0, w: 100, h: 100 },
  left: { x: 0, y: 0, w: 50, h: 100 },
  right: { x: 50, y: 0, w: 50, h: 100 },
  top: { x: 0, y: 0, w: 100, h: 50 },
  bottom: { x: 0, y: 50, w: 100, h: 50 },
};

export function pickDisplay(displays: Display[], kind: DisplayKind): Display {
  const primary = displays.find((d) => d.isPrimary) ?? displays[0];
  const internal = displays.find((d) => d.isInternal);
  const nonPrimary = displays.find((d) => !d.isPrimary);
  const byLeft = [...displays].sort((a, b) => a.bounds.left - b.bounds.left);
  switch (kind) {
    case "internal":
      return internal ?? primary;
    case "external":
      // 本体画面が判別できればそれ以外、できなければメイン以外
      return internal ? (displays.find((d) => d !== internal) ?? primary) : (nonPrimary ?? primary);
    case "secondary":
      return nonPrimary ?? primary;
    case "leftmost":
      return byLeft[0];
    case "rightmost":
      return byLeft[byLeft.length - 1];
    default:
      return primary;
  }
}

/** ウィンドウの位置を作業領域に対する % で返す */
export function rectPercent(win: WindowSpec): Rect {
  if (win.area === "custom") return win.custom ?? PRESET_RECTS.full;
  return PRESET_RECTS[win.area] ?? PRESET_RECTS.full;
}

export function resolveBounds(workArea: Bounds, win: WindowSpec): Bounds {
  const r = rectPercent(win);
  return {
    left: Math.round(workArea.left + (workArea.width * r.x) / 100),
    top: Math.round(workArea.top + (workArea.height * r.y) / 100),
    width: Math.round((workArea.width * r.w) / 100),
    height: Math.round((workArea.height * r.h) / 100),
  };
}

export type AreaGuess = { area: Exclude<Area, "custom"> } | { area: "custom"; custom: Rect };

/** 実際のウィンドウ位置から、近いプリセット（なければ custom）を推定する */
export function guessArea(workArea: Bounds, b: Bounds, maximized: boolean): AreaGuess {
  if (maximized) return { area: "max" };
  const pct = (v: number, total: number) => Math.round((v / total) * 1000) / 10;
  const r: Rect = {
    x: Math.max(0, pct(b.left - workArea.left, workArea.width)),
    y: Math.max(0, pct(b.top - workArea.top, workArea.height)),
    w: Math.min(100, pct(b.width, workArea.width)),
    h: Math.min(100, pct(b.height, workArea.height)),
  };
  const near = (p: Rect) => (["x", "y", "w", "h"] as const).every((k) => Math.abs(p[k] - r[k]) <= 3);
  for (const area of ["full", "left", "right", "top", "bottom"] as const) {
    if (near(PRESET_RECTS[area])) return { area };
  }
  return { area: "custom", custom: r };
}

export function areaLabel(g: AreaGuess): string {
  if (g.area === "custom") return `${Math.round(g.custom.w)}% × ${Math.round(g.custom.h)}%`;
  return AREA_OPTIONS.find(([a]) => a === g.area)?.[1] ?? g.area;
}

export function displayContaining(displays: Display[], b: Bounds): Display {
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  return displays.find((d) => cx >= d.bounds.left && cx < d.bounds.left + d.bounds.width
    && cy >= d.bounds.top && cy < d.bounds.top + d.bounds.height)
    ?? nearestDisplay(displays, cx, cy);
}

function nearestDisplay(displays: Display[], x: number, y: number): Display {
  const dist = (d: Display) => {
    const dx = Math.max(d.bounds.left - x, 0, x - (d.bounds.left + d.bounds.width));
    const dy = Math.max(d.bounds.top - y, 0, y - (d.bounds.top + d.bounds.height));
    return dx * dx + dy * dy;
  };
  return [...displays].sort((a, b) => dist(a) - dist(b))[0];
}
