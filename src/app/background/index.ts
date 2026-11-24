import { CLOSE_EMPTY_STARTUP_WINDOWS, loadState, saveState } from "@/entities/layout-set";
import { type Message, openSet } from "@/features/open-set";

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
