import { describe, expect, it } from "vitest";
import { order, tabs, win } from "@/testing/fixtures";
import { beforeGroupDropId, dragOverTab, dropTab, groupDropId, parseTarget, pinnedDropId, previewDrop, resolveGroupJoin, tabsDropId } from "./dragTabs";

/**
 * ドラッグ中の onDragOver（何回呼ばれても同じ結果になる）→ onDragEnd の順に再現する。
 * 欄やウィンドウをまたいでその場で移したあとは、ポインタの下に自分（の置き場所）が来るので、
 * 実際の操作では最後のドロップ先が自分自身になることが多い
 */
function drag(ws: ReturnType<typeof win>[], active: string, ...overs: string[]) {
  for (const o of overs) dragOverTab(ws, active, o);
  dropTab(ws, active, overs[overs.length - 1]);
  return ws;
}

describe("parseTarget", () => {
  it("種類を見分ける", () => {
    expect(parseTarget("t-a")).toEqual({ kind: "tab", id: "t-a" });
    expect(parseTarget(pinnedDropId("w-1"))).toEqual({ kind: "pinned", windowId: "w-1" });
    expect(parseTarget(groupDropId("w-1", "g-2"))).toEqual({ kind: "group", windowId: "w-1", groupId: "g-2" });
    expect(parseTarget(tabsDropId("w-1"))).toEqual({ kind: "tabs", windowId: "w-1" });
    expect(parseTarget("w-1")).toEqual({ kind: "window", id: "w-1" });
  });
});

describe("固定タブ", () => {
  it("固定タブの欄へ落とすと、固定タブの最後に入って固定される", () => {
    const ws = [win("w", tabs("p:a", "p:b", "c", "d"))];
    drag(ws, "t-d", pinnedDropId("w"));
    expect(order(ws[0])).toBe("p:a p:b p:d c");
  });
  it("固定タブの上へ運んで、そこで離すと、その位置で固定される", () => {
    const ws = [win("w", tabs("p:a", "p:b", "c", "d"))];
    drag(ws, "t-d", "t-b", "t-d");
    expect(order(ws[0])).toBe("p:a p:d p:b c");
  });
  it("固定タブが無くても、欄へ落とせば固定できる", () => {
    const ws = [win("w", tabs("a", "b"))];
    drag(ws, "t-b", pinnedDropId("w"));
    expect(order(ws[0])).toBe("p:b a");
  });
  it("固定タブを通常のタブの上に落とすと固定が外れる", () => {
    const ws = [win("w", tabs("p:a", "p:b", "c", "d"))];
    drag(ws, "t-a", "t-d");
    expect(order(ws[0])).toBe("p:b c d a");
  });
  it("グループのタブを固定すると、グループから外れる", () => {
    const ws = [win("w", tabs("p:a", "b@g", "c@g"), ["g"])];
    drag(ws, "t-c", pinnedDropId("w"));
    expect(order(ws[0])).toBe("p:a p:c b@g");
  });
  it("欄の出入りを繰り返しても壊れない（onDragOver は何度も来る）", () => {
    const ws = [win("w", tabs("p:a", "b", "c"))];
    drag(ws, "t-c", pinnedDropId("w"), "t-b", pinnedDropId("w"), "t-a", "t-b", pinnedDropId("w"));
    expect(order(ws[0])).toBe("p:a p:c b");
    expect(ws[0].tabs).toHaveLength(3);
  });
  it("同じドロップ先で onDragOver が続いても、2回目からは何もしない", () => {
    const ws = [win("w", tabs("p:a", "b"))];
    expect(dragOverTab(ws, "t-b", pinnedDropId("w"))).toBe(true);
    expect(dragOverTab(ws, "t-b", pinnedDropId("w"))).toBe(false);
    expect(dragOverTab(ws, "t-b", "t-a")).toBe(false);
  });
});

