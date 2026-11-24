export type DisplayKind = "external" | "internal" | "primary" | "secondary" | "leftmost" | "rightmost";
export type Area = "max" | "full" | "left" | "right" | "top" | "bottom" | "custom";
export type Mode = "docked" | "laptop";

/** 作業領域に対する % 指定 */
export interface Rect { x: number; y: number; w: number; h: number }
export interface Bounds { left: number; top: number; width: number; height: number }

export interface TabSpec {
  id?: string;
  url: string;
  pinned?: boolean;
  /** 表示用のタイトル（開くときには使わない） */
  title?: string;
  /** タイトルを手で編集したか（自動取得で上書きしない） */
  titleManual?: boolean;
  /** 所属するタブグループ（WindowSpec.groups の id） */
  group?: string;
}

/** Chrome のタブグループの色 */
export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";
export interface GroupSpec { id: string; title: string; color: GroupColor; collapsed?: boolean }

export interface WindowSpec { id?: string; display: DisplayKind; area: Area; custom?: Rect; tabs: TabSpec[]; groups?: GroupSpec[] }
export type Layouts = Record<Mode, WindowSpec[]>;

export type Display = chrome.system.display.DisplayUnitInfo;

/** 名前付きのレイアウトセット（ドック時・ノートPCのみの2つを持つ） */
export interface LayoutSet { id: string; name: string; layouts: Layouts }

/** 保存する状態全体 */
export interface AppState {
  version: 2;
  sets: LayoutSet[];
  /** Chrome の起動時に自動で開くセット（null なら開かない） */
  startupSetId: string | null;
}

export type Message = { type: "open-set"; setId: string; mode?: Mode };
