import { describe, expect, it } from "vitest";
import { display } from "@/testing/fixtures";
import { displayKind, fitInto } from "./display";

describe("fitInto", () => {
  it("作業領域からはみ出さないように収める", () => {
    const wa = { left: 0, top: 0, width: 1000, height: 800 };
    expect(fitInto(wa, { left: 900, top: -50, width: 300, height: 1000 })).toEqual({ left: 700, top: 0, width: 300, height: 800 });
  });
});

describe("displayKind", () => {
  const laptop = display({ left: 0, width: 1512, isInternal: true, isPrimary: true });
  const ext = display({ left: 1512, width: 2560 });
  it("本体と外部1枚なら internal / external", () => {
    expect(displayKind(laptop, [laptop, ext], "docked")).toBe("internal");
    expect(displayKind(ext, [laptop, ext], "docked")).toBe("external");
  });
  it("ノートPCのみのモードでは常に primary", () => {
    expect(displayKind(ext, [laptop, ext], "laptop")).toBe("primary");
  });
});
