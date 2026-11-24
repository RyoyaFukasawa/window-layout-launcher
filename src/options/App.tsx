import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, MeasuringStrategy, closestCenter, closestCorners, pointerWithin, useSensor, useSensors,
  type Collision, type CollisionDetection, type Modifier,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  AppWindow, ArrowRight, Camera, Check, Download, Keyboard, Laptop, LayoutGrid, Monitor, Play, Plus, RotateCcw, Star, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { pickDisplay, resolveBounds } from "@/shared/geometry";
import { ensureIds, newSet, parseImported, saveState } from "@/shared/store";
import type { Bounds, Display, Layouts, Message, Mode, TabSpec, WindowSpec } from "@/shared/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppState, useDisplays, useSystemDark, useTabStrip, type TabStripPref } from "./hooks";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LayoutPreview } from "./LayoutPreview";
import { SetList } from "./SetList";
import { dragOverTab, dropTab, isTabTarget, parseTarget, previewDrop, resolveGroupJoin, windowOfTarget, type DropPreview } from "./dragTabs";
import { DragPreviewContext } from "./dragPreview";
import { WindowTabs } from "./WindowTabs";
import { TabDragPreview, WindowCard, WindowDragPreview } from "./WindowCard";
import {
  IS_MAC, applyBounds, captureWindows, displayKind, fallbackTitle, lookupTitle, newId, shortName, shownDisplays,
  type DroppedUrl,
} from "./logic";
import { Favicon } from "./Favicon";
import { cn } from "@/lib/utils";

type DragItem = { type: "tab"; tab: TabSpec } | { type: "window"; win: WindowSpec; index: number };
type Confirm = { kind: "capture"; result: WindowSpec[] } | { kind: "reset" } | { kind: "delete"; id: string } | null;

const MODE_LABEL: Record<Mode, string> = { docked: "ドック時", laptop: "ノートPCのみ" };

