import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("font-mono text-[11px] uppercase tracking-[0.071em] text-[var(--color-foreground)]", className)}
      {...props}
    />
  );
}
