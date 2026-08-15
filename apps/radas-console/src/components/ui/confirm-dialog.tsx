import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RiErrorWarningLine as AlertTriangle } from "@remixicon/react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  busy?: boolean;
  busyLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open, title, description, children, initialFocusRef, confirmLabel = "Confirm", cancelLabel = "Cancel",
  variant = "default", busy, busyLabel = "Working…", confirmDisabled, onConfirm, onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const hiddenSiblings = Array.from(document.body.children).filter((element) => element !== overlayRef.current);
    const priorAriaHidden = hiddenSiblings.map((element) => [element, element.getAttribute("aria-hidden")] as const);
    hiddenSiblings.forEach((element) => element.setAttribute("aria-hidden", "true"));

    const focusInitial = () => {
      const initial = initialFocusRef?.current
        ?? dialogRef.current?.querySelector<HTMLElement>("[data-dialog-initial-focus]")
        ?? dialogRef.current?.querySelector<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
      initial?.focus();
    };
    const frame = window.requestAnimationFrame(focusInitial);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      priorAriaHidden.forEach(([element, value]) => value === null ? element.removeAttribute("aria-hidden") : element.setAttribute("aria-hidden", value));
      previousFocusRef.current?.focus();
    };
  }, [open, busy, onCancel, initialFocusRef]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={overlayRef}
      data-variant={variant}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in"
      onMouseDown={() => !busy && onCancel()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
        className="bg-[var(--color-card)] rounded-md shadow-[var(--shadow-popover)] w-full max-w-md border border-[var(--color-border)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="p-5 flex gap-3">
          <div className="h-10 w-10 rounded-full bg-[var(--color-muted)] flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-[var(--color-foreground)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-[var(--color-foreground)]">{title}</h2>
            {description && <div className="mt-1 text-sm text-[var(--color-muted-foreground)]">{description}</div>}
            {children && <div className="mt-3">{children}</div>}
          </div>
        </div>
        <div className="p-4 border-t border-[var(--color-border)] flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button data-dialog-initial-focus variant={variant === "destructive" ? "destructive" : "default"} onClick={onConfirm} disabled={busy || confirmDisabled}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
