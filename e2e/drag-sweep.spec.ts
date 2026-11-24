// 少しずつ動かして、置き場所が逆向きに戻らないか（行ったり来たりしないか）を確かめる
import { center, drag, fmt, groupLabel, reversals, sweep, tabEl } from "./drag";
import { expect, savedOrder, state, test, win } from "./fixtures";

const G = { g: { title: "tst" } };

for (const strip of ["vertical", "horizontal"] as const) {
  const axis = strip === "vertical" ? "y" : "x";
  test.describe(`${strip === "vertical" ? "縦タブ" : "横タブ"}`, () => {
    test("グループ外のタブを、グループの上（グループ外）まで動かす", async ({ openOptions, sw }, info) => {
      const page = await openOptions(state([win("w-1", ["a@g", "b@g", "c@g", "x", "y"], G)]), { strip });
      const l = await center(groupLabel(page, "tst"));
      const to = axis === "y" ? { x: l.x, y: l.box.y + 3 } : { x: l.box.x + 3, y: l.y };
      const tr = await sweep(page, "y", to, { axis, shots: (i) => (i % 5 === 0 ? info.outputPath(`f${i}.png`) : null) });
      console.log(strip, "y→上", fmt(tr));
      expect(reversals(tr, -1), fmt(tr)).toBe(0);
      expect((await savedOrder(sw))[0]).toBe("y a@g b@g c@g x");
    });

    test("グループの中のタブを、グループの上（グループ外）まで動かす", async ({ openOptions, sw }, info) => {
      const page = await openOptions(state([win("w-1", ["a@g", "b@g", "c@g", "x"], G)]), { strip });
      const l = await center(groupLabel(page, "tst"));
      const to = axis === "y" ? { x: l.x, y: l.box.y + 3 } : { x: l.box.x + 3, y: l.y };
      const tr = await sweep(page, "c", to, { axis, shots: (i) => (i % 5 === 0 ? info.outputPath(`f${i}.png`) : null) });
      console.log(strip, "c→上", fmt(tr));
      expect(reversals(tr, -1), fmt(tr)).toBe(0);
      expect((await savedOrder(sw))[0]).toBe("c a@g b@g x");
    });

    test("グループの上のタブを、グループの最後の下まで動かす", async ({ openOptions, sw }, info) => {
      const page = await openOptions(state([win("w-1", ["x", "a@g", "b@g", "c@g", "y"], G)]), { strip });
      const target = await center(tabEl(page, "y"));
      const tr = await sweep(page, "x", target, { axis, shots: (i) => (i % 5 === 0 ? info.outputPath(`f${i}.png`) : null) });
      console.log(strip, "x→下", fmt(tr));
      expect(reversals(tr, 1), fmt(tr)).toBe(0);
      expect((await savedOrder(sw))[0]).toBe("a@g b@g c@g y x");
    });

    test("固定タブの欄へ出し入れする", async ({ openOptions, sw }, info) => {
      const page = await openOptions(state([win("w-1", ["p:p1", "p:p2", "a", "b"], {})]), { strip });
      const p1 = await center(tabEl(page, "p1"));
      const tr = await sweep(page, "b", p1, { axis, shots: (i) => (i % 5 === 0 ? info.outputPath(`f${i}.png`) : null) });
      console.log(strip, "b→固定", fmt(tr));
      expect((await savedOrder(sw))[0]).toMatch(/^p:\w+ p:\w+ p:\w+ a$/);
    });
  });
}

for (const strip of ["vertical", "horizontal"] as const) {
  test(`${strip === "vertical" ? "縦タブ" : "横タブ"}：上からラベルの後半に落とすと、グループの最初に入る`, async ({ openOptions, sw }) => {
    const page = await openOptions(state([win("w-1", ["x", "y", "a@g", "b@g"], G)]), { strip });
    const l = await center(groupLabel(page, "tst"));
    const to = strip === "vertical" ? { x: l.x, y: l.box.y + l.box.height - 4 } : { x: l.box.x + l.box.width - 4, y: l.y };
    const tr = await sweep(page, "x", to, { axis: strip === "vertical" ? "y" : "x", steps: 20 });
    console.log(strip, "x→ラベル後半", fmt(tr));
    expect(reversals(tr, 1), fmt(tr)).toBe(0);
    expect(tr.at(-1)!.label).toContain("tst");
    expect((await savedOrder(sw))[0]).toBe("y x@g a@g b@g");
  });
}

test("縦タブ：固定タブの無いウィンドウで、固定タブの欄に入ると固定、出ると解除（行ったり来たりしない）", async ({ openOptions, sw }) => {
  const page = await openOptions(state([win("w-1", ["a@g", "b@g", "x"], G)]), { strip: "vertical" });
  const zone = await center(page.getByTestId("pin-zone"));
  const from = await center(tabEl(page, "x"));
  const pinnedChip = () => page.locator("div.cursor-grabbing.size-9").count();
  await drag(page, from, { x: zone.x, y: zone.box.y + 6 }, { release: false });
  await page.waitForTimeout(400); // 欄に少しとどまると固定になる
  // 欄の中で少し動かしても固定のまま（固定タブの行が増えて下がずれても、欄が広がるので外れない）
  const inZone: number[] = [];
  for (let dy = 0; dy <= 30; dy += 6) {
    await page.mouse.move(zone.x, zone.box.y + 6 + dy);
    await page.waitForTimeout(150);
    inZone.push(await pinnedChip());
  }
  expect(inZone.every((n) => n === 1), inZone.join(",")).toBe(true);
  // 下の通常のタブまで動かすと解除され、そのまま戻らない
  const b = await center(tabEl(page, "b"));
  const out: number[] = [];
  for (let k = 1; k <= 5; k++) {
    await page.mouse.move(b.x, b.y + k * 2);
    await page.waitForTimeout(150);
    out.push(await pinnedChip());
  }
  expect(out.every((n) => n === 0), out.join(",")).toBe(true);
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect((await savedOrder(sw))[0]).not.toContain("p:");
});


for (const strip of ["vertical", "horizontal"] as const) {
  test(`${strip === "vertical" ? "縦タブ" : "横タブ"}：グループが一番下のとき、グループの下（グループ外）へ出せる`, async ({ openOptions, sw }) => {
    const page = await openOptions(state([win("w-1", ["p:pin", "a@g", "b@g"], G)]), { strip });
    const last = await center(tabEl(page, "b"));
    // 最後のタブより少し後ろ（縦は下、横は右）の空いている所
    const to = strip === "vertical" ? { x: last.x, y: last.box.y + last.box.height + 20 } : { x: last.box.x + last.box.width + 20, y: last.y };
    const tr = await sweep(page, "a", to, { axis: strip === "vertical" ? "y" : "x", steps: 15 });
    console.log(strip, "a→グループの下", fmt(tr));
    expect(tr.at(-1)!.label).toContain("グループ外");
    expect((await savedOrder(sw))[0]).toBe("p:pin b@g a");
  });
}