describe("タブグループ", () => {
  it("グループのタブの上に落とすと、そのグループに入る（端のタブでも）", () => {
    const ws = [win("w", tabs("a@g", "b@g", "c", "d"), ["g"])];
    drag(ws, "t-d", "t-a");
    expect(order(ws[0])).toBe("d@g a@g b@g c");
  });
  it("グループの最後のタブの上に右から落としても入る", () => {
    const ws = [win("w", tabs("x", "a@g", "b@g", "c"), ["g"])];
    drag(ws, "t-x", "t-b");
    expect(order(ws[0])).toBe("a@g b@g x@g c");
  });
  it("グループの見出し（後半）へ落とすと、そのグループの最初に入る", () => {
    const ws = [win("w", tabs("a@g", "b@g", "c", "d"), ["g"])];
    drag(ws, "t-d", groupDropId("w", "g"));
    expect(order(ws[0])).toBe("d@g a@g b@g c");
  });
  it("固定タブをグループの見出しへ落とすと、固定が外れてグループに入る", () => {
    const ws = [win("w", tabs("p:a", "b@g", "c"), ["g"])];
    drag(ws, "t-a", groupDropId("w", "g"));
    expect(order(ws[0])).toBe("a@g b@g c");
  });
  it("グループ外のタブの上に落とすとグループから外れる", () => {
    const ws = [win("w", tabs("a@g", "b@g", "c", "d"), ["g"])];
    drag(ws, "t-a", "t-d");
    expect(order(ws[0])).toBe("b@g c d a");
  });
  it("最後のタブを出したグループは消える", () => {
    const ws = [win("w", tabs("a@g", "c"), ["g"])];
    drag(ws, "t-a", "t-c");
    expect(order(ws[0])).toBe("c a");
    expect(ws[0].groups).toBeUndefined();
  });
  it("自分の場所に落としたら、前後のタブのグループに合わせる", () => {
    const ws = [win("w", tabs("a@g", "x", "b@g"), ["g"])];
    drag(ws, "t-x", "t-x");
    expect(order(ws[0])).toBe("a@g x@g b@g");
  });
});

describe("別のウィンドウへ", () => {
  it("移したタブは元のグループから外れ、空になったウィンドウには空のタブが残る", () => {
    const ws = [win("w1", tabs("a@g"), ["g"]), win("w2", tabs("b", "c"))];
    drag(ws, "t-a", "t-c", "t-a");
    expect(order(ws[1])).toBe("b a c");
    expect(ws[0].tabs).toHaveLength(1);
    expect(ws[0].tabs[0].url).toBe("");
  });
  it("別ウィンドウのグループのタブの上に落とすと、そのグループに入る", () => {
    const ws = [win("w1", tabs("a", "z")), win("w2", tabs("b@g", "c@g"), ["g"])];
    drag(ws, "t-a", "t-c", "t-a");
    expect(order(ws[1])).toBe("b@g a@g c@g");
  });
  it("別ウィンドウの固定タブの欄へ落とすと固定される", () => {
    const ws = [win("w1", tabs("a", "z")), win("w2", tabs("p:b", "c"))];
    drag(ws, "t-a", pinnedDropId("w2"));
    expect(order(ws[1])).toBe("p:b p:a c");
  });
  it("ウィンドウの切り替えタブに重ねると、そのウィンドウの最後へ移る（固定・グループは外れる）", () => {
    const ws = [win("w1", tabs("p:a", "z")), win("w2", tabs("b@g"), ["g"])];
    expect(dragOverTab(ws, "t-a", "w2")).toBe(true);
    expect(order(ws[1])).toBe("b@g a");
    expect(order(ws[0])).toBe("z");
  });
  it("自分のウィンドウの切り替えタブに重ねても何もしない", () => {
    const ws = [win("w1", tabs("a", "z")), win("w2", tabs("b"))];
    expect(dragOverTab(ws, "t-a", "w1")).toBe(false);
  });
  it("切り替えタブの上で離すと、そのウィンドウの最後に入る", () => {
    const ws = [win("w1", tabs("a", "z")), win("w2", tabs("b"))];
    dropTab(ws, "t-a", "w2");
    expect(order(ws[1])).toBe("b a");
  });
  it("移ったあと、表示が切り替わってから置いた位置はそのまま", () => {
    const ws = [win("w1", tabs("a", "z")), win("w2", tabs("b", "c"))];
    dragOverTab(ws, "t-a", "w2");
    // 表示が切り替わったあと、b の上まで動かして離す
    drag(ws, "t-a", "t-b");
    expect(order(ws[1])).toBe("a b c");
  });
});

