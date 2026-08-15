import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { RiCloseLine as X } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { acquireModalIsolation } from "@/components/ui/modal-stack";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
  ariaLabel?: string;
};

const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Right-anchored, modal slide-over panel with focus management. */
export function Drawer({ open, onClose, title, children, footer, widthClass = "max-w-md", ariaLabel }: DrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined" || !overlayRef.current) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const releaseIsolation = acquireModalIsolation(overlayRef.current);
    const focusFirst = () => {
      const target = drawerRef.current?.querySelector<HTMLElement>(focusableSelector) ?? drawerRef.current;
      target?.focus();
    };
    const frame = window.requestAnimationFrame(focusFirst);
    const hasExternalModal = () => Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true']"))
      .some((dialog) => dialog !== drawerRef.current && !drawerRef.current?.contains(dialog));
    const onKeyDown = (event: KeyboardEvent) => {
      if (hasExternalModal()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) {
        event.preventDefault();
        drawerRef.current.focus();
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
      } else if (!drawerRef.current.contains(document.activeElement)) {
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
    <div ref={overlayRef} className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onMouseDown={onClose} aria-hidden="true" />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 w-full flex flex-col bg-[var(--color-card)] border-l border-[var(--color-border)] shadow-[var(--shadow-popover)]",
          widthClass,
        )}
      >
        <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-muted)]">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="border-t border-[var(--color-border)] px-4 py-3">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
