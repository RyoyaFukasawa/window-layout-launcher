import { useState } from "react";
import { GripVertical, Pin, Trash2 } from "lucide-react";
import { GROUP_COLORS, normalizeGroups } from "@/shared/groups";
import { AREA_OPTIONS, DISPLAY_OPTIONS } from "@/shared/geometry";
import type { Area, DisplayKind, Rect, TabSpec, WindowSpec } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChromeFrame } from "./ChromeFrame";
import { Favicon } from "./Favicon";
import type { DropPreview } from "./dragTabs";
import type { TabStrip } from "./hooks";
import { colorOf, fallbackTitle, isUrlDrag, urlFromDrop, type DroppedUrl } from "./logic";

interface Props {
  win: WindowSpec;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (fn: (w: WindowSpec) => void) => void;
  onRemove: () => void;
  onAddUrl: (drop: DroppedUrl) => void;
  /** URL が変わったタブのタイトルを探す */
  onResolveTitle: (tabId: string, url: string) => void;
  /** Chrome のタブの向き（横／縦） */
  strip: TabStrip;
}

const DISPLAY_ITEMS = Object.fromEntries(DISPLAY_OPTIONS);
const AREA_ITEMS = Object.fromEntries(AREA_OPTIONS);

export function WindowCard({ win, index, selected, onSelect, onChange: rawChange, onRemove, onAddUrl, onResolveTitle, strip }: Props) {
  const color = colorOf(index);
  // 変更のたびにグループの整合をとる（固定タブを外す・同じグループのタブをまとめる）
  const onChange = (fn: (w: WindowSpec) => void) => rawChange((w) => { fn(w); normalizeGroups(w); });
  const [urlOver, setUrlOver] = useState(false);

  return (
    <Card
      style={{ borderTopColor: color }}
      className={cn(
        // 上の切り替えタブとつながって見えるように、左上の角は四角く・上の線をウィンドウの色にする
        "gap-4 rounded-tl-none border-t-2 transition-shadow",
        urlOver && "ring-2 ring-emerald-500",
      )}
      onPointerDownCapture={onSelect}
      onDragOver={(e) => { if (isUrlDrag(e.dataTransfer)) { e.preventDefault(); setUrlOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setUrlOver(false); }}
      onDrop={(e) => { setUrlOver(false); const d = urlFromDrop(e.dataTransfer); if (d) { e.preventDefault(); onAddUrl(d); } }}
    >
      <CardContent className="flex flex-col gap-4">
        {/* ウィンドウの番号・名前は上の切り替えタブに出ているので、ここは設定だけ */}
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">ディスプレイ</Label>
            <Select items={DISPLAY_ITEMS} value={win.display} onValueChange={(v) => v && onChange((w) => { w.display = v as DisplayKind; })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DISPLAY_OPTIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">位置・サイズ</Label>
            <Select items={AREA_ITEMS} value={win.area} onValueChange={(v) => v && onChange((w) => {
              w.area = v as Area;
              if (v === "custom" && !w.custom) w.custom = { x: 0, y: 0, w: 50, h: 100 };
            })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AREA_OPTIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={onRemove} aria-label="ウィンドウを削除" />}>
              <Trash2 className="text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>このウィンドウを削除</TooltipContent>
          </Tooltip>
        </div>

        {win.area === "custom" && win.custom && (
          <div className="grid grid-cols-4 gap-2">
            {([["x", "左から"], ["y", "上から"], ["w", "幅"], ["h", "高さ"]] as const).map(([k, l]) => (
              <div key={k} className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">{l} %</Label>
                <Input
                  type="number" min={0} max={100} step={0.5}
                  value={win.custom![k]}
                  onChange={(e) => onChange((w) => { (w.custom as Rect)[k] = Math.min(100, Math.max(0, Number(e.target.value) || 0)); })}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <ChromeFrame win={win} strip={strip} onChange={onChange} onResolveTitle={onResolveTitle} />
          <span className="text-right text-[11px] text-muted-foreground">タブやリンクをドロップしても追加できます</span>
        </div>
      </CardContent>
    </Card>
  );
}

/** ドラッグ中のタブ（固定になる位置ではアイコンだけ、それ以外はタブの形） */
/**
 * ドラッグ中のタブ。いま離したときの結果を見せる
 * - 固定になる位置：アイコン＋ピン
 * - グループに入る位置：グループの色の縁取りとグループ名
 * - グループの外：（そのウィンドウにグループがあれば）「グループ外」
 */
export function TabDragPreview({ tab, preview }: { tab: TabSpec; preview: DropPreview | null }) {
  const pinned = preview ? preview.pinned : tab.pinned;
  if (pinned) {
    return (
      <div className="relative grid size-9 cursor-grabbing place-items-center rounded-lg bg-card shadow-xl ring-2 ring-primary">
        <Favicon url={tab.url} className="size-4" />
        <Pin className="absolute -right-1 -top-1 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" />
      </div>
    );
  }
  const group = preview?.group;
  const hex = group ? GROUP_COLORS[group.color].hex : undefined;
  return (
    <div
      className={cn("flex h-8 w-60 cursor-grabbing items-center gap-2 rounded-lg bg-card px-2.5 text-xs shadow-xl", group ? "ring-2" : "ring-1 ring-border")}
      style={hex ? { ["--tw-ring-color" as string]: hex } : undefined}
    >
      <Favicon url={tab.url} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{tab.url ? tab.title || fallbackTitle(tab.url) : "新しいタブ"}</span>
      {group ? (
        <span className="max-w-24 shrink-0 truncate rounded px-1.5 text-[10px] font-semibold leading-4 text-white" style={{ background: hex }}>
          {group.title || "グループ"}
        </span>
      ) : preview?.windowHasGroups ? (
        <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] leading-4 text-muted-foreground">グループ外</span>
      ) : null}
    </div>
  );
}

export function WindowDragPreview({ win, index }: { win: WindowSpec; index: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium shadow-xl">
      <GripVertical className="size-4 text-muted-foreground" />
      <span className="grid size-6 place-items-center rounded-full text-xs font-bold text-white" style={{ background: colorOf(index) }}>{index + 1}</span>
      ウィンドウ {index + 1}
      <span className="flex gap-1">{win.tabs.filter((t) => t.url).slice(0, 5).map((t) => <Favicon key={t.id} url={t.url} className="size-4" />)}</span>
    </div>
  );
}