describe("同じウィンドウの中で、プレビューで見えていた位置に入る", () => {
  it("固定タブの上で離すと、そのタブと入れ替わる位置（arrayMove と同じ）で固定される", () => {
    const ws = [win("w", tabs("p:a", "p:b", "c", "d"))];
    drag(ws, "t-d", "t-b");
    expect(order(ws[0])).toBe("p:a p:b p:d c");
  });
});

describe("グループの見出しに重ねたとき（ドラッグ中）", () => {
  it("別ウィンドウの固定タブを重ねると、その場で固定が外れてグループの最初に入る", () => {
    const ws = [win("w1", tabs("p:a", "p:b")), win("w2", tabs("c@g", "d@g", "e"), ["g"])];
    expect(dragOverTab(ws, "t-b", groupDropId("w2", "g"))).toBe(true);
    expect(order(ws[1])).toBe("b@g c@g d@g e");
    // そのあと並びがずれて、自分の上で離しても、グループに入ったまま
    dropTab(ws, "t-b", "t-b");
    expect(order(ws[1])).toBe("b@g c@g d@g e");
    expect(order(ws[0])).toBe("p:a");
  });
  it("すでにグループの最初なら何もしない", () => {
    const ws = [win("w", tabs("c@g", "d@g"), ["g"])];
    expect(dragOverTab(ws, "t-c", groupDropId("w", "g"))).toBe(false);
  });
  it("グループの途中のタブを見出しに重ねると、その場でグループの最初へ動く（置き場所の表示が元の位置へ戻らない）", () => {
    const ws = [win("w", tabs("c@g", "d@g", "e@g", "x"), ["g"])];
    expect(dragOverTab(ws, "t-e", groupDropId("w", "g"))).toBe(true);
    expect(order(ws[0])).toBe("e@g c@g d@g x");
  });
  it("無いグループなら何もしない", () => {
    const ws = [win("w", tabs("c", "d"))];
    expect(dragOverTab(ws, "t-c", groupDropId("w", "zz"))).toBe(false);
  });
});

describe("previewDrop（ドラッグ中の表示）", () => {
  it("グループのタブの上ならそのグループ、元の状態は変えない", () => {
    const ws = [win("w", tabs("a@g", "b@g", "c"), ["g"])];
    const p = previewDrop(ws, "t-c", "t-a");
    expect(p).toMatchObject({ windowId: "w", pinned: false, windowHasGroups: true });
    expect(p?.group?.id).toBe("g");
    expect(order(ws[0])).toBe("a@g b@g c");
  });
  it("グループ外のタブの上ならグループなし", () => {
    const ws = [win("w", tabs("a@g", "b", "c"), ["g"])];
    expect(previewDrop(ws, "t-a", "t-c")?.group).toBeUndefined();
  });
  it("固定タブの欄なら固定", () => {
    const ws = [win("w", tabs("p:a", "b"))];
    expect(previewDrop(ws, "t-b", pinnedDropId("w"))).toMatchObject({ pinned: true, windowHasGroups: false });
  });
  it("グループの見出しならそのグループ", () => {
    const ws = [win("w1", tabs("x", "y")), win("w2", tabs("a@g"), ["g"])];
    dragOverTab(ws, "t-x", groupDropId("w2", "g"));
    expect(previewDrop(ws, "t-x", groupDropId("w2", "g"))).toMatchObject({ windowId: "w2", group: { id: "g" } });
  });
  it("ドロップ先が無いときは今の状態", () => {
    const ws = [win("w", tabs("a@g"), ["g"])];
    expect(previewDrop(ws, "t-a", null)?.group?.id).toBe("g");
  });
});

