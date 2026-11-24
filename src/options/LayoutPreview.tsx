import { groupOf } from "@/shared/groups";
import { useEffect, useMemo, useRef, useState } from "react";
import interact from "interactjs";
import { areaLabel, displayContaining, guessArea, pickDisplay, resolveBounds } from "@/shared/geometry";
import type { Bounds, Display, WindowSpec } from "@/shared/types";
import { cn } from "@/lib/utils";
import { useElementSize } from "./hooks";
import { Favicon } from "./Favicon";
import { IS_MAC, colorOf, fallbackTitle, fitInto, isUrlDrag, shortName, urlFromDrop, type DroppedUrl } from "./logic";

interface View { minX: number; minY: number; scale: number; offX: number; offY: number }
type Edges = { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean };

interface Props {
  windows: WindowSpec[];
  displays: Display[];
  shown: Display[];
  selected: number;
  version: number;
  onSelect: (i: number) => void;
  onCommit: (i: number, screen: Bounds, resized: boolean) => void;
  onToggleMax: (i: number) => void;
  onDropUrlOnWindow: (i: number, drop: DroppedUrl) => void;
  onDropUrlOnDisplay: (d: Display, drop: DroppedUrl) => void;
}

const SNAP_PX = 8;
const MIN = 28;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

const toPreview = (v: View, r: Bounds): Bounds => ({
  left: v.offX + (r.left - v.minX) * v.scale,
  top: v.offY + (r.top - v.minY) * v.scale,
  width: r.width * v.scale,
  height: r.height * v.scale,
});
const rectOf = (e: HTMLElement): Bounds => {
  const px = (s: string) => parseFloat(s) || 0;
  return { left: px(e.style.left), top: px(e.style.top), width: px(e.style.width), height: px(e.style.height) };
};
const setRect = (e: HTMLElement, r: Bounds) =>
  Object.assign(e.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
const toScreen = (v: View, r: Bounds): Bounds => ({
  left: v.minX + (r.left - v.offX) / v.scale,
  top: v.minY + (r.top - v.offY) / v.scale,
  width: r.width / v.scale,
  height: r.height / v.scale,
});
const box = (r: Bounds) => ({ left: r.left, top: r.top, width: r.width, height: r.height });

export function LayoutPreview(props: Props) {
  const { windows, displays, shown, selected, version } = props;
  const [stageRef, size] = useElementSize<HTMLDivElement>();
  const [guides, setGuides] = useState<{ gx: number[]; gy: number[] }>({ gx: [], gy: [] });
  const [live, setLive] = useState<{ text: string; left: number; top: number; display: number } | null>(null);
  const [urlOver, setUrlOver] = useState<number | "stage" | null>(null);

  const view = useMemo<View | null>(() => {
    if (!displays.length || !size.width) return null;
    const minX = Math.min(...displays.map((d) => d.bounds.left));
    const minY = Math.min(...displays.map((d) => d.bounds.top));
    const maxX = Math.max(...displays.map((d) => d.bounds.left + d.bounds.width));
    const maxY = Math.max(...displays.map((d) => d.bounds.top + d.bounds.height));
    const pad = 20;
    const scale = Math.min((size.width - pad * 2) / (maxX - minX), (size.height - pad * 2) / (maxY - minY));
    return { minX, minY, scale, offX: (size.width - (maxX - minX) * scale) / 2, offY: (size.height - (maxY - minY) * scale) / 2 };
  }, [displays, size.width, size.height]);

  // interact.js のイベントから最新の値を参照するための ref
  const latest = useRef({ props, view, shown });
  latest.current = { props, view, shown };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let raw: Bounds | null = null;

    const snapTargets = (self: HTMLElement) => {
      const { view: v, shown: sh } = latest.current;
      const xs: number[] = [], ys: number[] = [];
      if (!v) return { xs, ys };
      for (const d of sh) {
        const p = toPreview(v, d.workArea);
        for (const f of [0, 1 / 3, 1 / 2, 2 / 3, 1]) xs.push(p.left + p.width * f);
        for (const f of [0, 1 / 2, 1]) ys.push(p.top + p.height * f);
      }
      stage.querySelectorAll<HTMLElement>(".pwin").forEach((o) => {
        if (o === self) return;
        const r = rectOf(o);
        xs.push(r.left, r.left + r.width);
        ys.push(r.top, r.top + r.height);
      });
      return { xs, ys };
    };
    const nearest = (val: number, list: number[]) => {
      let best: number | null = null;
      for (const t of list) if (Math.abs(t - val) <= SNAP_PX && (best === null || Math.abs(t - val) < Math.abs(best - val))) best = t;
      return best;
    };
    const snapRect = (rawR: Bounds, self: HTMLElement, edges: Edges | null) => {
      const { xs, ys } = snapTargets(self);
      const r = { ...rawR };
      const gx: number[] = [], gy: number[] = [];
      if (!edges) {
        const pick = (cands: number[], list: number[]) => {
          let best: { diff: number; at: number } | null = null;
          for (const c of cands) {
            const t = nearest(c, list);
            if (t !== null && (!best || Math.abs(t - c) < Math.abs(best.diff))) best = { diff: t - c, at: t };
          }
          return best;
        };
        const bx = pick([r.left, r.left + r.width / 2, r.left + r.width], xs);
        if (bx) { r.left += bx.diff; gx.push(bx.at); }
        const by = pick([r.top, r.top + r.height / 2, r.top + r.height], ys);
        if (by) { r.top += by.diff; gy.push(by.at); }
      } else {
        if (edges.left) { const t = nearest(r.left, xs); if (t !== null) { r.width += r.left - t; r.left = t; gx.push(t); } }
        if (edges.right) { const t = nearest(r.left + r.width, xs); if (t !== null) { r.width = t - r.left; gx.push(t); } }
        if (edges.top) { const t = nearest(r.top, ys); if (t !== null) { r.height += r.top - t; r.top = t; gy.push(t); } }
        if (edges.bottom) { const t = nearest(r.top + r.height, ys); if (t !== null) { r.height = t - r.top; gy.push(t); } }
      }
      return { r, gx, gy };
    };

    const showLive = (t: HTMLElement) => {
      const { view: v, shown: sh, props: p } = latest.current;
      if (!v) return;
      const r = rectOf(t);
      const scr = toScreen(v, r);
      const d = displayContaining(sh, scr);
      const label = areaLabel(guessArea(d.workArea, fitInto(d.workArea, scr), false));
      setLive({ text: `${shortName(d, p.displays)} · ${label}`, left: r.left, top: r.top, display: p.displays.indexOf(d) });
    };
    const apply = (t: HTMLElement, rawR: Bounds, edges: Edges | null) => {
      const { r, gx, gy } = snapRect(rawR, t, edges);
      if (r.width < MIN) { if (edges?.left) r.left -= MIN - r.width; r.width = MIN; }
      if (r.height < MIN) { if (edges?.top) r.top -= MIN - r.height; r.height = MIN; }
      setRect(t, r);
      setGuides({ gx, gy });
      showLive(t);
    };
    const start = (e: { target: unknown }) => {
      const t = e.target as HTMLElement;
      raw = rectOf(t);
      t.dataset.dragging = "true";
    };
    const end = (e: { target: unknown }, resized: boolean) => {
      const t = e.target as HTMLElement;
      raw = null;
      delete t.dataset.dragging;
      setGuides({ gx: [], gy: [] });
      setLive(null);
      const { view: v, props: p } = latest.current;
      if (v) p.onCommit(Number(t.dataset.index), toScreen(v, rectOf(t)), resized);
    };

    const it = interact(".pwin", { context: stage })
      .draggable({
        listeners: {
          start,
          move(e) { if (!raw) return; raw.left += e.dx; raw.top += e.dy; apply(e.target as HTMLElement, raw, null); },
          end: (e) => end(e, false),
        },
      })
      .resizable({
        edges: { left: true, right: true, top: true, bottom: true },
        margin: 9,
        listeners: {
          start,
          move(e) {
            if (!raw) return;
            const d = e.deltaRect ?? { left: 0, top: 0, width: 0, height: 0 };
            raw.left += d.left; raw.top += d.top; raw.width += d.width; raw.height += d.height;
            apply(e.target as HTMLElement, raw, e.edges as Edges);
          },
          end: (e) => end(e, true),
        },
      });
    return () => { it.unset(); };
  }, [stageRef]);

  // 配置図へのURLドロップ
  const onDragOver = (e: React.DragEvent) => {
    if (!isUrlDrag(e.dataTransfer)) return;
    e.preventDefault();
    const w = (e.target as Element).closest<HTMLElement>(".pwin");
    setUrlOver(w ? Number(w.dataset.index) : "stage");
  };
  const onDrop = (e: React.DragEvent) => {
    setUrlOver(null);
    const drop = urlFromDrop(e.dataTransfer);
    if (!drop || !view) return;
    e.preventDefault();
    const w = (e.target as Element).closest<HTMLElement>(".pwin");
    if (w) return props.onDropUrlOnWindow(Number(w.dataset.index), drop);
    const rect = stageRef.current!.getBoundingClientRect();
    const pt = toScreen(view, { left: e.clientX - rect.left, top: e.clientY - rect.top, width: 0, height: 0 });
    props.onDropUrlOnDisplay(displayContaining(shown, pt), drop);
  };

  return (
    <div
      ref={stageRef}
      className={cn(
        "relative h-[400px] overflow-hidden rounded-xl border bg-muted/40 transition-colors",
        urlOver === "stage" && "border-emerald-500 bg-emerald-500/5",
      )}
      style={{ backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
      onPointerDown={(e) => { if (!(e.target as Element).closest(".pwin")) props.onSelect(-1); }}
      onDragOver={onDragOver}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setUrlOver(null); }}
      onDrop={onDrop}
    >
      {view && displays.map((d, i) => {
        const p = toPreview(view, d.bounds);
        return (
          <div
            key={d.id}
            className={cn(
              "absolute overflow-hidden rounded-md border bg-background shadow-sm transition-colors",
              live?.display === i && "border-emerald-500 ring-2 ring-emerald-500/30",
            )}
            style={box(p)}
          >
            <SystemBars d={d} scale={view.scale} />
            <span
              className="pointer-events-none absolute text-[11px] font-medium text-muted-foreground"
              style={{
                left: (d.workArea.left - d.bounds.left) * view.scale + 8,
                bottom: (d.bounds.top + d.bounds.height - d.workArea.top - d.workArea.height) * view.scale + 6,
              }}
            >
              {shortName(d, displays)}
            </span>
          </div>
        );
      })}

      {view && windows.map((w, i) => {
        const r = toPreview(view, resolveBounds(pickDisplay(shown, w.display).workArea, w));
        const color = colorOf(i);
        const tabs = w.tabs.filter((t) => t.url);
        const sel = i === selected;
        const label = areaLabel(w.area === "custom" ? { area: "custom", custom: w.custom ?? { x: 0, y: 0, w: 100, h: 100 } } : { area: w.area });
        return (
          <div
            key={`${w.id}-${version}`}
            data-index={i}
            className={cn(
              "pwin group absolute flex touch-none select-none flex-col items-center justify-center gap-1 overflow-hidden rounded-md border-2 backdrop-blur-[1px] transition-shadow",
              "cursor-grab active:cursor-grabbing data-[dragging=true]:z-20 data-[dragging=true]:shadow-2xl",
              sel && "z-10 shadow-lg",
              urlOver === i && "outline-2 outline-dashed outline-emerald-500 -outline-offset-4",
            )}
            style={{
              ...box(r),
              borderColor: color,
              background: `color-mix(in oklab, ${color} ${sel ? 30 : 16}%, transparent)`,
              color,
            }}
            title={tabs.map((t) => { const g = groupOf(w, t); return `${t.pinned ? "📌 " : ""}${g ? `[${g.title || "グループ"}] ` : ""}${t.title || fallbackTitle(t.url)}`; }).join("\n")}
            onPointerDown={() => props.onSelect(i)}
            onDoubleClick={() => props.onToggleMax(i)}
          >
            <span className="text-base font-bold leading-none">{i + 1}</span>
            <span className="pointer-events-none whitespace-nowrap text-[11px] font-medium opacity-90">{label} · タブ{tabs.length}</span>
            <span className="pointer-events-none flex gap-1">
              {tabs.slice(0, 6).map((t) => <Favicon key={t.id} url={t.url} className="size-3.5" />)}
            </span>
            {sel && HANDLES.map((h) => (
              <span
                key={h}
                className="pointer-events-none absolute size-2.5 rounded-full border-2 bg-background"
                style={{ borderColor: color, ...handlePos(h) }}
              />
            ))}
          </div>
        );
      })}

      {guides.gx.map((x) => <div key={`x${x}`} className="pointer-events-none absolute inset-y-0 z-30 w-px bg-pink-500" style={{ left: x }} />)}
      {guides.gy.map((y) => <div key={`y${y}`} className="pointer-events-none absolute inset-x-0 z-30 h-px bg-pink-500" style={{ top: y }} />)}
      {live && (
        <div
          className="pointer-events-none absolute z-40 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-lg"
          style={{ left: Math.max(4, Math.min(live.left, size.width - 200)), top: Math.max(4, live.top - 30) }}
        >
          {live.text}
        </div>
      )}
    </div>
  );
}

