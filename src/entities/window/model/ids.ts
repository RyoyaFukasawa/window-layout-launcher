import { newId } from "@/shared/lib/id";
import type { Layouts } from "./types";

/** 並べ替え用の id を補う（開くときには使わない） */
export function ensureIds(l: Layouts): Layouts {
  for (const mode of ["docked", "laptop"] as const) {
    l[mode] ??= [];
    for (const w of l[mode]) {
      w.id ??= newId("w");
      for (const t of w.tabs) t.id ??= newId("t");
    }
  }
  return l;
}
