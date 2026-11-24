import { describe, expect, it } from "vitest";
import { display } from "@/testing/fixtures";
import { displayContaining, guessArea, pickDisplay, resolveBounds } from "./geometry";

const laptop = display({ left: 0, width: 1512, isInternal: true, isPrimary: true });
const ext = display({ left: 1512, width: 2560, height: 1440 });
const ext2 = display({ left: -1920, width: 1920 });

describe("pickDisplay", () => {
  it("外部ディスプレイは本体以外を選ぶ", () => {
    expect(pickDisplay([laptop, ext], "external")).toBe(ext);
  });
  it("本体が無ければメインを使う", () => {
    expect(pickDisplay([ext], "internal")).toBe(ext);
  });
  it("左端・右端", () => {
    expect(pickDisplay([laptop, ext, ext2], "leftmost")).toBe(ext2);
    expect(pickDisplay([laptop, ext, ext2], "rightmost")).toBe(ext);
  });
});

describe("resolveBounds", () => {
  const wa = { left: 100, top: 25, width: 1000, height: 800 };
  it("右半分", () => {
    expect(resolveBounds(wa, { display: "primary", area: "right", tabs: [] })).toEqual({ left: 600, top: 25, width: 500, height: 800 });
  });
  it("カスタム（%）", () => {
    expect(resolveBounds(wa, { display: "primary", area: "custom", custom: { x: 10, y: 50, w: 30, h: 50 }, tabs: [] }))
      .toEqual({ left: 200, top: 425, width: 300, height: 400 });
  });
});

describe("guessArea", () => {
  const wa = { left: 0, top: 0, width: 1000, height: 1000 };
  it("最大化", () => expect(guessArea(wa, { left: 0, top: 0, width: 10, height: 10 }, true)).toEqual({ area: "max" }));
  it("左半分に近ければ left", () => expect(guessArea(wa, { left: 5, top: 0, width: 495, height: 990 }, false)).toEqual({ area: "left" }));
  it("どれにも近くなければ custom", () => {
    expect(guessArea(wa, { left: 100, top: 100, width: 400, height: 300 }, false))
      .toEqual({ area: "custom", custom: { x: 10, y: 10, w: 40, h: 30 } });
  });
});

describe("displayContaining", () => {
  it("中心が入っているディスプレイ", () => {
    expect(displayContaining([laptop, ext], { left: 2000, top: 100, width: 500, height: 500 })).toBe(ext);
  });
  it("どこにも入っていなければ一番近いディスプレイ", () => {
    expect(displayContaining([laptop, ext], { left: 5000, top: 100, width: 100, height: 100 })).toBe(ext);
  });
});