function handlePos(h: (typeof HANDLES)[number]): React.CSSProperties {
  const c = "calc(50% - 5px)";
  return {
    top: h.includes("n") ? -1 : h.includes("s") ? undefined : c,
    bottom: h.includes("s") ? -1 : undefined,
    left: h.includes("w") ? -1 : h.includes("e") ? undefined : c,
    right: h.includes("e") ? -1 : undefined,
  };
}

/** 作業領域の外（メニューバー・Dock・タスクバー）を、それらしい帯として描く */
function SystemBars({ d, scale }: { d: Display; scale: number }) {
  const b = d.bounds, wa = d.workArea;
  const insets = {
    top: wa.top - b.top,
    bottom: b.top + b.height - (wa.top + wa.height),
    left: wa.left - b.left,
    right: b.left + b.width - (wa.left + wa.width),
  };
  return (
    <>
      {(["top", "bottom", "left", "right"] as const).map((side) => {
        const s = insets[side] * scale;
        if (s < 1) return null;
        const horizontal = side === "top" || side === "bottom";
        const menubar = IS_MAC && side === "top";
        return (
          <div
            key={side}
            title={menubar ? "メニューバー（ウィンドウは置かれません）" : `${IS_MAC ? "Dock" : "タスクバー"}（ウィンドウは置かれません）`}
            className={cn(
              "absolute flex items-center gap-[3px] overflow-hidden bg-muted-foreground/20",
              horizontal ? "inset-x-0" : "inset-y-0 flex-col",
              menubar ? "px-1.5" : "justify-center",
            )}
            style={{ [side]: 0, [horizontal ? "height" : "width"]: s }}
          >
            {menubar ? (
              <>
                <i className="size-[3px] rounded-full bg-muted-foreground/70" />
                {[0, 1, 2].map((k) => <i key={k} className="h-[2px] w-[7px] rounded-full bg-muted-foreground/60" />)}
                <span className="flex-1" />
                {[0, 1].map((k) => <i key={k} className="h-[2px] w-[6px] rounded-full bg-muted-foreground/60" />)}
                <i className="h-[2px] w-[12px] rounded-full bg-muted-foreground/60" />
              </>
            ) : (
              Array.from({ length: 6 }, (_, k) => <i key={k} className="size-[5px] rounded-[1.5px] bg-muted-foreground/60" />)
            )}
          </div>
        );
      })}
    </>
  );
}
