// タブのドラッグ＆ドロップで、ウィンドウ一覧をどう書き換えるか（React・dnd-kit に依存しない）
import { arrayMove } from "@dnd-kit/sortable";
import { adoptNeighborGroup, adoptNeighborPinned, groupOf, type GroupSpec, normalizeGroups, type WindowSpec } from "@/entities/window";
import { newId } from "@/shared/lib/id";

/**
 * ドロップ先の id の種類
 * - tab:    タブ（id は "t-..."）
 * - tabs:   ウィンドウのタブ列そのもの（"tabs:<windowId>"）
 * - pinned: 固定タブの欄（"pinned:<windowId>"）
 * - group:  グループの見出しの後半（"group:<windowId>:<groupId>"）。グループの最初（見出しのすぐ下・右）に入る
 * - beforeGroup: グループの見出しの前半（"before:<windowId>:<groupId>"）。グループの直前（グループ外）に入る
 * - window: ウィンドウの切り替えタブ（ウィンドウの並べ替え用。タブのドラッグでは「そのウィンドウの最後へ移す」）
 */
export type DropTarget =
  | { kind: "tab"; id: string }
  | { kind: "tabs"; windowId: string }
  | { kind: "pinned"; windowId: string }
  | { kind: "group"; windowId: string; groupId: string }
  | { kind: "beforeGroup"; windowId: string; groupId: string }
  | { kind: "window"; id: string };

export const tabsDropId = (windowId: string) => `tabs:${windowId}`;
export const pinnedDropId = (windowId: string) => `pinned:${windowId}`;
export const groupDropId = (windowId: string, groupId: string) => `group:${windowId}:${groupId}`;
export const beforeGroupDropId = (windowId: string, groupId: string) => `before:${windowId}:${groupId}`;

export function parseTarget(id: string): DropTarget {
  if (id.startsWith("tabs:")) return { kind: "tabs", windowId: id.slice(5) };
  if (id.startsWith("pinned:")) return { kind: "pinned", windowId: id.slice(7) };
  for (const [prefix, kind] of [["group:", "group"], ["before:", "beforeGroup"]] as const) {
    if (!id.startsWith(prefix)) continue;
    const rest = id.slice(prefix.length);
    const i = rest.lastIndexOf(":");
    return { kind, windowId: rest.slice(0, i), groupId: rest.slice(i + 1) };
  }
  if (id.startsWith("t-")) return { kind: "tab", id };
  return { kind: "window", id };
}

/** タブのドラッグで候補にするドロップ先（ウィンドウの切り替えタブも含む） */
export const isTabTarget = (_id: string) => true;

export const windowOfTab = (ws: WindowSpec[], tabId: string) => ws.findIndex((w) => w.tabs.some((t) => t.id === tabId));

export function windowOfTarget(ws: WindowSpec[], id: string): number {
  const t = parseTarget(id);
  if (t.kind === "tab") return windowOfTab(ws, t.id);
  if (t.kind === "window") return ws.findIndex((w) => w.id === t.id);
  return ws.findIndex((w) => w.id === t.windowId);
}

/** タブをグループの直前（グループ外・固定なし）へ置く。すでにそこにあれば false */
function placeBeforeGroup(ws: WindowSpec[], from: number, to: number, activeId: string, groupId: string): boolean {
  const w = ws[to];
  if (!w.groups?.some((g) => g.id === groupId)) return false;
  const tab = ws[from].tabs.find((t) => t.id === activeId)!;
  const first = w.tabs.findIndex((t) => t.group === groupId);
  if (from === to && !tab.pinned && !tab.group && w.tabs[first - 1] === tab) return false;
  ws[from].tabs.splice(ws[from].tabs.indexOf(tab), 1);
  tab.pinned = false;
  delete tab.group;
  w.tabs.splice(w.tabs.findIndex((t) => t.group === groupId), 0, tab);
  if (!ws[from].tabs.length) ws[from].tabs.push({ id: newId("t"), url: "" });
  return true;
}

/** タブをグループの最初（見出しのすぐ後）へ入れる。すでにそこにあれば false */
function placeAtGroupStart(ws: WindowSpec[], from: number, to: number, activeId: string, groupId: string): boolean {
  const w = ws[to];
  if (!w.groups?.some((g) => g.id === groupId)) return false;
  const tab = ws[from].tabs.find((t) => t.id === activeId)!;
  if (from === to && tab.group === groupId && w.tabs.find((t) => t.group === groupId) === tab) return false;
  ws[from].tabs.splice(ws[from].tabs.indexOf(tab), 1);
  tab.pinned = false;
  tab.group = groupId;
  const first = w.tabs.findIndex((t) => t.group === groupId);
  // グループに他のタブが無い（自分だけだった）ときは、元の場所あたりに戻す
  w.tabs.splice(first >= 0 ? first : w.tabs.length, 0, tab);
  if (!ws[from].tabs.length) ws[from].tabs.push({ id: newId("t"), url: "" });
  return true;
}