describe("グループの直前（見出しの前半）", () => {
  it("固定タブが無く、グループが一番上でも、グループの前（グループ外）に置ける", () => {
    const ws = [win("w", tabs("a@g", "b@g", "c", "d"), ["g"])];
    expect(dragOverTab(ws, "t-d", beforeGroupDropId("w", "g"))).toBe(true);
    expect(order(ws[0])).toBe("d a@g b@g c");
    dropTab(ws, "t-d", "t-d");
    expect(order(ws[0])).toBe("d a@g b@g c");
  });
  it("グループのタブを見出しの前半へ出すと、グループから外れて直前に入る", () => {
    const ws = [win("w", tabs("a@g", "b@g", "c"), ["g"])];
    drag(ws, "t-b", beforeGroupDropId("w", "g"));
    expect(order(ws[0])).toBe("b a@g c");
  });
  it("固定タブを見出しの前半へ落とすと、固定が外れてグループの直前に入る", () => {
    const ws = [win("w", tabs("p:a", "b@g", "c"), ["g"])];
    drag(ws, "t-a", beforeGroupDropId("w", "g"));
    expect(order(ws[0])).toBe("a b@g c");
  });
  it("別のウィンドウからも置ける", () => {
    const ws = [win("w1", tabs("x", "y")), win("w2", tabs("a@g", "b"), ["g"])];
    drag(ws, "t-x", beforeGroupDropId("w2", "g"));
    expect(order(ws[1])).toBe("x a@g b");
    expect(order(ws[0])).toBe("y");
  });
  it("すでに直前にあれば何もしない", () => {
    const ws = [win("w", tabs("d", "a@g"), ["g"])];
    expect(dragOverTab(ws, "t-d", beforeGroupDropId("w", "g"))).toBe(false);
  });
  it("表示は「グループ外」になる", () => {
    const ws = [win("w", tabs("a@g", "c"), ["g"])];
    dragOverTab(ws, "t-c", beforeGroupDropId("w", "g"));
    expect(previewDrop(ws, "t-c", beforeGroupDropId("w", "g"))).toMatchObject({ pinned: false, group: undefined, windowHasGroups: true });
  });
  it("id を見分ける", () => {
    expect(parseTarget(beforeGroupDropId("w-1", "g-2"))).toEqual({ kind: "beforeGroup", windowId: "w-1", groupId: "g-2" });
  });
});

describe("グループの最初のタブを、さらに上へドラッグしたとき", () => {
  // 下のタブ → グループの先頭のタブの上 → 見出しの後半 → 見出しの前半、と上へ動かす
  it("置き場所が「グループの最初」→「グループの直前（グループ外）」の順に動き、下へ戻らない", () => {
    const ws = [win("w", tabs("a@g", "b@g", "c@g", "x"), ["g"])];
    const steps: string[] = [];
    for (const over of ["t-c", "t-b", "t-a", groupDropId("w", "g"), beforeGroupDropId("w", "g")]) {
      dragOverTab(ws, "t-x", over);
      const p = previewDrop(ws, "t-x", over);
      steps.push(`${order(ws[0])} | ${p?.group ? "in" : "out"}`);
    }
    expect(steps).toEqual([
      // タブの上（並べ替えの見た目だけ。並びはまだ動かない）
      "a@g b@g c@g x | in",
      "a@g b@g c@g x | in",
      "a@g b@g c@g x | in",
      // 見出しの後半：グループの最初へ実際に動く
      "x@g a@g b@g c@g | in",
      // 見出しの前半：グループの直前（グループ外）へ
      "x a@g b@g c@g | out",
    ]);
    dropTab(ws, "t-x", "t-x");
    expect(order(ws[0])).toBe("x a@g b@g c@g");
  });
});

describe("resolveGroupJoin（見出しの後半 → グループの最初のタブ）", () => {
  it("グループの最初のタブの id に置き換える", () => {
    const ws = [win("w", tabs("x", "a@g", "b@g"), ["g"])];
    expect(resolveGroupJoin(ws, groupDropId("w", "g"))).toBe("t-a");
  });
  it("折りたたまれたグループは見出しのまま", () => {
    const ws = [win("w", tabs("a@g"), ["g"])];
    ws[0].groups![0].collapsed = true;
    expect(resolveGroupJoin(ws, groupDropId("w", "g"))).toBe(groupDropId("w", "g"));
  });
  it("グループ以外はそのまま", () => {
    const ws = [win("w", tabs("a@g"), ["g"])];
    expect(resolveGroupJoin(ws, "t-a")).toBe("t-a");
    expect(resolveGroupJoin(ws, beforeGroupDropId("w", "g"))).toBe(beforeGroupDropId("w", "g"));
  });
  it("下のタブを、グループの最初のタブ（＝見出しの後半）に落とすと、グループの最初に入る", () => {
    const ws = [win("w", tabs("a@g", "b@g", "x"), ["g"])];
    const over = resolveGroupJoin(ws, groupDropId("w", "g"));
    drag(ws, "t-x", over);
    expect(order(ws[0])).toBe("x@g a@g b@g");
  });
});

