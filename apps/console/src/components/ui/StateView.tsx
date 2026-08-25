import type { ReactNode } from "react";
import { RiLoader4Line as Loader2, RiErrorWarningLine as AlertTriangle, RiInboxLine as Inbox } from "@remixicon/react";
import { Button } from "@/components/ui/button";

type Props = {
  state: "loading" | "empty" | "error";
  title?: string;
  message?: string;
  onRetry?: () => void;
  action?: ReactNode;
};

/** Standardized loading / empty / error states (UC 103) + aria-live (UC 102). */
export function StateView({ state, title, message, onRetry, action }: Props) {
  if (state === "loading") {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-[var(--color-muted-foreground)]">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
        <span>{title || "Loading…"}</span>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div role="alert" aria-live="assertive" className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <AlertTriangle className="h-5 w-5 text-[var(--color-destructive)]" />
        <div className="text-sm font-medium">{title || "Something went wrong"}</div>
        {message && <div className="text-xs text-[var(--color-muted-foreground)] break-all max-w-md">{message}</div>}
        <div className="flex gap-2">
          {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
          {action}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Inbox className="h-5 w-5 text-[var(--color-muted-foreground)]" />
      <div className="text-sm font-medium">{title || "No data"}</div>
      {message && <div className="text-xs text-[var(--color-muted-foreground)] max-w-md">{message}</div>}
      {action}
    </div>
  );
}
