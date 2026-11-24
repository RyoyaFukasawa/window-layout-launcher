import { type Bounds, type Display, displayContaining, displayKind, type GroupColor, type GroupSpec, guessArea, type Mode, normalizeGroups, type TabSpec, type WindowSpec } from "@/entities/window";
import { newId } from "@/shared/lib/id";

/** 今開いている Chrome のウィンドウ配置を読み取る */
export async function captureWindows(displays: Display[], mode: Mode): Promise<WindowSpec[]> {
  const self = chrome.runtime.getURL("");
  const all = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const result: WindowSpec[] = [];
  for (const win of all) {
    // Chrome のグループ id → 保存用のグループ
    const groupMap = new Map<number, GroupSpec>();
    for (const t of win.tabs ?? []) {
      if (t.groupId === undefined || t.groupId < 0 || groupMap.has(t.groupId)) continue;
      try {
        const g = await chrome.tabGroups.get(t.groupId);
        groupMap.set(t.groupId, { id: newId("g"), title: g.title ?? "", color: g.color as GroupColor, collapsed: g.collapsed || undefined });
      } catch { /* 権限がない等。グループなしで取り込む */ }
    }
    const tabs: TabSpec[] = (win.tabs ?? [])
      .map((t) => ({
        id: newId("t"), url: t.pendingUrl || t.url || "", pinned: t.pinned, title: t.title || undefined,
        group: t.groupId !== undefined && t.groupId >= 0 ? groupMap.get(t.groupId)?.id : undefined,
      }))
      .filter((t) => t.url && !t.url.startsWith(self) && !t.url.startsWith("chrome://newtab"));
    if (!tabs.length) continue;
    const b: Bounds = { left: win.left ?? 0, top: win.top ?? 0, width: win.width ?? 800, height: win.height ?? 600 };
    const d = displayContaining(displays, b);
    const g = guessArea(d.workArea, b, win.state === "maximized" || win.state === "fullscreen");
    const spec: WindowSpec = { id: newId("w"), display: displayKind(d, displays, mode), ...g, tabs, groups: [...groupMap.values()] };
    normalizeGroups(spec);
    result.push(spec);
  }
  return result;
}
