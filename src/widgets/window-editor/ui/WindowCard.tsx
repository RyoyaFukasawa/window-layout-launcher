import { useState } from "react";
import { Trash2 } from "lucide-react";
import { type Area, AREA_OPTIONS, colorOf, DISPLAY_OPTIONS, type DisplayKind, normalizeGroups, type Rect, type WindowSpec } from "@/entities/window";
import type { TabStrip } from "@/features/tab-strip";
import { type DroppedUrl, isUrlDrag, urlFromDrop } from "@/shared/lib/url";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { ChromeFrame } from "./ChromeFrame";

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
