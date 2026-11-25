import { describe, expect, it } from "vitest";
import { tabs, win } from "@/testing/fixtures";
import { defaultState, layoutFor, newSet, parseImported, setStats } from "./store";

describe("layoutFor", () => {
  it("そのモードが空なら、もう一方のレイアウトを使う", () => {
    const set = newSet("s", { docked: [win("w", tabs("a"))], laptop: [] });
    expect(layoutFor(set, "laptop")).toBe(set.layouts.docked);
  });
});

describe("setStats", () => {
  it("URL のあるタブだけ数える", () => {
    const set = newSet("s", { docked: [win("w", [...tabs("a", "b"), { url: "" }])], laptop: [] });
    expect(setStats(set, "docked")).toMatchObject({ windows: 1, tabs: 2 });
  });
});

describe("parseImported", () => {
  it("今の形式は全体として読み込む（★のセットが無ければ外す）", () => {
    const set = newSet("s");
    const r = parseImported({ version: 2, sets: [set], startupSetId: "nope" });
    expect(r.kind).toBe("state");
    if (r.kind === "state") expect(r.state.startupSetId).toBeNull();
  });
  it("以前の形式（layouts だけ）は新しいセットにする", () => {
    const r = parseImported({ layouts: { docked: [win("w", tabs("a"))], laptop: [] } });
    expect(r.kind).toBe("set");
    if (r.kind === "set") expect(r.set.layouts.docked[0].tabs[0].id).toBeTruthy();
  });
  it("違う形式はエラー", () => {
    expect(() => parseImported({ foo: 1 })).toThrow();
  });
});

describe("データが無いとき", () => {
  it("初期の状態はセットなし（サンプルのデータは入れない）", () => {
    expect(defaultState()).toEqual({ version: 2, sets: [], startupSetId: null });
  });
  it("セットが空の保存データを読み込んでも、空のまま（サンプルで埋めない）", () => {
    const r = parseImported({ version: 2, sets: [], startupSetId: null });
    expect(r).toEqual({ kind: "state", state: { version: 2, sets: [], startupSetId: null } });
  });
});
