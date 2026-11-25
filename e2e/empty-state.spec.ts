// データが無いとき（入れたばかり）は、サンプルのデータを入れずに空で始まる
import { expect, test } from "./fixtures";

test("入れたばかりのときはセットが空で、設定画面とポップアップに「ありません」と出る", async ({ context, extensionId, sw }) => {
  // 初回インストールで開く設定画面を待つ
  await expect.poll(() => context.pages().some((p) => p.url().includes(extensionId)), { timeout: 10_000 }).toBe(true);
  const options = context.pages().find((p) => p.url().includes(extensionId))!;
  await expect(options.getByText("レイアウトセットがありません")).toBeVisible();

  const saved = await sw.evaluate(async () => (await chrome.storage.local.get("appState")).appState);
  expect(saved).toEqual({ version: 2, sets: [], startupSetId: null });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByText("セットがありません")).toBeVisible();

  // 「空のセットを作る」でセットが 1 つでき、編集できる
  await options.getByRole("button", { name: "空のセットを作る" }).click();
  await expect(options.getByRole("tablist", { name: "ウィンドウ" })).toHaveCount(0);
  await expect(options.getByText("ウィンドウがありません")).toBeVisible();
  await expect.poll(async () => sw.evaluate(async () => ((await chrome.storage.local.get("appState")).appState as { sets: unknown[] }).sets.length)).toBe(1);
});
