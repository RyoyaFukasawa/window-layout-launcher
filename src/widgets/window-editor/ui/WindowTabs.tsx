// ウィンドウを切り替えるタブ（ドラッグで並べ替え。タブをドラッグして重ねると、そのウィンドウへ移せる）
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { areaLabel, colorOf, DISPLAY_OPTIONS, type Mode, type WindowSpec } from "@/entities/window";
import { cn } from "@/shared/lib/utils";
import { Favicon } from "@/shared/ui/favicon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

const DISPLAY_SHORT = Object.fromEntries(DISPLAY_OPTIONS.map(([k, l]) => [k, l.replace(/ディスプレイ|の画面/g, "")]));

interface Props {
  wins: WindowSpec[];
  current: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  /** タブをドラッグ中か（重ねると切り替わることを示す） */
  tabDragging: boolean;
  /** ノートPCのみのときはディスプレイを出さない */
  mode: Mode;
}

export function WindowTabs({ wins, current, onSelect, onAdd, tabDragging, mode }: Props) {
  return (
    <div role="tablist" aria-label="ウィンドウ" className="flex flex-wrap items-end gap-1">
      <SortableContext items={wins.map((w) => w.id!)} strategy={horizontalListSortingStrategy}>
        {wins.map((w, i) => (
          <WindowTab key={w.id} win={w} index={i} selected={i === current} tabDragging={tabDragging} showDisplay={mode !== "laptop"} onSelect={() => onSelect(i)} />
        ))}
      </SortableContext>
      <Tooltip>
        <TooltipTrigger render={<button type="button" onClick={onAdd} aria-label="ウィンドウを追加" className="mb-1 ml-1 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" />}>
          <Plus className="size-4" />
        </TooltipTrigger>
        <TooltipContent>ウィンドウを追加</TooltipContent>
      </Tooltip>
    </div>
  );
}

function WindowTab({ win, index, selected, tabDragging, showDisplay, onSelect }: {
  win: WindowSpec; index: number; selected: boolean; tabDragging: boolean; showDisplay: boolean; onSelect: () => void;
}) {
  // 並べ替え用の id はウィンドウの id（タブのドラッグでは「このウィンドウへ移す」ドロップ先になる）
  const s = useSortable({ id: win.id!, data: { type: "window" } });
  const color = colorOf(index);
  const tabs = win.tabs.filter((t) => t.url);
  const over = tabDragging && s.isOver && !selected;
  return (
    <button
      ref={s.setNodeRef}
      {...s.attributes}
      {...s.listeners}
      type="button"
      role="tab"
      aria-selected={selected}
      data-window-tab={win.id}
      style={{ transform: CSS.Translate.toString(s.transform), transition: s.transition, ...(selected ? { borderTopColor: color } : {}) }}
      onClick={onSelect}
      className={cn(
        "flex min-w-40 max-w-64 cursor-pointer items-center gap-2 rounded-t-xl border border-b-0 px-3 py-2 text-left outline-none transition-colors",
        selected ? "border-t-2 bg-card shadow-sm" : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted",
        over && "bg-primary/10 text-foreground",
        s.isDragging && "opacity-40",
      )}
    >
      <span className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: color }}>{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">ウィンドウ {index + 1}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {showDisplay && `${DISPLAY_SHORT[win.display] ?? win.display} ・ `}{areaLabel(win.area === "custom" ? { area: "custom", custom: win.custom ?? { x: 0, y: 0, w: 100, h: 100 } } : { area: win.area })} ・ タブ {tabs.length}
        </span>
      </span>
      <span className="flex shrink-0 -space-x-1">
        {tabs.slice(0, 3).map((t) => <Favicon key={t.id} url={t.url} className="size-4 rounded-full ring-2 ring-card" />)}
      </span>
    </button>
  );
}
