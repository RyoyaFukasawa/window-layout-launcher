// ウィンドウのタブを、実際の Chrome の見た目（横タブ／縦タブ）で表示・編集する
import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext, defaultAnimateLayoutChanges, horizontalListSortingStrategy, rectSortingStrategy, useSortable, verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Group as GroupIcon, Lock, Minus, Pencil, Pin, PinOff, Plus,
  PanelLeftClose, RotateCw, Search, Square, Trash2, Ungroup, X,
} from "lucide-react";
import { GROUP_COLOR_KEYS, GROUP_COLORS, groupOf, type GroupSpec, nextGroupColor, type TabSpec, type WindowSpec } from "@/entities/window";
import { beforeGroupDropId, groupDropId, pinnedDropId, tabsDropId, useDragPreview } from "@/features/tab-drag";
import type { TabStrip } from "@/features/tab-strip";
import { newId } from "@/shared/lib/id";
import { IS_MAC } from "@/shared/lib/platform";
import { fallbackTitle, normalizeInput } from "@/shared/lib/url";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Favicon } from "@/shared/ui/favicon";
import { Input } from "@/shared/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

interface Props {
  win: WindowSpec;
  strip: TabStrip;
  /** 変更（呼び出し側でグループの整合をとる） */
  onChange: (fn: (w: WindowSpec) => void) => void;
  onResolveTitle: (tabId: string, url: string) => void;
}

const tabLabel = (t: TabSpec) => (t.url ? t.title || fallbackTitle(t.url) : "新しいタブ");