describe("グループより上から、見出しの後半へ来たとき", () => {
  it("最初のタブには置き換えない（見出しのまま）", () => {
    const ws = [win("w", tabs("x", "a@g", "b@g"), ["g"])];
    expect(resolveGroupJoin(ws, groupDropId("w", "g"), "t-x")).toBe(groupDropId("w", "g"));
  });
  it("下から来たときは最初のタブに置き換える", () => {
    const ws = [win("w", tabs("a@g", "b@g", "x"), ["g"])];
    expect(resolveGroupJoin(ws, groupDropId("w", "g"), "t-x")).toBe("t-a");
  });
  it("上から見出しの後半に落とすと、グループの最初に入る", () => {
    const ws = [win("w", tabs("x", "y", "a@g", "b@g"), ["g"])];
    const over = resolveGroupJoin(ws, groupDropId("w", "g"), "t-x");
    drag(ws, "t-x", over);
    expect(order(ws[0])).toBe("y x@g a@g b@g");
  });
});

describe("上から来て、グループの最初へ動いたあと", () => {
  it("見出しのままにする（最初のタブに置き換えると2番目へずれるため）", () => {
    const ws = [win("w", tabs("y", "x", "a@g"), ["g"])];
    dragOverTab(ws, "t-x", groupDropId("w", "g"));
    expect(order(ws[0])).toBe("y x@g a@g");
    expect(resolveGroupJoin(ws, groupDropId("w", "g"), "t-x")).toBe(groupDropId("w", "g"));
    expect(dragOverTab(ws, "t-x", groupDropId("w", "g"))).toBe(false);
  });
});

describe("別のウィンドウのグループのタブに重ねたとき（ドラッグ中）", () => {
  it("その場でそのグループに入る（見出しが押し出されない）", () => {
    const ws = [win("w1", tabs("p:p", "b")), win("w2", tabs("c@g", "d@g", "e"), ["g"])];
    dragOverTab(ws, "t-b", "t-c");
    expect(order(ws[1])).toBe("b@g c@g d@g e");
  });
  it("グループ外のタブに重ねたらグループなし", () => {
    const ws = [win("w1", tabs("b@g2", "z"), ["g2"]), win("w2", tabs("c@g", "e"), ["g"])];
    dragOverTab(ws, "t-b", "t-e");
    expect(order(ws[1])).toBe("c@g b e");
  });
});

describe("タブ列の空いている所（最後のタブより後ろ）", () => {
  it("グループが一番下でも、グループの下（グループ外）へ出せる", () => {
    const ws = [win("w", tabs("p:pin", "a@g", "b@g"), ["g"])];
    expect(dragOverTab(ws, "t-a", tabsDropId("w"))).toBe(true);
    expect(order(ws[0])).toBe("p:pin b@g a");
    expect(previewDrop(ws, "t-a", tabsDropId("w"))).toMatchObject({ group: undefined, pinned: false });
    dropTab(ws, "t-a", "t-a");
    expect(order(ws[0])).toBe("p:pin b@g a");
  });
  it("すでに最後尾でグループ外なら何もしない", () => {
    const ws = [win("w", tabs("a@g", "x"), ["g"])];
    expect(dragOverTab(ws, "t-x", tabsDropId("w"))).toBe(false);
  });
  it("固定タブも、最後尾へ出すと固定が外れる", () => {
    const ws = [win("w", tabs("p:pin", "a"))];
    drag(ws, "t-pin", tabsDropId("w"));
    expect(order(ws[0])).toBe("a pin");
  });
});
