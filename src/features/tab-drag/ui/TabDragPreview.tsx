import { Pin } from "lucide-react";
import { GROUP_COLORS, type TabSpec } from "@/entities/window";
import { fallbackTitle } from "@/shared/lib/url";
import { cn } from "@/shared/lib/utils";
import { Favicon } from "@/shared/ui/favicon";
import type { DropPreview } from "../model/dragTabs";

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
