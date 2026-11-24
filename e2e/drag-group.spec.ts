import { center, drag, groupLabel, overlayText, tabEl } from "./drag";
import { expect, savedOrder, state, test, win } from "./fixtures";

test.describe("タブグループへのドラッグ（縦タブ）", () => {
  test("グループのタブの上に落とすとグループに入る", async ({ openOptions, sw }) => {
    const page = await openOptions(state([win("w-1", ["a@g", "b@g", "c", "d"], { g: { title: "tst" } })]));
    const from = await center(tabEl(page, "d"));
    const to = await center(tabEl(page, "a"));
    await drag(page, from, to);
    expect((await savedOrder(sw))[0]).toBe("d@g a@g b@g c");
  });

  test("ラベルの上半分に落とすと、グループの直前（グループ外）に入る", async ({ openOptions, sw }) => {
    const page = await openOptions(state([win("w-1", ["a@g", "b@g", "c", "d"], { g: { title: "tst" } })]));
    const from = await center(tabEl(page, "d"));
    const l = await center(groupLabel(page, "tst"));
    await drag(page, from, { x: l.x, y: l.box.y + 4 });
    expect((await savedOrder(sw))[0]).toBe("d a@g b@g c");
  });

  test("下から上へ動かすと、置き場所は上へだけ動く（下へ戻らない）", async ({ openOptions }, testInfo) => {
    const page = await openOptions(state([win("w-1", ["a@g", "b@g", "c@g", "x", "y"], { g: { title: "tst" } })]));
    const from = await center(tabEl(page, "x"));
    const l = await center(groupLabel(page, "tst"));
    const ys: number[] = [];
    const labels: string[] = [];
    await drag(page, from, { x: from.x, y: l.box.y + 4 }, {
      steps: 30,
      release: false,
      onStep: async (i) => {
        await page.waitForTimeout(120); // 並べ替えのアニメーションが落ち着くのを待つ
        ys.push(Math.round((await tabEl(page, "x").boundingBox())!.y));
        labels.push((await overlayText(page)) ?? "");
        if (i % 3 === 0) await page.screenshot({ path: testInfo.outputPath(`up-${String(i).padStart(2, "0")}.png`), clip: { x: 0, y: 0, width: 1280, height: 1000 } });
      },
    });
    await page.mouse.up();
    await testInfo.attach("trace", { body: ys.map((y, i) => `${i + 1}: ${y} ${labels[i]}`).join("\n") });
    console.log(ys.map((y, i) => `${y}${labels[i].includes("tst") ? "+" : labels[i].includes("グループ外") ? "-" : ""}`).join(" "));
    for (let i = 1; i < ys.length; i++) expect(ys[i], `step ${i + 1}: ${ys.join(",")}`).toBeLessThanOrEqual(ys[i - 1] + 2);
  });
});
