// ノートPCのみのときは、どのウィンドウも本体の画面に開くので、ディスプレイの表示を出さない
import { expect, state, test, win } from "./fixtures";

test("ノートPCのみではディスプレイの選択・表示が無く、ドック時では出る", async ({ openOptions }) => {
  const page = await openOptions(state([win("w-1", ["a"]), win("w-2", ["b"])]));
  const editor = page.getByRole("tablist", { name: "ウィンドウ" }).locator("..");

  // テストの Chromium はディスプレイが 1 枚なので「ノートPCのみ」で開く
  await page.getByRole("tab", { name: "ノートPCのみ" }).click();
  await expect(editor.getByText("ディスプレイ", { exact: true })).toHaveCount(0);
  await expect(editor.getByText("位置・サイズ", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /ウィンドウ 1/ })).not.toContainText("メイン");

  await page.getByRole("tab", { name: "ドック時" }).click();
  await expect(editor.getByText("ディスプレイ", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /ウィンドウ 1/ })).toContainText("メイン");
});
