// セットを開くと、実際の Chrome にウィンドウ・固定タブ・タブグループができるか
import { expect, state, test, win } from "./fixtures";

function offline<T extends ReturnType<typeof state>>(s: T): T {
  for (const set of s.sets) for (const w of set.layouts.docked) for (const t of w.tabs) t.url = `data:text/plain,${t.title}`;
  return s;
}

test("セットを開くと、固定タブとタブグループ（名前・色・折りたたみ）が再現される", async ({ openOptions, sw }) => {
  // ネットにつながらなくても開けるように、data: の URL にする
  const s = offline(state([
    win("w-1", ["p:pin", "a@g1", "b@g1", "c", "d@g2"], { g1: { title: "開発" }, g2: { title: "資料", collapsed: true } }),
    win("w-2", ["e"]),
  ]));
  s.sets[0].layouts.docked[0].groups![1].color = "red";
  s.sets[0].layouts.laptop = s.sets[0].layouts.docked;
  const page = await openOptions(s);
  const before = await sw.evaluate(async () => (await chrome.windows.getAll()).map((w) => w.id));

  await page.evaluate(() => chrome.runtime.sendMessage({ type: "open-set", setId: "s-1" }));

  // 新しいウィンドウが 2 つでき、タブが揃うまで待つ
  await expect.poll(async () => sw.evaluate(async (before) => {
    const wins = (await chrome.windows.getAll({ populate: true })).filter((w) => !before.includes(w.id));
    return wins.map((w) => w.tabs?.length ?? 0).sort().join(",");
  }, before), { timeout: 15_000 }).toBe("1,5");

  const result = await sw.evaluate(async (before) => {
    const wins = (await chrome.windows.getAll({ populate: true })).filter((w) => !before.includes(w.id));
    const big = wins.find((w) => (w.tabs?.length ?? 0) === 5)!;
    const groups = await chrome.tabGroups.query({ windowId: big.id });
    const byId = new Map(groups.map((g) => [g.id, g]));
    return big.tabs!.map((t) => {
      const name = decodeURIComponent((t.pendingUrl || t.url || "").replace(/^data:text\/plain,/, ""));
      const g = t.groupId >= 0 ? byId.get(t.groupId) : undefined;
      return `${t.pinned ? "p:" : ""}${name}${g ? `@${g.title}/${g.color}${g.collapsed ? "/閉" : ""}` : ""}`;
    }).join(" ");
  }, before);
  expect(result).toBe("p:pin a@開発/blue b@開発/blue c d@資料/red/閉");
});
