import { GripVertical } from "lucide-react";
import { colorOf, type WindowSpec } from "@/entities/window";
import { Favicon } from "@/shared/ui/favicon";

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
