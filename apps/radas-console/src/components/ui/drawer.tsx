import { useEffect } from "react";
import { RiCloseLine as X } from "@remixicon/react";
import { cn } from "@/lib/utils";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
  ariaLabel?: string;
};

/** Right-anchored slide-over panel (master-detail detail pane). */
export function Drawer({ open, onClose, title, children, footer, widthClass = "max-w-md", ariaLabel }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label={ariaLabel ?? (typeof title === "string" ? title : "Detail")}
        className={cn(
          "absolute inset-y-0 right-0 w-full flex flex-col bg-[var(--color-card)] border-l border-[var(--color-border)] shadow-[var(--shadow-popover)]",
          widthClass,
        )}
      >
        <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-[var(--color-muted)]">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="border-t border-[var(--color-border)] px-4 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}