/** ドロップ先が固定タブの欄（またはその中の固定タブ）か */
function targetIsPinned(ws: WindowSpec[], t: DropTarget): boolean {
  if (t.kind === "pinned") return true;
  if (t.kind === "tab") return !!ws.flatMap((w) => w.tabs).find((x) => x.id === t.id)?.pinned;
  return false;
}

/**
 * ドラッグ中（onDragOver）：別のウィンドウへ移ったとき、「固定タブ」と「通常のタブ」の欄をまたいだとき、
 * グループの見出しに重ねたときに、その場でタブを移す（並べ替えの見た目を正しくするため）。それ以外は何もしない。
 * @returns 書き換えたら true（呼び出し側は false のとき状態を更新しない）
 */
export function dragOverTab(ws: WindowSpec[], activeId: string, overId: string): boolean {
  if (overId === activeId) return false;
  const target = parseTarget(overId);
  // ウィンドウの切り替えタブ：別のウィンドウなら、その最後へ移す（同じウィンドウなら何もしない）
  if (target.kind === "window") {
    const from = windowOfTab(ws, activeId), to = ws.findIndex((w) => w.id === target.id);
    if (from < 0 || to < 0 || from === to) return false;
    const tab = ws[from].tabs.find((t) => t.id === activeId)!;
    ws[from].tabs.splice(ws[from].tabs.indexOf(tab), 1);
    tab.pinned = false;
    delete tab.group;
    ws[to].tabs.push(tab);
    if (!ws[from].tabs.length) ws[from].tabs.push({ id: newId("t"), url: "" });
    return true;
  }
  const from = windowOfTab(ws, activeId), to = windowOfTarget(ws, overId);
  if (from < 0 || to < 0) return false;
  const tab = ws[from].tabs.find((t) => t.id === activeId)!;

  // グループの見出しの前半 → その場でグループの直前（グループ外）へ
  if (target.kind === "beforeGroup") return placeBeforeGroup(ws, from, to, activeId, target.groupId);

  // グループの見出しの後半 → その場でグループの最初へ入れる。
  // 見出しは並べ替えの対象ではないので、並びを実際に動かしておかないと、置き場所の表示が元の位置へ戻ってしまう
  if (target.kind === "group") return placeAtGroupStart(ws, from, to, activeId, target.groupId);

  // タブ列の空いている所（最後のタブより後ろ）→ その場で最後尾（グループ外）へ。
  // 動かしておかないと、置き場所の表示がグループの中に残ったまま「グループ外」になってしまう
  if (target.kind === "tabs") {
    const w = ws[to];
    if (from === to && !tab.pinned && !tab.group && w.tabs[w.tabs.length - 1] === tab) return false;
    ws[from].tabs.splice(ws[from].tabs.indexOf(tab), 1);
    tab.pinned = false;
    delete tab.group;
    w.tabs.push(tab);
    if (!ws[from].tabs.length) ws[from].tabs.push({ id: newId("t"), url: "" });
    return true;
  }

  const toPinned = targetIsPinned(ws, target);
  if (from === to && !!tab.pinned === toPinned) return false;

  ws[from].tabs.splice(ws[from].tabs.indexOf(tab), 1);
  tab.pinned = toPinned;
  const tabs = ws[to].tabs;
  const overTab = target.kind === "tab" ? tabs.find((t) => t.id === target.id) : undefined;
  // 重ねたタブがグループのタブなら、その場でそのグループに入れる。
  // グループの外のまま最初のタブの前に入れると、グループの見出しが押し出されてポインタの下からずれてしまう
  if (!toPinned && overTab?.group) tab.group = overTab.group;
  else delete tab.group;
  const at = overTab ? tabs.indexOf(overTab) : toPinned ? tabs.filter((t) => t.pinned).length : tabs.length;
  tabs.splice(at, 0, tab);
  if (!ws[from].tabs.length) ws[from].tabs.push({ id: newId("t"), url: "" });
  return true;
}

/**
 * ドロップしたとき（onDragEnd）：並びを確定し、固定・グループを決める
 * - 固定タブの欄 → 固定（すでに固定なら見えていた位置のまま）
 * - グループの見出しの前半 → グループの直前（グループ外）
 * - グループの見出しの後半 → そのグループの最初に入れる
 * - タブの上 → そのタブの位置へ。固定は前後のタブで、グループは落とした先のタブと同じにする
 *   （自分の場所に落とした場合は、前後のタブのグループに合わせる）
 * - タブ列の空いている所 → 最後に、固定・グループなしで入れる
 */
