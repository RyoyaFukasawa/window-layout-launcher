import { describe, expect, it } from "vitest";
import { order, tabs, win } from "@/testing/fixtures";
import { adoptNeighborGroup, adoptNeighborPinned, nextGroupColor, normalizeGroups } from "./groups";

describe("normalizeGroups", () => {
  it("同じグループのタブを、最初のタブの位置にまとめる", () => {
    const w = win("w", tabs("a@g", "b", "c@g", "d"), ["g"]);
    normalizeGroups(w);
    expect(order(w)).toBe("a@g c@g b d");
  });
  it("固定タブを先頭に並べ、グループから外す", () => {
    const w = win("w", tabs("a", "p:b", "c@g"), ["g"]);
    w.tabs[1].group = "g";
    normalizeGroups(w);
    expect(order(w)).toBe("p:b a c@g");
  });
  it("存在しないグループへの参照を外し、タブが無いグループを消す", () => {
    const w = win("w", tabs("a@zz", "b"), ["g"]);
    normalizeGroups(w);
    expect(order(w)).toBe("a b");
    expect(w.groups).toBeUndefined();
  });
});

describe("adoptNeighborGroup", () => {
  it("グループのタブの間に入れたら、そのグループに入る", () => {
    const w = win("w", tabs("a@g", "x", "b@g"), ["g"]);
    adoptNeighborGroup(w, "t-x");
    expect(order(w)).toBe("a@g x@g b@g");
  });
  it("グループの外に出したら外れる", () => {
    const w = win("w", tabs("x@g", "a", "b@g"), ["g"]);
    adoptNeighborGroup(w, "t-x");
    expect(order(w)).toBe("x a b@g");
  });
  it("グループの端なら今のまま", () => {
    const w = win("w", tabs("a@g", "x@g", "b"), ["g"]);
    adoptNeighborGroup(w, "t-x");
    expect(order(w)).toBe("a@g x@g b");
  });
});

describe("adoptNeighborPinned", () => {
  it("固定タブの間に入れたら固定になる", () => {
    const w = win("w", tabs("p:a", "x", "p:b", "c"));
    adoptNeighborPinned(w, "t-x");
    expect(order(w)).toBe("p:a p:x p:b c");
  });
  it("先頭（固定タブの前）に入れたら固定になる", () => {
    const w = win("w", tabs("x", "p:a", "b"));
    adoptNeighborPinned(w, "t-x");
    expect(order(w)).toBe("p:x p:a b");
  });
  it("通常のタブの後ろに入れたら固定が外れる", () => {
    const w = win("w", tabs("p:a", "b", "p:x"));
    adoptNeighborPinned(w, "t-x");
    expect(order(w)).toBe("p:a b x");
  });
  it("固定と通常の境目なら今のまま", () => {
    const w = win("w", tabs("p:a", "p:x", "b"));
    adoptNeighborPinned(w, "t-x");
    expect(order(w)).toBe("p:a p:x b");
  });
});

describe("nextGroupColor", () => {
  it("そのウィンドウでまだ使っていない色（グレー以外）を選ぶ", () => {
    const w = win("w", tabs("a"), ["g"]);
    expect(nextGroupColor(w)).toBe("red");
  });
});
