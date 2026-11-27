import type { Mode } from "@/entities/window";

export type Message = { type: "open-set"; setId: string; mode?: Mode };
