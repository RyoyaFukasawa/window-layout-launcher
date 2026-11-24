// テスト用のデータを短く書くための関数
import type { Display, GroupSpec, TabSpec, WindowSpec } from "@/entities/window";

/** "p:a" は固定タブ a、"a@g1" はグループ g1 のタブ a */
export function tabs(...specs: string[]): TabSpec[] {
  return specs.map((s) => {
    const pinned = s.startsWith("p:");
    const [name, group] = s.replace(/^p:/, "").split("@");
    return { id: `t-${name}`, url: `https://${name}.example/`, pinned, ...(group ? { group } : {}) };
  });
}

export function win(id: string, tabList: TabSpec[], groups: string[] = []): WindowSpec {
  const gs: GroupSpec[] = groups.map((g) => ({ id: g, title: g, color: "blue" }));
  return { id, display: "primary", area: "max", tabs: tabList, ...(gs.length ? { groups: gs } : {}) };
}

/** タブの並びを "p:a b@g1 c" の形で返す */
export const order = (w: WindowSpec) =>
  w.tabs.map((t) => `${t.pinned ? "p:" : ""}${t.id!.replace(/^t-/, "")}${t.group ? `@${t.group}` : ""}`).join(" ");

export function display(p: Partial<Display> & { left: number; width: number; height?: number }): Display {
  const h = p.height ?? 1000;
  return {
    id: String(p.left), name: "", isPrimary: false, isInternal: false, isEnabled: true,
    bounds: { left: p.left, top: 0, width: p.width, height: h },
    workArea: { left: p.left, top: 25, width: p.width, height: h - 25 },
    ...p,
  } as Display;
}