export function dropTab(ws: WindowSpec[], activeId: string, overId: string) {
  const wi = windowOfTab(ws, activeId);
  if (wi < 0) return;
  const w = ws[wi];
  const target = parseTarget(overId);
  const a = w.tabs.findIndex((t) => t.id === activeId);
  const tab = w.tabs[a];

  // ウィンドウの切り替えタブに落とした：別のウィンドウならその最後へ（ドラッグ中に移っていれば、見えていた位置のまま）
  if (target.kind === "window") {
    dragOverTab(ws, activeId, overId);
    for (const x of ws) {
      if (!x.tabs.length) x.tabs.push({ id: newId("t"), url: "" });
      normalizeGroups(x);
    }
    return;
  }

  if (target.kind === "pinned") {
    if (!tab.pinned) {
      w.tabs.splice(a, 1);
      w.tabs.splice(w.tabs.filter((t) => t.pinned).length, 0, tab);
      tab.pinned = true;
      delete tab.group;
    }
  } else if (target.kind === "beforeGroup") {
    const to = ws.findIndex((x) => x.id === target.windowId);
    if (to >= 0) placeBeforeGroup(ws, wi, to, activeId, target.groupId);
  } else if (target.kind === "group") {
    const to = ws.findIndex((x) => x.id === target.windowId);
    if (to >= 0) placeAtGroupStart(ws, wi, to, activeId, target.groupId);
  } else if (target.kind === "tab") {
    const b = w.tabs.findIndex((t) => t.id === target.id);
    if (b >= 0 && a !== b) w.tabs = arrayMove(w.tabs, a, b);
    adoptNeighborPinned(w, activeId);
    const over = w.tabs.find((t) => t.id === target.id);
    if (over && over !== tab) {
      if (!tab.pinned && over.group && !over.pinned) tab.group = over.group;
      else delete tab.group;
    } else {
      adoptNeighborGroup(w, activeId);
    }
  } else if (target.kind === "tabs" && target.windowId === w.id) {
    w.tabs.splice(a, 1);
    w.tabs.push(tab);
    tab.pinned = false;
    delete tab.group;
  }

  for (const x of ws) {
    if (!x.tabs.length) x.tabs.push({ id: newId("t"), url: "" });
    normalizeGroups(x);
  }
}

/** いま離したらどうなるか（ドラッグ中の表示用） */
export interface DropPreview {
  windowId: string;
  pinned: boolean;
  /** 入るグループ（無ければグループ外） */
  group?: GroupSpec;
  /** 置く先のウィンドウにグループがあるか（「グループ外」と出すかどうか） */
  windowHasGroups: boolean;
}

/** dropTab と同じ処理を写しで実行して、離したときの結果を返す（表示と実際の結果が必ず一致する） */
export function previewDrop(ws: WindowSpec[], activeId: string, overId: string | null): DropPreview | null {
  const c = structuredClone(ws);
  if (overId) dropTab(c, activeId, overId);
  const wi = windowOfTab(c, activeId);
  if (wi < 0) return null;
  const w = c[wi];
  const t = w.tabs.find((x) => x.id === activeId)!;
  return { windowId: w.id!, pinned: !!t.pinned, group: groupOf(w, t), windowHasGroups: !!w.groups?.length };
}

/**
 * グループの見出しの後半に重ねたときは、そのグループの最初のタブに重ねたことにする。
 * 見出しは並べ替えの対象ではないので、見出しのままだと置き場所の表示が元の位置へ戻ってしまう。
 * タブに重ねたことにすれば、表示は「グループの最初」のまま続き、離すと（タブの上に落としたとき同様）グループに入る。
 * 折りたたまれたグループ（タブが見えない）や、同じウィンドウでグループより上から来たときは、見出しのまま（グループの最初へ入れる）。
 */
export function resolveGroupJoin(ws: WindowSpec[], overId: string, activeId?: string): string {
  const t = parseTarget(overId);
  if (t.kind !== "group") return overId;
  const w = ws.find((x) => x.id === t.windowId);
  const g = w?.groups?.find((x) => x.id === t.groupId);
  if (!w || !g || g.collapsed) return overId;
  const first = w.tabs.findIndex((x) => x.group === g.id);
  if (first < 0) return overId;
  // 同じウィンドウでグループより上から来たとき（または、すでにグループの最初にいるとき）は、
  // 最初のタブに重ねると「その後ろ」に入ってしまうので、見出しのまま（ドラッグ中にグループの最初へ実際に動かす）にする
  const ai = activeId ? w.tabs.findIndex((x) => x.id === activeId) : -1;
  if (ai >= 0 && ai <= first) return overId;
  return w.tabs[first].id!;
}
