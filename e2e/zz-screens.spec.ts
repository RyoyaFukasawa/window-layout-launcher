// 見た目の確認用スクリーンショット（e2e/screens に保存。テストとしての判定はしない）
import { state, test, win } from "./fixtures";

for (const strip of ["vertical", "horizontal"] as const) {
  test(`スクリーンショット：${strip}`, async ({ openOptions }) => {
    const page = await openOptions(state([
      win("w-1", ["p:gh", "p:gm", "p:gpt", "a@g", "b@g", "c", "d"], { g: { title: "開発" } }),
      win("w-2", ["e", "f@g2"], { g2: { title: "資料" } }),
    ]), { strip });
    const area = page.getByRole("tablist", { name: "ウィンドウ" }).locator("..");
    await area.screenshot({ path: `e2e/screens/${strip}.png` });
  });
}
