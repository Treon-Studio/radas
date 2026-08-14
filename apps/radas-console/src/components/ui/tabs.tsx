import { cn } from "@/lib/utils";

type TabItem<T extends string> = { id: T; label: string };

/** Minimal shared tab bar used across console pages. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-[var(--color-border)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
            active === tab.id
              ? "border-[var(--color-primary)] text-[var(--color-primary)] font-medium"
              : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