export function App() {
  useSystemDark();
  const { state, update, replace, reset, savedAt } = useAppState();
  const [currentId, setCurrentId] = useState<string | null>(() => new URLSearchParams(location.hash.slice(1)).get("set"));
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const set = state?.sets.find((x) => x.id === currentId) ?? state?.sets.find((x) => x.id === state.startupSetId) ?? state?.sets[0];
  const layouts = set?.layouts;
  const displays = useDisplays();
  const tabStrip = useTabStrip();
  const activeMode: Mode = displays.length >= 2 ? "docked" : "laptop";
  const [mode, setMode] = useState<Mode | null>(null);
  const [sel, setSel] = useState(-1);
  /** 下に表示しているウィンドウ（タブで切り替え）。配置図で選んだウィンドウに合わせる */
  const [viewRaw, setView] = useState(0);
  useEffect(() => { if (sel >= 0) setView(sel); }, [sel]);
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const switchTimer = useRef<number | undefined>(undefined);
  /** 固定タブの欄に入った時刻（通り過ぎただけで固定しないため） */
  const pinDwell = useRef<{ id: string; t: number; timer: number } | null>(null);
  const clearPinDwell = (all = true) => {
    if (pinDwell.current) clearTimeout(pinDwell.current.timer);
    if (all) pinDwell.current = null;
  };

  useEffect(() => { if (!mode && displays.length) setMode(activeMode); }, [mode, displays.length, activeMode]);

  const m = mode ?? activeMode;
  const wins = layouts?.[m] ?? [];
  const view = Math.max(0, Math.min(viewRaw, wins.length - 1));
  const shown = useMemo(() => (displays.length ? shownDisplays(displays, m) : []), [displays, m]);

  /** 今のセット・今のモードのウィンドウ一覧を書き換える */
  const setId = set?.id;
  const updateWins = useCallback((fn: (ws: WindowSpec[], l: Layouts) => void) => update((s) => {
    const target = s.sets.find((x) => x.id === setId);
    if (target) fn(target.layouts[m], target.layouts);
  }), [update, m, setId]);
  const selectSet = (id: string) => { setCurrentId(id); setSel(-1); history.replaceState(null, "", `#set=${id}`); };
  const bump = () => setVersion((v) => v + 1);

  // ---------- 配置図からの操作 ----------
  const commit = (i: number, screen: Bounds, resized: boolean) => {
    updateWins((ws) => {
      const w = ws[i];
      if (!w) return;
      if (resized && w.area === "max") w.area = "full"; // つまみで縮めたら最大化を解除
      applyBounds(w, screen, displays, m);
    });
    bump();
  };
  const toggleMax = (i: number) => {
    updateWins((ws) => { const w = ws[i]; w.area = w.area === "max" ? (w.custom ? "custom" : "full") : "max"; });
    bump();
  };
  /** タイトルを探して、見つかれば保存（手で編集したタイトルは上書きしない） */
  const resolveTitle = useCallback(async (tabId: string, url: string) => {
    const title = await lookupTitle(url);
    if (!title) return;
    update((s) => {
      for (const w of s.sets.flatMap((x) => [...x.layouts.docked, ...x.layouts.laptop])) {
        const t = w.tabs.find((x) => x.id === tabId);
        if (t && t.url === url && !t.titleManual) t.title = title;
      }
    });
  }, [update]);

  const addUrl = (i: number, { url, title }: DroppedUrl) => {
    const id = newId("t");
    updateWins((ws) => {
      const empty = ws[i].tabs.find((t) => !t.url);
      if (empty) { empty.url = url; empty.title = title; empty.titleManual = false; empty.id ??= id; }
      else ws[i].tabs.push({ id, url, title, pinned: false });
    });
    if (!title) void resolveTitle(wins[i]?.tabs.find((t) => !t.url)?.id ?? id, url);
    toast.success(`ウィンドウ ${i + 1} にタブを追加しました`, { description: title || fallbackTitle(url) });
  };
  const addWindow = () => {
    updateWins((ws) => { ws.push({ id: newId("w"), display: m === "laptop" ? "primary" : "external", area: "max", tabs: [{ id: newId("t"), url: "", pinned: false }] }); });
    setSel(wins.length);
  };
  const addWindowOn = (d: Display, { url, title }: DroppedUrl) => {
    const id = newId("t");
    updateWins((ws) => { ws.push({ id: newId("w"), display: displayKind(d, displays, m), area: "max", tabs: [{ id, url, title, pinned: false }] }); });
    if (!title) void resolveTitle(id, url);
    setSel(wins.length);
    toast.success(`${shortName(d, displays)} に新しいウィンドウを追加しました`, { description: title || fallbackTitle(url) });
  };

  // 保存済みでタイトルが無いタブは、開いた時に一度だけ探す
  const backfilled = useRef(new Set<string>());
  useEffect(() => {
    if (!state) return;
    for (const w of state.sets.flatMap((x) => [...x.layouts.docked, ...x.layouts.laptop])) {
      for (const t of w.tabs) {
        if (!t.id || !t.url || t.title || backfilled.current.has(t.id)) continue;
        backfilled.current.add(t.id);
        void resolveTitle(t.id, t.url);
      }
    }
  }, [state, resolveTitle]);
  const removeWindow = (i: number) => {
    updateWins((ws) => { ws.splice(i, 1); });
    setSel((s) => (s === i ? -1 : s > i ? s - 1 : s));
    bump();
  };

  // ---------- キーボード ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sel < 0 || confirm) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, [role=listbox], [role=option], [contenteditable]")) return;
      const step = e.shiftKey ? 5 : 1;
      const dirs: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (dirs[e.key]) {
        e.preventDefault();
        const [dx, dy] = dirs[e.key];
        updateWins((ws) => {
          const w = ws[sel];
          if (!w) return;
          const d = pickDisplay(shown, w.display);
          const b = resolveBounds(d.workArea, w);
          b.left += (d.workArea.width * dx) / 100;
          b.top += (d.workArea.height * dy) / 100;
          if (w.area === "max") w.area = "full";
          applyBounds(w, b, displays, m, false);
        });
        bump();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeWindow(sel);
      } else if (e.key === "Escape") setSel(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // ---------- 並べ替え（dnd-kit） ----------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  /**
   * ドロップ先の決め方
   * - タブのドラッグでは、ウィンドウのカードは候補にしない
   * - 「固定タブの欄の中にポインタがあるか」だけで固定／通常を決める（欄をまたいで形が変わっても行ったり来たりしない）
   * - 欄の中では一番近い固定タブ、外ではポインタの真下のタブ・グループの見出しを優先する
   */
  const collision: CollisionDetection = (args) => {
    if (dragItem?.type !== "tab") {
      return closestCorners({ ...args, droppableContainers: args.droppableContainers.filter((c) => parseTarget(String(c.id)).kind === "window") });
    }
    const cands = args.droppableContainers.filter((c) => isTabTarget(String(c.id)));
    const pinnedIds = new Set(wins.flatMap((w) => w.tabs.filter((t) => t.pinned).map((t) => t.id!)));
    const zone = pointerWithin({ ...args, droppableContainers: cands.filter((c) => parseTarget(String(c.id)).kind === "pinned") })[0];
    if (zone) {
      const t = parseTarget(String(zone.id));
      const ids = new Set(t.kind === "pinned" ? wins.find((w) => w.id === t.windowId)?.tabs.filter((x) => x.pinned).map((x) => x.id!) : []);
      // 通り過ぎただけで固定しない：固定でないタブは、欄に少し（PIN_DWELL_MS）とどまってから固定にする
      if (!ids.has(String(args.active.id))) {
        const d = pinDwell.current;
        if (d?.id !== zone.id) {
          if (d) clearTimeout(d.timer);
          const p = args.pointerCoordinates;
          // とどまっている間はポインタが動かないので、時間が来たら判定をやり直させる
          const timer = window.setTimeout(() => {
            if (p) document.dispatchEvent(new PointerEvent("pointermove", { clientX: p.x, clientY: p.y, bubbles: true, isPrimary: true }));
          }, PIN_DWELL_MS + 30);
          pinDwell.current = { id: String(zone.id), t: performance.now(), timer };
        }
        if (performance.now() - pinDwell.current!.t < PIN_DWELL_MS) return [];
      }
      clearPinDwell(false);
      const near = closestCenter({ ...args, droppableContainers: cands.filter((c) => ids.has(String(c.id))) });
      return near.length ? [near[0]] : [zone];
    }
    clearPinDwell();
    const rest = cands.filter((c) => parseTarget(String(c.id)).kind !== "pinned" && !pinnedIds.has(String(c.id)));
    const within = pointerWithin({ ...args, droppableContainers: rest });
    // グループの見出しの後半 → そのグループの最初のタブに重ねたことにする（置き場所の表示を飛ばさない）
    const pick = (c: Collision): Collision[] => {
      const id = resolveGroupJoin(wins, String(c.id), String(args.active.id));
      return id === String(c.id) ? [c] : [{ id, data: { droppableContainer: args.droppableContainers.find((x) => x.id === id), value: 0 } }];
    };
    const items = within.filter((c) => parseTarget(String(c.id)).kind !== "tabs");
    if (items.length) return pick(items[0]);
    // タブの間のすき間や下の空き → 同じウィンドウの一番近いタブ・見出しにする（すき間で離しても最後へ飛ばないように）。
    // そのウィンドウに通常のタブが無ければ、タブ列そのもの
    const box = within.find((c) => parseTarget(String(c.id)).kind === "tabs");
    if (box) {
      const wi = windowOfTarget(wins, String(box.id));
      const same = rest.filter((c) => !["tabs", "window"].includes(parseTarget(String(c.id)).kind) && windowOfTarget(wins, String(c.id)) === wi);
      // 最後のタブより後ろ（縦タブは下、横タブは右）の空き → タブ列そのもの（＝最後尾・グループ外）
      const p = args.pointerCoordinates;
      const ends = same.map((c) => c.rect.current).filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => (tabStrip.strip === "vertical" ? r.top + r.height : r.left + r.width));
      if (p && ends.length && (tabStrip.strip === "vertical" ? p.y : p.x) > Math.max(...ends)) return [box];
      const near = closestCenter({ ...args, droppableContainers: same });
      return near.length ? pick(near[0]) : [box];
    }
    return closestCorners({ ...args, droppableContainers: rest.filter((c) => parseTarget(String(c.id)).kind !== "window") });
  };

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    const wi = wins.findIndex((w) => w.id === id);
    if (wi >= 0) return setDragItem({ type: "window", win: wins[wi], index: wi });
    const tab = wins.flatMap((w) => w.tabs).find((t) => t.id === id);
    if (tab) { setDragItem({ type: "tab", tab }); setDropPreview(previewDrop(wins, id, null)); }
  };
  // 別のウィンドウへ移す、または「固定タブ」と「通常のタブ」の欄をまたいだら、その場で移して並びを見せる
  const onDragOver = (e: DragOverEvent) => {
    if (dragItem?.type !== "tab" || !e.over) return;
    const activeId = String(e.active.id), overId = String(e.over.id);
    // ウィンドウの切り替えタブに少し重ねると、そのウィンドウに表示を切り替える（続けて好きな位置に置ける）
    clearTimeout(switchTimer.current);
    const ot = parseTarget(overId);
    if (ot.kind === "window") {
      const i = wins.findIndex((w) => w.id === ot.id);
      if (i >= 0 && i !== view) switchTimer.current = window.setTimeout(() => setSel(i), WINDOW_SWITCH_MS);
    }
    const next = structuredClone(wins);
    const changed = dragOverTab(next, activeId, overId);
    // いま離したら固定・グループのどこに入るかを表示する
    setDropPreview(previewDrop(next, activeId, overId));
    // 変化が無いときは状態を更新しない（再描画→再判定の繰り返しを防ぐ）
    if (changed) updateWins((ws) => { dragOverTab(ws, activeId, overId); });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const item = dragItem;
    setDragItem(null);
    setDropPreview(null);
    clearTimeout(switchTimer.current);
    // 固定タブの欄にとどまる時間が足りないまま離した → その欄に落としたことにする
    const dwellId = pinDwell.current?.id;
    clearPinDwell();
    const overRaw = e.over ? String(e.over.id) : dwellId;
    if (!overRaw) return;
    const activeId = String(e.active.id), overId = overRaw;
    if (item?.type === "window") {
      const from = wins.findIndex((w) => w.id === activeId), to = windowOfTarget(wins, overId);
      if (from < 0 || to < 0 || from === to) return;
      updateWins((ws) => { const moved = arrayMove(ws, from, to); ws.splice(0, ws.length, ...moved); });
      setSel((s) => (s === from ? to : s));
      bump();
    } else if (item?.type === "tab") {
      updateWins((ws) => { dropTab(ws, activeId, overId); });
    }
  };

  // ---------- 取り込み・開く・バックアップ ----------
  /** 今のウィンドウを読み取って、上書きの確認を出す */
  const startCapture = async () => {
    const result = await captureWindows(displays, m);
    if (!result.length) { toast.error("取り込めるウィンドウがありません"); return; }
    setConfirm({ kind: "capture", result });
  };
  const doCapture = (result: WindowSpec[]) => {
    updateWins((_, l) => { l[m] = result; });
    setSel(-1);
    bump();
    toast.success(`${result.length} 個のウィンドウを取り込みました`, { description: `「${MODE_LABEL[m]}」のレイアウトを置き換えました` });
  };
  const openNow = async () => {
    if (!state || !set) return;
    await saveState(state);
    const msg: Message = { type: "open-set", setId: set.id, mode: m };
    void chrome.runtime.sendMessage(msg);
    toast(`「${set.name}」を開きました`, { description: `${MODE_LABEL[m]}のレイアウト` });
  };

  // ---------- セットの操作 ----------
  const addSet = () => {
    const ns = newSet(`新しいセット ${(state?.sets.length ?? 0) + 1}`);
    update((s) => { s.sets.push(ns); });
    selectSet(ns.id);
    setRenamingId(ns.id);
  };
  const duplicateSet = (id: string) => {
    const src = state?.sets.find((x) => x.id === id);
    if (!src) return;
    // id を振り直して複製
    const copy = structuredClone(src.layouts);
    for (const w of [...copy.docked, ...copy.laptop]) { delete w.id; for (const t of w.tabs) delete t.id; }
    const ns = newSet(`${src.name} のコピー`, ensureIds(copy));
    update((s) => { s.sets.splice(s.sets.findIndex((x) => x.id === id) + 1, 0, ns); });
    selectSet(ns.id);
    toast.success(`「${src.name}」を複製しました`);
  };
  const deleteSet = (id: string) => {
    if (!state || state.sets.length <= 1) return;
    const idx = state.sets.findIndex((x) => x.id === id);
    const name = state.sets[idx]?.name;
    update((s) => {
      s.sets.splice(idx, 1);
      if (s.startupSetId === id) s.startupSetId = null;
    });
    if (set?.id === id) selectSet(state.sets[idx + 1]?.id ?? state.sets[idx - 1].id);
    toast(`「${name}」を削除しました`);
  };
  const toggleStartup = (id: string) => update((s) => { s.startupSetId = s.startupSetId === id ? null : id; });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "window-layout.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (file: File) => {
    try {
      const r = parseImported(JSON.parse(await file.text()));
      if (r.kind === "state") {
        replace(r.state);
        selectSet(r.state.sets[0].id);
        toast.success("設定を読み込みました", { description: `${r.state.sets.length} 個のセット` });
      } else {
        update((s) => { s.sets.push(r.set); });
        selectSet(r.set.id);
        toast.success("旧形式の設定を、新しいセットとして追加しました");
      }
      bump();
    } catch (err) {
      toast.error("読み込めませんでした", { description: (err as Error).message });
    }
  };

  if (!state || !set || !layouts || !displays.length) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">読み込み中…</div>;
  }

  const shortcut = IS_MAC ? ["⌘", "Shift", "Y"] : ["Ctrl", "Shift", "Y"];

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <LayoutGrid className="size-4" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">Window Layout Launcher</h1>
            <p className="text-xs text-muted-foreground">ウィンドウの配置とタブを、名前付きのセットとして登録</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {savedAt ? <><Check className="size-3.5 text-emerald-500" /> 自動保存済み</> : "変更は自動で保存されます"}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto [&>*]:shrink-0">
          <SetList
            sets={state.sets}
            currentId={set.id}
            startupId={state.startupSetId}
            mode={activeMode}
            onSelect={selectSet}
            onAdd={addSet}
            onRename={(id, name) => update((s) => { const x = s.sets.find((y) => y.id === id); if (x) x.name = name; })}
            onDuplicate={duplicateSet}
            onDelete={(id) => setConfirm({ kind: "delete", id })}
            onToggleStartup={toggleStartup}
            onReorder={(from, to) => update((s) => { s.sets = arrayMove(s.sets, from, to); })}
            renamingId={renamingId}
            onRenamingDone={() => setRenamingId(null)}
          />
          <Card size="sm">
            <CardHeader>
              <CardTitle>接続中のディスプレイ</CardTitle>
              <CardDescription>{displays.length} 枚 ・「{MODE_LABEL[activeMode]}」を使用</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {displays.map((d, i) => (
                <div key={d.id} className="flex items-center gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    {d.isInternal ? <Laptop className="size-4" /> : <Monitor className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{i + 1}. {d.name || "Display"}</div>
                    <div className="text-xs text-muted-foreground">{d.bounds.width} × {d.bounds.height}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {d.isPrimary && <Badge>メイン</Badge>}
                    <Badge variant="outline">{d.isInternal ? "本体" : "外部"}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>開き方</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">アイコン／ショートカット</span>
                <span className="flex gap-1">{shortcut.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
              </div>
              <p className="text-xs text-muted-foreground">セットの一覧が開き、選んだセットを開きます。</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Chromeの起動時</span>
                <Badge variant="secondary" className="max-w-[140px] truncate">
                  <Star className="fill-amber-400 text-amber-400" />
                  {state.sets.find((x) => x.id === state.startupSetId)?.name ?? "開かない"}
                </Badge>
              </div>
              <Separator className="my-1" />
              <Button variant="outline" size="sm" onClick={() => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}>
                <Keyboard /> ショートカットを変更
              </Button>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>バックアップ・移行</CardTitle>
              <CardDescription>別のPCへ移すときは、書き出したJSONを向こうで読み込みます。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={exportJson}><Download /> 設定を書き出す</Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload /> 設定を読み込む</Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirm({ kind: "reset" })}>
                <RotateCcw /> 初期値に戻す
              </Button>
              <input
                ref={fileRef} type="file" accept="application/json" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ""; }}
              />
            </CardContent>
          </Card>
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {set.name}
                <Button
                  variant={state.startupSetId === set.id ? "secondary" : "ghost"}
                  size="xs"
                  className="font-normal"
                  onClick={() => toggleStartup(set.id)}
                >
                  <Star className={state.startupSetId === set.id ? "fill-amber-400 text-amber-400" : "text-muted-foreground"} />
                  {state.startupSetId === set.id ? "起動時に開く" : "起動時に開くセットにする"}
                </Button>
              </CardTitle>
              <CardDescription>ディスプレイの接続状態に応じて、どちらかのレイアウトで開きます。片方が空なら、もう一方を使います。</CardDescription>
              <CardAction>
                <Tabs value={m} onValueChange={(v) => { setMode(v as Mode); setSel(-1); }}>
                  <TabsList>
                    {(["docked", "laptop"] as const).map((md) => (
                      <TabsTrigger key={md} value={md} className="gap-1.5 px-3">
                        {md === "docked" ? <Monitor /> : <Laptop />}
                        {MODE_LABEL[md]}
                        {activeMode === md && <span className="size-1.5 rounded-full bg-emerald-500" title="今の接続で使われるレイアウト" />}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void startCapture()}>
                  <Camera /> 今の配置を取り込む
                </Button>
                <Button variant="outline" onClick={() => void openNow()}><Play /> 今すぐ開いて試す</Button>
                <Button variant="outline" onClick={addWindow}>
                  <Plus /> ウィンドウを追加
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">
                  {m === activeMode ? "今の接続で使われるレイアウトです" : `今の接続では使われません（${displays.length >= 2 ? "2枚以上" : "1枚"}接続中）`}
                </span>
              </div>

              <LayoutPreview
                windows={wins}
                displays={displays}
                shown={shown}
                selected={sel}
                version={version}
                onSelect={setSel}
                onCommit={commit}
                onToggleMax={toggleMax}
                onDropUrlOnWindow={addUrl}
                onDropUrlOnDisplay={addWindowOn}
              />

              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <Hint k="ドラッグ">移動</Hint>
                <Hint k="辺・角">サイズ変更</Hint>
                <Hint k="ダブルクリック">最大化</Hint>
                <Hint k="← ↑ → ↓">微調整（Shiftで大きく）</Hint>
                <Hint k="Delete">削除</Hint>
                <Hint k="タブ／リンクをドロップ">追加</Hint>
              </div>
            </CardContent>
          </Card>

          <div className="-mb-1 flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
            <span>Chrome のタブ</span>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[tabStrip.pref]}
              onValueChange={(v) => { if (v[0]) tabStrip.setPref(v[0] as TabStripPref); }}
            >
              <ToggleGroupItem value="auto" className="px-2.5 text-xs" title={`このウィンドウの枠から判定（上 ${tabStrip.detected.top}px・横 ${tabStrip.detected.side}px）`}>
                自動（{tabStrip.detected.strip === "vertical" ? "縦" : "横"}）
              </ToggleGroupItem>
              <ToggleGroupItem value="horizontal" className="px-2.5 text-xs">横タブ</ToggleGroupItem>
              <ToggleGroupItem value="vertical" className="px-2.5 text-xs">縦タブ</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <DndContext sensors={sensors} collisionDetection={collision} measuring={{ droppable: { strategy: MeasuringStrategy.Always, frequency: 100 } }} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setDragItem(null); setDropPreview(null); clearPinDwell(); }}>
          <DragPreviewContext.Provider value={dropPreview}>
              {wins.length ? (
                <div className="flex flex-col">
                  <WindowTabs
                    wins={wins}
                    current={view}
                    onSelect={(i) => setSel(i)}
                    onAdd={addWindow}
                    tabDragging={dragItem?.type === "tab"}
                  />
                  <WindowCard
                    key={wins[view].id}
                    win={wins[view]}
                    index={view}
                    selected={view === sel}
                    onSelect={() => setSel(view)}
                    onChange={(fn) => updateWins((ws) => fn(ws[view]))}
                    onRemove={() => removeWindow(view)}
                    onAddUrl={(d) => addUrl(view, d)}
                    onResolveTitle={(id, url) => void resolveTitle(id, url)}
                    strip={tabStrip.strip}
                  />
                </div>
              ) : (
                <Card className="items-center py-12 text-center">
                  <AppWindow className="size-8 text-muted-foreground" />
                  <CardTitle>ウィンドウがありません</CardTitle>
                  <CardDescription>「今の配置を取り込む」「ウィンドウを追加」、または配置図へタブをドロップして作成できます。</CardDescription>
                </Card>
              )}
            <DragOverlay dropAnimation={{ duration: 160 }} modifiers={dragItem?.type === "tab" ? [snapCenterToCursor] : undefined}>
              {dragItem?.type === "tab" && (
                <TabDragPreview tab={wins.flatMap((w) => w.tabs).find((t) => t.id === dragItem.tab.id) ?? dragItem.tab} preview={dropPreview} />
              )}
              {dragItem?.type === "window" && <WindowDragPreview win={dragItem.win} index={dragItem.index} />}
            </DragOverlay>
          </DragPreviewContext.Provider>
          </DndContext>
        </div>

      </main>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "reset" ? "初期値に戻しますか？" : confirm?.kind === "delete" ? "セットを削除しますか？" : wins.length ? "今の配置で上書きしますか？" : "今の配置を取り込みますか？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "reset"
                ? "すべてのセットが削除され、初期のセット1つだけに戻ります。必要なら先に設定を書き出してください。"
                : confirm?.kind === "delete"
                  ? `「${state.sets.find((x) => x.id === confirm.id)?.name}」を削除します。元に戻せません。`
                  : wins.length
                    ? `「${set.name}」の「${MODE_LABEL[m]}」のレイアウトを、今開いているChromeのウィンドウ配置で上書きします。上書きした内容は元に戻せません。`
                    : `「${set.name}」の「${MODE_LABEL[m]}」のレイアウトに、今開いているChromeのウィンドウ配置を取り込みます。`}
            </AlertDialogDescription>
            {confirm?.kind === "capture" && (
              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                <CaptureSummary label="今のレイアウト" wins={wins} muted />
                <ArrowRight className="size-4 text-muted-foreground" />
                <CaptureSummary label="取り込む内容" wins={confirm.result} />
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === "capture" && !wins.length ? "default" : "destructive"}
              onClick={() => {
                if (confirm?.kind === "reset") { reset(); setCurrentId(null); setSel(-1); bump(); toast("初期値に戻しました"); }
                else if (confirm?.kind === "delete") deleteSet(confirm.id);
                else if (confirm?.kind === "capture") doCapture(confirm.result);
                setConfirm(null);
              }}
            >
              {confirm?.kind === "reset" ? "初期値に戻す" : confirm?.kind === "delete" ? "削除する" : wins.length ? "上書きする" : "取り込む"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

function Hint({ k, children }: { k: string; children: React.ReactNode }) {
  return <span className="flex items-center gap-1.5"><Kbd>{k}</Kbd>{children}</span>;
}

/** 上書きの確認で見せる、レイアウトの中身の要約 */
function CaptureSummary({ label, wins, muted }: { label: string; wins: WindowSpec[]; muted?: boolean }) {
  const tabs = wins.flatMap((w) => w.tabs.filter((t) => t.url));
  const groups = wins.reduce((n, w) => n + (w.groups?.length ?? 0), 0);
  return (
    <div className={cn("rounded-lg border p-3", muted && "bg-muted/40 text-muted-foreground")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      {wins.length ? (
        <>
          <div className="mt-0.5 flex flex-wrap gap-x-2 font-medium text-foreground">
            <span className="whitespace-nowrap">ウィンドウ {wins.length}</span>
            <span className="whitespace-nowrap">タブ {tabs.length}</span>
            {groups > 0 && <span className="whitespace-nowrap">グループ {groups}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tabs.slice(0, 8).map((t) => <Favicon key={t.id} url={t.url} className="size-4" />)}
            {tabs.length > 8 && <span className="text-[11px]">+{tabs.length - 8}</span>}
          </div>
        </>
      ) : (
        <div className="mt-0.5">（空）</div>
      )}
    </div>
  );
}

/** ウィンドウの切り替えタブに、これだけ重ねたら表示を切り替える（ミリ秒） */
const WINDOW_SWITCH_MS = 450;

/** 固定タブの欄に、これだけとどまったら固定にする（ミリ秒） */
const PIN_DWELL_MS = 250;

/** ドラッグ中の見た目をポインタの中心に合わせる（小さい固定タブでも持ちやすい） */
const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !(activatorEvent instanceof PointerEvent || activatorEvent instanceof MouseEvent)) return transform;
  return {
    ...transform,
    x: transform.x + activatorEvent.clientX - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + activatorEvent.clientY - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};
