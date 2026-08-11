import { type HTMLAttributes, type ReactNode } from "react";
import { RiCheckLine as Check, RiCloseLine as X } from "@remixicon/react";
import { cn } from "@/lib/utils";

const styles = {
  default: "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-stone)]",
  primary: "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] font-semibold",
  success: "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]",
  warning: "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]",
  destructive: "border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] font-semibold",
} as const;

const glyphs: Record<string, ReactNode> = {
  success: <Check className="h-3 w-3 shrink-0 text-[var(--color-success)]" />,
  warning: <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warning)]" />,
  destructive: <X className="h-3 w-3 shrink-0" />,
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.071em]", styles[variant], className)}
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
