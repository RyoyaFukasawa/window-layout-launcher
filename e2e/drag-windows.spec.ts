// ウィンドウの切り替えタブと、別のウィンドウへのドラッグ
import type { Page } from "@playwright/test";
import { center, groupLabel, tabEl } from "./drag";
import { expect, savedOrder, state, test, win } from "./fixtures";

const windowTab = (page: Page, n: number) => page.getByRole("tab", { name: new RegExp(`ウィンドウ ${n}`) });

/** 押して、目標（関数で毎回の位置を返す）へ少しずつ近づける。人と同じく、ずれたら追いかける */
async function chase(page: Page, from: { x: number; y: number }, target: () => Promise<{ x: number; y: number }>, { steps = 25, release = true } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 6, { steps: 2 });
  let x = from.x, y = from.y - 6;
  for (let i = 0; i < steps; i++) {
    const t = await target();
    x += (t.x - x) * 0.3; y += (t.y - y) * 0.3;
    await page.mouse.move(x, y);
    await page.waitForTimeout(50);
  }
  if (release) { await page.waitForTimeout(300); await page.mouse.up(); await page.waitForTimeout(400); }
}

test("ウィンドウはタブで切り替わり、表示されるのは選んだウィンドウだけ", async ({ openOptions }) => {
  const page = await openOptions(state([win("w-1", ["a"]), win("w-2", ["b"])]));
  await expect(windowTab(page, 1)).toHaveAttribute("aria-selected", "true");
  await expect(tabEl(page, "a")).toBeVisible();
  await expect(tabEl(page, "b")).toHaveCount(0);
  await windowTab(page, 2).click();
  await expect(windowTab(page, 2)).toHaveAttribute("aria-selected", "true");
  await expect(tabEl(page, "b")).toBeVisible();
  await expect(tabEl(page, "a")).toHaveCount(0);
});

test("切り替えタブをドラッグすると、ウィンドウの順番が入れ替わる", async ({ openOptions, sw }) => {
  const page = await openOptions(state([win("w-1", ["a"]), win("w-2", ["b"])]));
  const t1 = await center(windowTab(page, 1)), t2 = await center(windowTab(page, 2));
  await chase(page, t1, async () => ({ x: t2.x + 40, y: t2.y }));
  expect(await savedOrder(sw)).toEqual(["b", "a"]);
});

for (const strip of ["vertical", "horizontal"] as const) {
  test.describe(strip === "vertical" ? "縦タブ" : "横タブ", () => {
    test("タブを別のウィンドウの切り替えタブに重ねて離すと、そのウィンドウの最後に入る", async ({ openOptions, sw }) => {
      const page = await openOptions(state([win("w-1", ["p:p1", "a", "b"]), win("w-2", ["c@g", "d"], { g: { title: "tst" } })]), { strip });
      await chase(page, await center(tabEl(page, "a")), () => center(windowTab(page, 2)), { steps: 12 });
      const [w1, w2] = await savedOrder(sw);
      expect(w1).toBe("p:p1 b");
      expect(w2).toBe("c@g d a");
    });

    test("切り替えタブに少し重ねると表示が切り替わり、続けてグループのラベル（後半）に置ける", async ({ openOptions, sw }) => {
      const page = await openOptions(state([win("w-1", ["p:p1", "a", "b"]), win("w-2", ["c@g", "d@g", "e"], { g: { title: "tst" } })]), { strip });
      const from = await center(tabEl(page, "b"));
      const tab2 = await center(windowTab(page, 2));
      // 切り替えタブまで運んで、少し待つ
      await chase(page, from, async () => tab2, { steps: 12, release: false });
      await page.waitForTimeout(700);
      await expect(windowTab(page, 2)).toHaveAttribute("aria-selected", "true");
      // 続けて、ウィンドウ 2 のグループのラベル（後半）へ
      const label = groupLabel(page, "tst");
      let x = tab2.x, y = tab2.y;
      for (let i = 0; i < 25; i++) {
        const l = await center(label);
        const tx = strip === "vertical" ? l.x : l.box.x + l.box.width - 4;
        const ty = strip === "vertical" ? l.box.y + l.box.height - 4 : l.y;
        x += (tx - x) * 0.3; y += (ty - y) * 0.3;
        await page.mouse.move(x, y);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(300);
      await page.mouse.up();
      await page.waitForTimeout(400);
      const [w1, w2] = await savedOrder(sw);
      expect(w1).toBe("p:p1 a");
      expect(w2).toBe("b@g c@g d@g e");
    });
  });
}
