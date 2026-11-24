import type { Layouts } from "@/entities/window/@x/layout-set";

/** 名前付きのレイアウトセット（ドック時・ノートPCのみの2つを持つ） */
export interface LayoutSet { id: string; name: string; layouts: Layouts }

/** 保存する状態全体 */
export interface AppState {
  version: 2;
  sets: LayoutSet[];
  /** Chrome の起動時に自動で開くセット（null なら開かない） */
  startupSetId: string | null;
}
