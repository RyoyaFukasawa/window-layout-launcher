import { createContext, useContext } from "react";
import type { DropPreview } from "./dragTabs";

/** ドラッグ中のタブを、いま離したらどこ（固定・グループ）に入るか */
export const DragPreviewContext = createContext<DropPreview | null>(null);
export const useDragPreview = () => useContext(DragPreviewContext);
