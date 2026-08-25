import { type ReactNode, type RefObject, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { RiErrorWarningLine as AlertTriangle } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { acquireModalIsolation } from "@/components/ui/modal-stack";

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
  const titleId = `confirm-dialog-title-${useId()}`;
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  const initialFocusRefRef = useRef(initialFocusRef);

  useEffect(() => {
    onCancelRef.current = onCancel;
    busyRef.current = busy;
    initialFocusRefRef.current = initialFocusRef;
  }, [busy, initialFocusRef, onCancel]);

  useEffect(() => {
    if (!open || typeof document === "undefined" || !overlayRef.current) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseIsolation = acquireModalIsolation(overlayRef.current);
    const focusInitial = () => {
      const initial = initialFocusRefRef.current?.current
        ?? dialogRef.current?.querySelector<HTMLElement>("[data-dialog-initial-focus]")
        ?? dialogRef.current?.querySelector<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
      initial?.focus();
    };
    const frame = window.requestAnimationFrame(focusInitial);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
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
      } else if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      releaseIsolation();
      previousFocusRef.current?.focus();
    };
  }, [open]);

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
            aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-[var(--color-card)] pxl-corner-md pxl-card-shadow w-full max-w-md border-2 border-[var(--color-border)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="p-5 flex gap-3">
          <div className="h-10 w-10 rounded-full bg-[var(--color-muted)] flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-[var(--color-foreground)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-[var(--color-foreground)]">{title}</h2>
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
