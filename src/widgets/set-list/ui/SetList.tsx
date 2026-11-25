import { useEffect, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { type LayoutSet, SetAvatar, setStats } from "@/entities/layout-set";
import type { Mode } from "@/entities/window";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

interface Props {
  sets: LayoutSet[];
  currentId: string;
  startupId: string | null;
  mode: Mode;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleStartup: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  /** 新しく作ったセットは名前の編集から始める */
  renamingId: string | null;
  onRenamingDone: () => void;
}

export function SetList(p: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    p.onReorder(p.sets.findIndex((s) => s.id === e.active.id), p.sets.findIndex((s) => s.id === e.over!.id));
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>レイアウトセット</CardTitle>
        <CardDescription>アイコンのクリックで、開くセットを選べます。</CardDescription>
        <CardAction>
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" size="icon-sm" onClick={p.onAdd} aria-label="新しいセット" />}>
              <Plus />
            </TooltipTrigger>
            <TooltipContent>新しいセット</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={p.sets.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {!p.sets.length && <p className="px-2 py-3 text-xs text-muted-foreground">まだセットがありません。＋ で作成できます。</p>}
            <ul className="flex flex-col gap-0.5">
              {p.sets.map((s) => (
                <SetRow
                  key={s.id}
                  set={s}
                  mode={p.mode}
                  selected={s.id === p.currentId}
                  startup={s.id === p.startupId}
                  canDelete
                  renaming={s.id === p.renamingId}
                  onRenamingDone={p.onRenamingDone}
                  onSelect={() => p.onSelect(s.id)}
                  onRename={(n) => p.onRename(s.id, n)}
                  onDuplicate={() => p.onDuplicate(s.id)}
                  onDelete={() => p.onDelete(s.id)}
                  onToggleStartup={() => p.onToggleStartup(s.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  );
}

function SetRow({ set, mode, selected, startup, canDelete, renaming, onRenamingDone, onSelect, onRename, onDuplicate, onDelete, onToggleStartup }: {
  set: LayoutSet; mode: Mode; selected: boolean; startup: boolean; canDelete: boolean;
  renaming: boolean; onRenamingDone: () => void;
  onSelect: () => void; onRename: (name: string) => void; onDuplicate: () => void; onDelete: () => void; onToggleStartup: () => void;
}) {
  const s = useSortable({ id: set.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(set.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const st = setStats(set, mode);

  useEffect(() => { if (renaming) { setDraft(set.name); setEditing(true); } }, [renaming, set.name]);
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

  const commit = () => {
    const name = draft.trim();
    if (name && name !== set.name) onRename(name);
    setEditing(false);
    onRenamingDone();
  };

  return (
    <li
      ref={s.setNodeRef}
      style={{ transform: CSS.Translate.toString(s.transform), transition: s.transition }}
      className={cn(
        "group flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors",
        selected ? "bg-muted" : "hover:bg-muted/60",
        s.isDragging && "z-10 opacity-60 shadow-lg",
      )}
      onClick={() => !editing && onSelect()}
    >
      <button
        ref={s.setActivatorNodeRef}
        {...s.attributes}
        {...s.listeners}
        className="cursor-grab self-stretch rounded text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        aria-label="ドラッグで並べ替え"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="size-3.5" />
      </button>
      <SetAvatar id={set.id} name={editing ? draft : set.name} className="size-8" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            ref={inputRef}
            value={draft}
            className="h-7"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { e.preventDefault(); setDraft(set.name); setEditing(false); onRenamingDone(); }
            }}
          />
        ) : (
          <>
            <div className="flex items-center gap-1">
              <span className="truncate text-sm font-medium" onDoubleClick={() => setEditing(true)} title="ダブルクリックで名前を変更">{set.name}</span>
            </div>
            <div className="truncate text-[11px] text-muted-foreground">ウィンドウ {st.windows} ・ タブ {st.tabs}</div>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <IconAction label={startup ? "起動時に開く（クリックで解除）" : "Chromeの起動時に開くセットにする"} onClick={onToggleStartup} visible={startup}>
            <Star className={cn(startup && "fill-amber-400 text-amber-400")} />
          </IconAction>
          <IconAction label="名前を変更" onClick={() => setEditing(true)}><Pencil /></IconAction>
          <IconAction label="複製" onClick={onDuplicate}><Copy /></IconAction>
          {canDelete && <IconAction label="削除" onClick={onDelete}><Trash2 /></IconAction>}
        </div>
      )}
    </li>
  );
}

function IconAction({ label, onClick, visible, children }: { label: string; onClick: () => void; visible?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClick}
            aria-label={label}
            className={cn("text-muted-foreground", !visible && "hidden group-hover:inline-flex group-focus-within:inline-flex")}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
