import { normalizeUrl } from "@/shared/lib/url";

/** URL のタイトルを、開いているタブ → 閲覧履歴の順に探す（外部への通信はしない） */
export async function lookupTitle(url: string): Promise<string | null> {
  const target = normalizeUrl(url);
  try {
    const tabs = await chrome.tabs.query({});
    const open = tabs.find((t) => t.url && t.title && normalizeUrl(t.url) === target);
    if (open?.title) return open.title;
  } catch { /* 取得できなくても続ける */ }
  try {
    const items = await chrome.history.search({ text: url, startTime: 0, maxResults: 50 });
    const exact = items.find((h) => h.url && h.title && normalizeUrl(h.url) === target);
    if (exact?.title) return exact.title;
  } catch { /* 履歴の権限がない等 */ }
  return null;
}
