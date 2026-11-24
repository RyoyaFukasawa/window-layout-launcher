import { CLOSE_EMPTY_STARTUP_WINDOWS } from "./shared/layout";
import { normalizeGroups } from "./shared/groups";
import { pickDisplay, resolveBounds } from "./shared/geometry";
import { layoutFor, loadState, saveState } from "./shared/store";
import type { Message, Mode, WindowSpec } from "./shared/types";

const NEW_TAB_URLS = ["chrome://newtab/", "chrome://new-tab-page/", "about:blank"];

async function emptyWindowIds(): Promise<number[]> {
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  return wins
    .filter((w) => (w.tabs ?? []).every((t) => NEW_TAB_URLS.includes(t.pendingUrl || t.url || "")))
    .flatMap((w) => (w.id === undefined ? [] : [w.id]));
}

/** タブグループを作る（グループ分けに失敗しても、タブは開いたままにする） */
async function applyGroups(windowId: number, spec: WindowSpec, created: (number | undefined)[]) {
  for (const g of spec.groups ?? []) {
    const tabIds = spec.tabs.flatMap((t, i) => (t.group === g.id && created[i] !== undefined ? [created[i]!] : []));
    if (!tabIds.length) continue;
    try {
      const groupId = await chrome.tabs.group({ tabIds: tabIds as [number, ...number[]], createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, { title: g.title, color: g.color, collapsed: !!g.collapsed });
    } catch (e) {
      console.warn("タブグループを作れませんでした", g.title, e);
    }
  }
}

/** セットを開く。setId を省略すると起動時に開くセット */
async function openSet({ setId, closeEmpty = false, mode }: { setId?: string | null; closeEmpty?: boolean; mode?: Mode } = {}) {
  const state = await loadState();
  const set = state.sets.find((s) => s.id === (setId ?? state.startupSetId));
  if (!set) return;
  const toClose = closeEmpty ? await emptyWindowIds() : [];
  const displays = await chrome.system.display.getInfo();
  const layout = layoutFor(set, mode ?? (displays.length >= 2 ? "docked" : "laptop"));

  for (const original of layout) {
    const spec = structuredClone(original);
    spec.tabs = spec.tabs.filter((t) => t.url);
    normalizeGroups(spec);
    const tabs = spec.tabs;
    const display = pickDisplay(displays, spec.display);
    const [first, ...rest] = tabs.length ? tabs : [{ url: "chrome://newtab/" }];
    const win = await chrome.windows.create({
      url: first.url,
      focused: true,
      ...resolveBounds(display.workArea, spec),
    });
    if (!win?.id) continue;
    const firstTab = win.tabs?.[0];
    if (first.pinned && firstTab?.id !== undefined) await chrome.tabs.update(firstTab.id, { pinned: true });
    // 作ったタブの id（グループ分けに使う）
    const created: (number | undefined)[] = [firstTab?.id];
    for (const t of rest) {
      const tab = await chrome.tabs.create({ windowId: win.id, url: t.url, pinned: !!t.pinned, active: false });
      created.push(tab.id);
    }
    await applyGroups(win.id, spec, created);
    if (spec.area === "max") await chrome.windows.update(win.id, { state: "maximized" });
  }

  for (const id of toClose) {
    try { await chrome.windows.remove(id); } catch { /* すでに閉じられている */ }
  }
}

// Chrome の起動時は ★ のセットを開く（無ければ何もしない）
chrome.runtime.onStartup.addListener(() => { void openSet({ closeEmpty: CLOSE_EMPTY_STARTUP_WINDOWS }); });

// ポップアップ・設定画面からの「開く」
chrome.runtime.onMessage.addListener((msg: Message) => {
  if (msg?.type === "open-set") void openSet({ setId: msg.setId, mode: msg.mode });
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  // 旧形式（layouts だけ）の保存内容を、セット形式に移しておく
  const stored = await chrome.storage.local.get("appState");
  if (!stored.appState) await saveState(await loadState());
  if (reason === "install") void chrome.runtime.openOptionsPage();
});
