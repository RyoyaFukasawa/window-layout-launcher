import { cn } from "@/shared/lib/utils";

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"];

/** セット名の頭文字を色付きの四角で表示（色は id から決まる） */
export function SetAvatar({ id, name, className }: { id: string; name: string; className?: string }) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const color = COLORS[h % COLORS.length];
  const initial = [...(name.trim() || "?")][0].toUpperCase();
  return (
    <span
      className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-sm font-semibold text-white", className)}
      style={{ background: color }}
    >
      {initial}
    </span>
  );
}
