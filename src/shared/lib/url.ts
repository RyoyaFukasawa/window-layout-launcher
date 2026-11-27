export const faviconUrl = (url: string) => {
  if (!/^https?:/.test(url)) return null;
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", url);
  u.searchParams.set("size", "32");
  return u.toString();
};

export interface DroppedUrl { url: string; title?: string }

/** ブラウザのタブ・リンク・アドレスバーからドロップされた URL（とリンク文字列）を取り出す */
export function urlFromDrop(dt: DataTransfer | null): DroppedUrl | null {
  if (!dt) return null;
  const list = dt.getData("text/uri-list").split(/\r?\n/).find((l) => l && !l.startsWith("#"));
  const text = list || dt.getData("text/plain").trim();
  if (!/^https?:\/\/\S+$/.test(text)) return null;
  // リンクをドラッグした場合は <a>リンク文字列</a> が text/html に入っている
  const html = dt.getData("text/html");
  const title = html ? new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() : "";
  return { url: text, title: title && title !== text ? title : undefined };
}

export const normalizeUrl = (u: string) => u.replace(/#.*$/, "").replace(/\/+$/, "");

/** タイトルが無いときの表示（ドメイン＋パス） */
export function fallbackTitle(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return url;
  }
}
export const isUrlDrag = (dt: DataTransfer | null) =>
  !!dt && (dt.types.includes("text/uri-list") || dt.types.includes("text/plain"));

/** URL 欄の入力に https:// を補う（「example.com/path」→「https://example.com/path」） */
export function normalizeInput(v: string) {
  const s = v.trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return /^[^\s/]+\.[^\s/]+/.test(s) ? `https://${s}` : s;
}
