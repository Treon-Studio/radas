import { type HTMLAttributes, type ReactNode } from "react";
import { RiCheckLine as Check, RiCloseLine as X } from "@remixicon/react";
import { cn } from "@/lib/utils";

/**
 * PixelBadge - Cloned from Pxlkit UI Kit (https://pxlkit.xyz/ui-kit)
 * Retro pixel-art status tags with sharp pixel corners and high-contrast indicators.
 */
const styles = {
  default: "border-2 border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-muted-foreground)]",
  primary: "border-2 border-[var(--color-foreground)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-bold",
  success: "border-2 border-[#1a7f4c] bg-[#00E599]/15 text-[#00E599] dark:text-[#33f5b0] font-bold",
  warning: "border-2 border-[#b89500] bg-[#FFD700]/15 text-[#d4af37] dark:text-[#FFD700] font-bold",
  destructive: "border-2 border-red-600 bg-red-600/15 text-red-600 dark:text-red-400 font-bold",
  cyan: "border-2 border-[#20968e] bg-[#4ECDC4]/15 text-[#4ECDC4] font-bold",
} as const;

const glyphs: Record<string, ReactNode> = {
  success: <Check className="h-3 w-3 shrink-0 text-[#00E599]" />,
  warning: <span className="h-1.5 w-1.5 shrink-0 bg-[#FFD700] pxl-corner-sm" />,
  destructive: <X className="h-3 w-3 shrink-0 text-red-500" />,
  cyan: <span className="h-1.5 w-1.5 shrink-0 bg-[#4ECDC4] pxl-corner-sm" />,
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider pxl-corner-sm select-none pxl-shadow",
        styles[variant],
        className
      )}
      {...props}
    >
      {glyphs[variant]}
      {props.children}
    </span>
  );
}

export function statusToVariant(status?: string): keyof typeof styles {
  switch ((status || "").toLowerCase()) {
    case "succeeded":
    case "success":
    case "ok":
      return "success";
    case "failed":
    case "error":
      return "destructive";
    case "running":
    case "queued":
    case "pending":
      return "warning";
    default:
      return "default";
  }
}

export default Badge;
