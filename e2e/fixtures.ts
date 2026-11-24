import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const DIST = path.resolve(import.meta.dirname, "../dist");

export interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  sw: Worker;
  /** 設定画面（指定した状態を保存してから開く） */
  openOptions: (state: unknown, opts?: { strip?: "horizontal" | "vertical" }) => Promise<Page>;
}

export const test = base.extend<Fixtures>({
  // 拡張機能の読み込みには、テスト用の Chromium（channel: "chromium"）が必要
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wll-e2e-"));
    const context = await chromium.launchPersistentContext(dir, {
      channel: "chromium",
      headless: !process.env.HEADED,
      viewport: { width: 1280, height: 1000 },
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
      // VIDEO=1 で操作を動画に残す（e2e/.results/videos）
      ...(process.env.VIDEO ? { recordVideo: { dir: path.resolve(import.meta.dirname, ".results/videos"), size: { width: 1280, height: 1000 } } } : {}),
    });
    await use(context);
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(sw);
  },
  extensionId: async ({ sw }, use) => {
    await use(new URL(sw.url()).host);
  },
  openOptions: async ({ context, extensionId, sw }, use) => {
    await use(async (state, opts = {}) => {
      // 初回インストールの処理（初期データの保存 → 設定画面を開く）が終わるのを待ってから、テストのデータを入れる
      await expect.poll(() => context.pages().some((p) => p.url().includes(extensionId)), { timeout: 10_000 }).toBe(true);
      for (const p of context.pages()) if (p.url().includes(extensionId)) await p.close();
      await sw.evaluate(async ({ state, strip }) => {
        await chrome.storage.local.clear();
        await chrome.storage.local.set({ appState: state, tabStripPref: strip ?? "vertical" });
      }, { state, strip: opts.strip });
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/options.html`);
      // ウィンドウの切り替えタブ（とその下のウィンドウの設定）が画面に入るようにスクロールしておく
      const tabs = page.getByRole("tablist", { name: "ウィンドウ" });
      await tabs.waitFor();
      await tabs.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(200);
      return page;
    });
  },
});

export { expect };

// ---------- データを短く書くための関数 ----------

export interface TabIn { name: string; pinned?: boolean; group?: string }

/** "p:a" は固定タブ a、"a@g" はグループ g のタブ a */
export function win(id: string, specs: string[], groups: Record<string, { title: string; collapsed?: boolean }> = {}) {
  return {
    id, display: "primary", area: "max",
    tabs: specs.map((s) => {
      const pinned = s.startsWith("p:");
      const [name, group] = s.replace(/^p:/, "").split("@");
      return { id: `t-${name}`, url: `https://${name}.example/`, title: name, pinned, ...(group ? { group } : {}) };
    }),
    groups: Object.entries(groups).map(([gid, g]) => ({ id: gid, title: g.title, color: "blue", ...(g.collapsed ? { collapsed: true } : {}) })),
  };
}

export function state(windows: ReturnType<typeof win>[]) {
  return { version: 2, startupSetId: "s-1", sets: [{ id: "s-1", name: "テスト", layouts: { docked: windows, laptop: windows } }] };
}

/** 保存されたタブの並びを "p:a b@g c" の形で返す（ウィンドウごと） */
export async function savedOrder(sw: Worker): Promise<string[]> {
  return sw.evaluate(async () => {
    const st = (await chrome.storage.local.get("appState")).appState as {
      sets: { layouts: Record<string, { tabs: { url: string; pinned?: boolean; group?: string }[]; groups?: { id: string }[] }[]> }[];
    };
    const displays = await chrome.system.display.getInfo();
    const mode = displays.length >= 2 ? "docked" : "laptop";
    return st.sets[0].layouts[mode].map((w) => w.tabs.map((t) => {
      const name = t.url.match(/\/\/(\w+)\./)?.[1] ?? "empty";
      return `${t.pinned ? "p:" : ""}${name}${t.group ? `@${t.group}` : ""}`;
    }).join(" "));
  });
}
