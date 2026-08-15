import { useId, useRef } from "react";
import { cn } from "@/lib/utils";

type TabItem<T extends string> = { id: T; label: string };

type TabsProps<T extends string> = {
  tabs: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Stable id prefix for matching externally-rendered tab panels. */
  id?: string;
  ariaLabel?: string;
};

/**
 * Shared tab bar with automatic activation. Consumers may keep rendering panels
 * independently; pass `id` and use `${id}-panel-${tabId}` for panel linkage.
 */
export function Tabs<T extends string>({ tabs, active, onChange, id, ariaLabel = "Tabs" }: TabsProps<T>) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activate = (index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    onChange(tab.id);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!tabs.length) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    activate(nextIndex);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-[var(--color-border)]">
      {tabs.map((tab, index) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            ref={(node) => { tabRefs.current[index] = node; }}
            id={`${baseId}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={id ? `${baseId}-panel-${tab.id}` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
              selected
                ? "border-[var(--color-primary)] text-[var(--color-primary)] font-medium"
                : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}