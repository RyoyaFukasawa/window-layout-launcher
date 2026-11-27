import { describe, expect, it } from "vitest";
import { fallbackTitle, normalizeInput } from "@/shared/lib/url";

describe("normalizeInput", () => {
  it("ドメインだけなら https:// を補う", () => {
    expect(normalizeInput(" github.com/notifications ")).toBe("https://github.com/notifications");
  });
  it("スキームがあればそのまま", () => {
    expect(normalizeInput("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeInput("chrome://settings")).toBe("chrome://settings");
  });
  it("ドメインらしくなければそのまま", () => {
    expect(normalizeInput("memo")).toBe("memo");
    expect(normalizeInput("")).toBe("");
  });
});

describe("fallbackTitle", () => {
  it("ドメイン＋パス（www. は外す）", () => {
    expect(fallbackTitle("https://www.example.com/a/b?x=1")).toBe("example.com/a/b");
    expect(fallbackTitle("https://example.com/")).toBe("example.com");
  });
  it("URL でなければそのまま", () => expect(fallbackTitle("not a url")).toBe("not a url"));
});