export function ChromeFrame({ win, strip, onChange, onResolveTitle }: Props) {
  const [activeId, setActiveId] = useState<string | undefined>(win.tabs[0]?.id);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [focusUrl, setFocusUrl] = useState(0);
  const { setNodeRef: setDropRef } = useDroppable({ id: tabsDropId(win.id!) });
  const { setNodeRef: setPinRef } = useDroppable({ id: pinnedDropId(win.id!) });

  const active = win.tabs.find((t) => t.id === activeId) ?? win.tabs[0];
  const ai = win.tabs.indexOf(active);
  const groups = win.groups ?? [];
  const visible = win.tabs.filter((t) => !groupOf(win, t)?.collapsed || t.id === active?.id);

  // 空のタブを選んだら URL 欄に入力できるようにする
  useEffect(() => { if (active && !active.url) setFocusUrl((n) => n + 1); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const editTab = (id: string, fn: (t: TabSpec) => void) => onChange((w) => { const t = w.tabs.find((x) => x.id === id); if (t) fn(t); });
  const addTab = (group?: string) => {
    const id = newId("t");
    onChange((w) => {
      const tab: TabSpec = { id, url: "", pinned: false, group };
      if (group) { const last = w.tabs.map((t) => t.group).lastIndexOf(group); w.tabs.splice(last + 1, 0, tab); }
      else w.tabs.push(tab);
    });
    setActiveId(id);
  };
  const removeTab = (id: string) => {
    const i = win.tabs.findIndex((t) => t.id === id);
    if (id === active?.id) setActiveId(win.tabs[i + 1]?.id ?? win.tabs[i - 1]?.id);
    onChange((w) => { w.tabs = w.tabs.filter((t) => t.id !== id); if (!w.tabs.length) w.tabs.push({ id: newId("t"), url: "" }); });
  };
  const commitUrl = (tab: TabSpec, raw: string) => {
    const url = normalizeInput(raw);
    if (url === tab.url) return;
    editTab(tab.id!, (t) => { t.url = url; if (!t.titleManual) t.title = undefined; });
    if (url && !tab.titleManual) onResolveTitle(tab.id!, url);
  };
  const commitTitle = (tab: TabSpec, raw: string) => {
    const title = raw.trim();
    if (title === (tab.titleManual ? tab.title ?? "" : "")) return;
    editTab(tab.id!, (t) => {
      if (title) { t.title = title; t.titleManual = true; } else { t.title = undefined; t.titleManual = false; }
    });
    if (!title && tab.url) onResolveTitle(tab.id!, tab.url);
  };
  const toNewGroup = (tabId: string) => {
    const g: GroupSpec = { id: newId("g"), title: "", color: nextGroupColor(win) };
    onChange((w) => { (w.groups ??= []).push(g); const t = w.tabs.find((x) => x.id === tabId)!; t.group = g.id; t.pinned = false; });
    setEditGroupId(g.id);
  };
  const toGroup = (tabId: string, gid: string | null) => editTab(tabId, (t) => { if (gid) { t.group = gid; t.pinned = false; } else delete t.group; });
  const groupActions = (g: GroupSpec): GroupActions => ({
    change: (fn) => onChange((w) => { const x = w.groups?.find((y) => y.id === g.id); if (x) fn(x); }),
    ungroup: () => onChange((w) => { for (const t of w.tabs) if (t.group === g.id) delete t.group; }),
    removeTabs: () => onChange((w) => { w.tabs = w.tabs.filter((t) => t.group !== g.id); if (!w.tabs.length) w.tabs.push({ id: newId("t"), url: "" }); }),
    addTab: () => { onChange((w) => { const x = w.groups?.find((y) => y.id === g.id); if (x) x.collapsed = undefined; }); addTab(g.id); },
    editing: editGroupId === g.id,
    onEditDone: () => setEditGroupId(null),
  });

  const vertical = strip === "vertical";
  const items = visible.filter((t) => !t.pinned).map((t) => t.id!);

  // タブ列（グループの見出しを、グループ最初のタブの前に入れる）
  const stripItems = win.tabs.map((t, i) => {
    const g = groupOf(win, t);
    const starts = g && groupOf(win, win.tabs[i - 1] ?? { url: "" })?.id !== g.id;
    const hidden = g?.collapsed && t.id !== active?.id;
    return (
      <div key={t.id} className={cn("contents")}>
        {starts && <GroupChip windowId={win.id!} group={g} count={win.tabs.filter((x) => x.group === g.id).length} vertical={vertical} {...groupActions(g)} />}
        {!hidden && (
          <StripTab
            tab={t}
            windowId={win.id!}
            group={g}
            vertical={vertical}
            active={t.id === active?.id}
            onSelect={() => setActiveId(t.id)}
            onClose={() => removeTab(t.id!)}
          />
        )}
      </div>
    );
  });

  const toolbar = active && (
    <Toolbar key={`url-${active.id}`} tab={active} focusKey={focusUrl} onCommit={(v) => commitUrl(active, v)} />
  );
  const page = active && (
    <PageArea
      key={`page-${active.id}`}
      tab={active}
      index={ai}
      group={groupOf(win, active)}
      groups={groups}
      onTitle={(v) => commitTitle(active, v)}
      onPin={(p) => editTab(active.id!, (t) => { t.pinned = p; if (p) delete t.group; })}
      onNewGroup={() => toNewGroup(active.id!)}
      onGroup={(gid) => toGroup(active.id!, gid)}
      onClose={() => removeTab(active.id!)}
    />
  );

  return (
    <div className="overflow-hidden rounded-xl border bg-muted shadow-sm">
        {vertical ? (
          <>
            {/* Chrome の縦タブと同じく、ツールバー（URL 欄）はウィンドウの上端いっぱいに残る */}
            <div className="flex items-center border-b bg-card pl-3">
              {IS_MAC && <TrafficLights className="mr-1" />}
              <div className="min-w-0 flex-1">{toolbar}</div>
              {!IS_MAC && <CaptionButtons />}
            </div>
            <div className="grid grid-cols-[minmax(130px,38%)_1fr]">
              <div className="flex min-h-56 flex-col border-r bg-muted">
                {/* 横の帯（タブ検索・折りたたみ）と固定タブをまとめて、固定タブのドロップ先にする */}
                <div ref={setPinRef} data-testid="pin-zone" className="shrink-0 px-1.5 pt-1">
                  <div className="flex h-7 items-center justify-between px-1 text-muted-foreground/70" aria-hidden>
                    <Search className="size-3.5" />
                    <PanelLeftClose className="size-3.5" />
                  </div>
                  <PinnedGrid win={win} activeId={active?.id} onSelect={setActiveId} onClose={removeTab} vertical />
                </div>
                <div ref={setDropRef} className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 pb-1.5">
                  <SortableContext items={items} strategy={verticalListSortingStrategy}>
                    {stripItems.filter((_, i) => !win.tabs[i].pinned)}
                  </SortableContext>
                </div>
                {/* 新しいタブのボタンは下端 */}
                <button type="button" onClick={() => addTab()} className="mx-1.5 mb-1.5 flex h-7 shrink-0 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-background/60">
                  <Plus className="size-3.5" /> 新しいタブ
                </button>
              </div>
              <div className="flex min-w-0 flex-col bg-card">
                {page}
                <div className="flex-1 bg-background/60" aria-hidden />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-10 items-end gap-0.5 pl-3 pr-1 pt-1.5">
              {/* 左端（信号機のボタン）と固定タブをまとめて、固定タブのドロップ先にする */}
              <div ref={setPinRef} className="-ml-3 flex shrink-0 items-end self-stretch pl-3">
                {IS_MAC ? <TrafficLights className="mb-3 mr-2" /> : <span className="w-2" />}
                <PinnedGrid win={win} activeId={active?.id} onSelect={setActiveId} onClose={removeTab} />
              </div>
              <div ref={setDropRef} className="flex min-w-0 flex-1 items-end overflow-x-auto [scrollbar-width:none]">
                <SortableContext items={items} strategy={horizontalListSortingStrategy}>
                  {stripItems.filter((_, i) => !win.tabs[i].pinned)}
                </SortableContext>
                <Tooltip>
                  <TooltipTrigger render={<button type="button" onClick={() => addTab()} aria-label="新しいタブ" className="mb-1 ml-1 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background/60" />}>
                    <Plus className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>新しいタブ</TooltipContent>
                </Tooltip>
              </div>
              {!IS_MAC && <CaptionButtons className="mb-1.5" />}
            </div>
            <div className="bg-card">
              {toolbar}
              {page}
            </div>
          </>
        )}
    </div>
  );
}

// ---------- 枠の飾り ----------

function TrafficLights({ className }: { className?: string }) {
  return (
    <div className={cn("flex shrink-0 gap-1.5", className)} aria-hidden>
      <span className="size-2.5 rounded-full bg-[#ff5f57]" />
      <span className="size-2.5 rounded-full bg-[#febc2e]" />
      <span className="size-2.5 rounded-full bg-[#28c840]" />
    </div>
  );
}

function CaptionButtons({ className }: { className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-3 px-2 text-muted-foreground", className)} aria-hidden>
      <Minus className="size-3.5" /><Square className="size-3" /><X className="size-3.5" />
    </div>
  );
}

// ---------- タブ ----------

/**
 * ドラッグ中に並びが変わったとき（固定・グループ・別ウィンドウへの移動）は、移動のアニメーションをしない。
 * アニメーションすると、元の位置にいったん描かれたまま少し止まり、置き場所が飛んだように見える
 */
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  args.isSorting || args.wasDragging ? false : defaultAnimateLayoutChanges(args);

function useTabSortable(tab: TabSpec, windowId: string) {
  const s = useSortable({ id: tab.id!, data: { type: "tab", windowId }, animateLayoutChanges });
  return {
    ref: s.setNodeRef,
    style: { transform: CSS.Translate.toString(s.transform), transition: s.transition },
    dragProps: { ...s.attributes, ...s.listeners },
    isDragging: s.isDragging,
  };
}

/** ドラッグ中のタブの元の場所（＝ドロップ先）。中身を薄く表示し、グループの色の線ははっきり残す */
const GHOST = "[&>*:not([data-group-line])]:opacity-40";

function StripTab({ tab, windowId, group, vertical, active, onSelect, onClose }: {
  tab: TabSpec; windowId: string; group?: GroupSpec; vertical: boolean; active: boolean; onSelect: () => void; onClose: () => void;
}) {
  const s = useTabSortable(tab, windowId);
  // ドラッグ中は、いま離したときに入るグループの色で表示する（グループ外なら色なし）
  const preview = useDragPreview();
  if (s.isDragging && preview && preview.windowId === windowId) group = preview.pinned ? undefined : preview.group;
  const hex = group ? GROUP_COLORS[group.color].hex : undefined;
  const close = (
    <span
      role="button"
      tabIndex={-1}
      aria-label="タブを閉じる"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      className={cn("grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground", !active && "opacity-0 group-hover/tab:opacity-100")}
    >
      <X className="size-3" />
    </span>
  );

  if (vertical) {
    return (
      <div
        ref={s.ref}
        style={{ ...s.style, ...(hex ? { borderLeftColor: hex } : {}) }}
        {...s.dragProps}
        onClick={onSelect}
        title={tab.url || "新しいタブ"}
        className={cn(
          "group/tab flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-xs outline-none",
          active ? "bg-card shadow-sm ring-1 ring-border" : "hover:bg-background/60",
          group && "ml-2 rounded-l-none border-l-2",
          group && s.isDragging && "border-l-4",
          s.isDragging && GHOST,
        )}
      >
        <Favicon url={tab.url} className="size-4 shrink-0" />
        <span className={cn("min-w-0 flex-1 truncate", !tab.title && "text-muted-foreground")}>{tabLabel(tab)}</span>
        {close}
      </div>
    );
  }

  return (
    <div
      ref={s.ref}
      style={s.style}
      {...s.dragProps}
      onClick={onSelect}
      title={`${tabLabel(tab)}\n${tab.url}`}
      className={cn(
        "group/tab @container relative flex h-8 min-w-9 max-w-48 flex-1 basis-48 cursor-default items-center gap-2 rounded-t-lg px-2.5 text-xs outline-none",
        active ? "z-10 bg-card" : "hover:bg-background/50",
        s.isDragging && GHOST,
      )}
    >
      {/* 区切り線（Chrome と同じく、選択中と隣は出さない） */}
      {!active && <span className="absolute left-0 top-2 bottom-2 w-px bg-border group-hover/tab:opacity-0" aria-hidden />}
      <Favicon url={tab.url} className="size-4 shrink-0" />
      <span className={cn("hidden min-w-0 flex-1 truncate @[72px]:block", !tab.title && "text-muted-foreground")}>{tabLabel(tab)}</span>
      <span className="hidden @[56px]:contents">{close}</span>
      {hex && <span data-group-line className={cn("absolute inset-x-1 bottom-0 rounded-full", s.isDragging ? "h-1" : "h-0.5")} style={{ background: hex }} aria-hidden />}
    </div>
  );
}

/**
 * 固定タブの欄（横タブでは左端にアイコンだけ、縦タブでは上にアイコンを並べる）。
 * ドロップ先としての範囲は、呼び出し側でウィンドウの上端（ボタンの帯）まで含めて広く取る。
 * ドラッグの開始・途中で大きさを変えない（変えると、他の要素がずれてドロップ先が行ったり来たりする）
 */
function PinnedGrid({ win, activeId, onSelect, onClose, vertical }: {
  win: WindowSpec; activeId?: string; onSelect: (id: string) => void; onClose: (id: string) => void; vertical?: boolean;
}) {
  const pinned = win.tabs.filter((t) => t.pinned);
  if (!pinned.length) return null;
  const items = (
    <SortableContext items={pinned.map((t) => t.id!)} strategy={vertical ? rectSortingStrategy : horizontalListSortingStrategy}>
      {pinned.map((t) => <PinnedTab key={t.id} tab={t} windowId={win.id!} active={t.id === activeId} vertical={vertical} onSelect={() => onSelect(t.id!)} onClose={() => onClose(t.id!)} />)}
    </SortableContext>
  );
  // 縦タブでは、帯の下にアイコンを並べる（多ければ折り返す）
  return vertical ? <div className="flex flex-wrap gap-1 pb-1.5">{items}</div> : <div className="flex shrink-0 items-end">{items}</div>;
}

function PinnedTab({ tab, windowId, active, vertical, onSelect }: {
  tab: TabSpec; windowId: string; active: boolean; vertical?: boolean; onSelect: () => void; onClose: () => void;
}) {
  const s = useTabSortable(tab, windowId);
  return (
    <div
      ref={s.ref}
      style={s.style}
      {...s.dragProps}
      onClick={onSelect}
      title={`📌 ${tabLabel(tab)}\n${tab.url}`}
      className={cn(
        "grid shrink-0 cursor-default place-items-center outline-none",
        vertical ? "size-8 rounded-md" : "h-8 w-10 rounded-t-lg",
        active ? "z-10 bg-card" + (vertical ? " shadow-sm ring-1 ring-border" : "") : "hover:bg-background/50",
        s.isDragging && GHOST,
      )}
    >
      <Favicon url={tab.url} className="size-4" />
    </div>
  );
}

// ---------- グループ ----------

interface GroupActions {
  change: (fn: (g: GroupSpec) => void) => void;
  ungroup: () => void;
  removeTabs: () => void;
  addTab: () => void;
  editing: boolean;
  onEditDone: () => void;
}

function GroupDot({ group, className }: { group: GroupSpec; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: GROUP_COLORS[group.color].hex }} />;
}

/** タブ列のグループ見出し（クリックで色・名前・折りたたみ） */
function GroupChip({ windowId, group, count, vertical, change, ungroup, removeTabs, addTab, editing, onEditDone }: GroupActions & {
  windowId: string; group: GroupSpec; count: number; vertical: boolean;
}) {
  // 見出しの前半（縦は上・横は左）に落とすとグループの直前（グループ外）、後半に落とすとグループの最初に入る
  const { setNodeRef: setBeforeRef } = useDroppable({ id: beforeGroupDropId(windowId, group.id) });
  const { setNodeRef: setJoinRef } = useDroppable({ id: groupDropId(windowId, group.id) });
  // ドラッグ中のタブがこのグループに入る位置にあるとき、見出しを浮き上がらせる
  const preview = useDragPreview();
  const target = !!preview && preview.windowId === windowId && preview.group?.id === group.id;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const hex = GROUP_COLORS[group.color].hex;

  useEffect(() => { if (editing) { setDraft(group.title); setRenaming(true); } }, [editing, group.title]);
  useEffect(() => { if (renaming) { inputRef.current?.focus(); inputRef.current?.select(); } }, [renaming]);
  const commit = () => {
    const title = draft.trim();
    if (title !== group.title) change((g) => { g.title = title; });
    setRenaming(false);
    onEditDone();
  };

  if (renaming) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        placeholder="グループ名"
        className={cn("h-6 shrink-0 text-xs", vertical ? "my-0.5 w-full" : "mb-1 w-28")}
        style={{ borderColor: hex }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); setDraft(group.title); setRenaming(false); onEditDone(); }
        }}
      />
    );
  }

  const collapsed = !!group.collapsed;
  return (
    <div className={cn("relative flex shrink-0", vertical && "w-full")}>
      <span ref={setBeforeRef} aria-hidden className={cn("pointer-events-none absolute", vertical ? "inset-x-0 top-0 h-1/2" : "inset-y-0 left-0 w-1/2")} />
      <span ref={setJoinRef} aria-hidden className={cn("pointer-events-none absolute", vertical ? "inset-x-0 bottom-0 h-1/2" : "inset-y-0 right-0 w-1/2")} />
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          vertical ? (
            <button
              type="button"
              className={cn("mt-1 flex h-7 w-full shrink-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs font-semibold transition-shadow hover:bg-background/60", target && "bg-background/60 ring-2")}
              style={target ? { ["--tw-ring-color" as string]: hex } : undefined}
              title={`グループ（タブ ${count}）`}
            />
          ) : (
            <button
              type="button"
              className={cn(
                "mx-1 mb-1.5 flex h-5 max-w-28 shrink-0 items-center rounded-md text-[11px] font-semibold text-white transition-shadow",
                group.title ? "px-2" : "w-5 justify-center",
                target && "ring-2 ring-offset-2 ring-offset-muted",
              )}
              style={{ background: hex, ...(target ? { ["--tw-ring-color" as string]: hex } : {}) }}
              title={`${group.title || "名前なし"}（タブ ${count}${collapsed ? "・折りたたみ" : ""}）`}
              onDoubleClick={() => setRenaming(true)}
            />
          )
        }
      >
        {vertical ? (
          <>
            {collapsed ? <ChevronRight className="size-3 text-muted-foreground" /> : <ChevronDown className="size-3 text-muted-foreground" />}
            <span className="rounded px-1.5 py-0.5 text-white" style={{ background: hex }}>{group.title || "　"}</span>
            {collapsed && <span className="font-normal text-muted-foreground">{count}</span>}
          </>
        ) : (
          <>
            {group.title && <span className="truncate">{group.title}</span>}
            {collapsed && <span className={cn("opacity-80", group.title && "ml-1")}>{count}</span>}
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>色</DropdownMenuLabel>
        <div className="grid grid-cols-9 gap-1 px-2 pb-2">
          {GROUP_COLOR_KEYS.map((c) => (
            <DropdownMenuItem
              key={c}
              className="grid size-5 place-items-center rounded-full p-0 ring-offset-1 ring-offset-popover data-[highlighted]:bg-transparent data-[highlighted]:ring-2 data-[highlighted]:ring-ring"
              style={{ background: GROUP_COLORS[c].hex }}
              aria-label={GROUP_COLORS[c].label}
              title={GROUP_COLORS[c].label}
              onClick={() => change((g) => { g.color = c; })}
            >
              {c === group.color && <Check className="size-3 text-white" />}
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setRenaming(true)}><Pencil /> 名前を変更</DropdownMenuItem>
        <DropdownMenuItem onClick={() => change((g) => { g.collapsed = !g.collapsed || undefined; })}>
          {collapsed ? <ChevronDown /> : <ChevronRight />} {collapsed ? "展開して開く" : "折りたたんで開く"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={addTab}><Plus /> グループに新しいタブを追加</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={ungroup}><Ungroup /> グループを解除</DropdownMenuItem>
        <DropdownMenuItem onClick={removeTabs} className="text-destructive data-[highlighted]:text-destructive"><Trash2 /> グループとタブを削除</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}

// ---------- ツールバー（URL 欄）と表示中のタブ ----------

function Toolbar({ tab, focusKey, onCommit }: { tab: TabSpec; focusKey: number; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(tab.url);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(tab.url); }, [tab.url]);
  useEffect(() => { if (focusKey && !tab.url) ref.current?.focus(); }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const secure = tab.url.startsWith("https://");
  return (
    <div className="flex items-center gap-1 px-2 py-1.5">
      <span className="flex gap-1.5 px-1 text-muted-foreground/60" aria-hidden>
        <ArrowLeft className="size-3.5" /><ArrowRight className="size-3.5" /><RotateCw className="size-3.5" />
      </span>
      <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-muted px-3 focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/50">
        {secure ? <Lock className="size-3 shrink-0 text-muted-foreground" /> : <Favicon url={draft} className="size-3.5 shrink-0" />}
        <input
          ref={ref}
          value={draft}
          placeholder="URL を入力（例：github.com）"
          aria-label="URL"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => onCommit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onCommit(draft); e.currentTarget.blur(); }
            if (e.key === "Escape") { e.preventDefault(); setDraft(tab.url); e.currentTarget.blur(); }
          }}
        />
      </label>
    </div>
  );
}

function PageArea({ tab, index, group, groups, onTitle, onPin, onNewGroup, onGroup, onClose }: {
  tab: TabSpec; index: number; group?: GroupSpec; groups: GroupSpec[];
  onTitle: (v: string) => void; onPin: (p: boolean) => void; onNewGroup: () => void; onGroup: (gid: string | null) => void; onClose: () => void;
}) {
  const manual = tab.titleManual ? tab.title ?? "" : "";
  const [draft, setDraft] = useState(manual);
  useEffect(() => { setDraft(manual); }, [manual]);
  return (
    <div className="flex items-center gap-2 border-t bg-background/60 px-3 py-2.5">
      <Favicon url={tab.url} className="size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-muted-foreground">
          {index + 1} 番目のタブ{tab.pinned ? " ・ 固定" : ""}{group ? ` ・ ${group.title || "名前なし"}グループ` : ""}
        </div>
        <input
          value={draft}
          placeholder={tab.url ? `${tab.title && !tab.titleManual ? tab.title : fallbackTitle(tab.url)}（タイトルは自動）` : "URL を入れるとタイトルを自動で取得します"}
          aria-label="タイトル"
          title="表示用のタイトル。空欄なら自動で取得します"
          className="w-full truncate bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-foreground/80 focus:placeholder:text-muted-foreground"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onTitle(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
            if (e.key === "Escape") { e.preventDefault(); setDraft(manual); }
          }}
        />
      </div>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="固定タブ" aria-pressed={!!tab.pinned} onClick={() => onPin(!tab.pinned)} className={cn(tab.pinned ? "text-primary" : "text-muted-foreground")} />}>
          {tab.pinned ? <Pin /> : <PinOff />}
        </TooltipTrigger>
        <TooltipContent>{tab.pinned ? "固定タブ（クリックで解除）" : "固定タブにする"}</TooltipContent>
      </Tooltip>
      <GroupMenu group={group} groups={groups} onNewGroup={onNewGroup} onGroup={onGroup} />
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="タブを閉じる" onClick={onClose} className="text-muted-foreground" />}>
          <Trash2 />
        </TooltipTrigger>
        <TooltipContent>このタブを削除</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** タブをグループに入れる・外すメニュー */
function GroupMenu({ group, groups, onNewGroup, onGroup }: {
  group?: GroupSpec; groups: GroupSpec[]; onNewGroup: () => void; onGroup: (gid: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="タブグループ" className="text-muted-foreground" />} />}>
          {group ? <GroupDot group={group} className="size-3" /> : <GroupIcon />}
        </TooltipTrigger>
        <TooltipContent>{group ? `グループ「${group.title || "名前なし"}」` : "タブグループに追加"}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onNewGroup}><Plus /> 新しいグループに追加</DropdownMenuItem>
        {groups.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>既存のグループ</DropdownMenuLabel>
            {groups.map((g) => (
              <DropdownMenuItem key={g.id} onClick={() => onGroup(g.id)} disabled={g.id === group?.id}>
                <GroupDot group={g} />
                <span className={cn("truncate", !g.title && "text-muted-foreground")}>{g.title || "名前なし"}</span>
                {g.id === group?.id && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {group && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onGroup(null)}><Ungroup /> グループから外す</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
