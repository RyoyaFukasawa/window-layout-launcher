import { useState } from "react";
import { cn } from "@/lib/utils";
import { faviconUrl } from "./logic";

export function Favicon({ url, className }: { url: string; className?: string }) {
  const src = faviconUrl(url);
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className={cn("inline-block rounded-sm bg-muted-foreground/25", className)} />;
  return <img src={src} alt="" className={cn("rounded-sm", className)} onError={() => setBroken(true)} />;
}
