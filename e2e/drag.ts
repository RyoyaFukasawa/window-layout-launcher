import type { Locator, Page } from "@playwright/test";

/** 設定画面のタブ（タブ列の中の要素）。固定タブも含む */
export const tabEl = (page: Page, name: string): Locator =>
  page.locator(`[data-slot=card] div[title*="https://${name}.example/"]`).first();

/** グループの見出し（ラベル）。ドロップ先の範囲は親要素 */
export const groupLabel = (page: Page, title: string): Locator =>
  page.locator("[data-slot=card] button").filter({ hasText: title }).first().locator("..");

export async function center(l: Locator) {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

/** 押して、少しずつ動かして（各ステップで onStep を呼ぶ）、離す */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  { steps = 20, onStep, release = true }: { steps?: number; onStep?: (i: number) => Promise<void>; release?: boolean } = {},
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // dnd-kit は 4px 動かすとドラッグ開始
  await page.mouse.move(from.x, from.y - 6, { steps: 2 });
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y - 6 + ((to.y - from.y + 6) * i) / steps);
    await page.waitForTimeout(40);
    if (onStep) await onStep(i);
  }
  if (release) {
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
}

/** ドラッグ中のチップ（カーソルに付いてくる表示）の文字 */
export const overlayText = (page: Page) =>
  page.locator("div.cursor-grabbing.w-60, div.cursor-grabbing.size-9").first().textContent({ timeout: 300 }).catch(() => null);

/**
 * ドラッグしながら、各ステップでドラッグ中のタブ（置き場所）の位置とチップの文字を記録する。
 * axis は置き場所の動きを見る向き（縦タブは y、横タブは x）
 */
export async function sweep(
  page: Page,
  name: string,
  to: { x: number; y: number },
  { axis, steps = 30, shots, release = true }: { axis: "x" | "y"; steps?: number; shots?: (i: number) => string | null; release?: boolean },
) {
  const from = await center(tabEl(page, name));
  const trace: { pos: number; label: string }[] = [];
  await drag(page, from, to, {
    steps,
    release,
    onStep: async (i) => {
      await page.waitForTimeout(120);
      const b = (await tabEl(page, name).boundingBox())!;
      const label = (await overlayText(page))?.replace(name, "") ?? "";
      trace.push({ pos: Math.round(axis === "x" ? b.x : b.y), label });
      const file = shots?.(i);
      if (file) await page.screenshot({ path: file });
    },
  });
  return trace;
}

/** 置き場所が逆向きに戻った回数（2px 以下の揺れは無視） */
export function reversals(trace: { pos: number }[], dir: 1 | -1) {
  let n = 0;
  for (let i = 1; i < trace.length; i++) if ((trace[i].pos - trace[i - 1].pos) * dir < -2) n++;
  return n;
}

export const fmt = (trace: { pos: number; label: string }[]) =>
  trace.map((t) => `${t.pos}${t.label.includes("グループ外") ? "-" : t.label ? `[${t.label}]` : ""}`).join(" ");
