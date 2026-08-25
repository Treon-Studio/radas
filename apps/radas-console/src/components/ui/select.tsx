import { useEffect, useId, useRef, useState } from "react";
import { RiCheckLine as Check, RiArrowDownSLine as ChevronDown } from "@remixicon/react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type Props = {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  label?: string;
  align?: "start" | "end";
  side?: "top" | "bottom";
  prefix?: React.ReactNode;
  action?: { label: string; icon?: React.ReactNode; onClick: () => void };
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/**
 * PixelSelect - Cloned from Pxlkit UI Kit (https://pxlkit.xyz/ui-kit)
 * Accessible retro combobox with pixelated drop shadow, monospace font, and sharp borders.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  triggerClassName,
  panelClassName,
  label,
  align = "start",
  side = "bottom",
  prefix,
  action,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
}: Props) {
  const id = useId();
  const triggerId = `${id}-trigger`;
  const listboxId = `${id}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const optionId = (index: number) => `${id}-option-${index}`;
  const enabledIndexes = options.reduce<number[]>((indexes, option, index) => {
    if (!option.disabled) indexes.push(index);
    return indexes;
  }, []);
  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
  const initialActiveIndex = () => selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const openSelect = () => {
    const index = initialActiveIndex();
    setActiveIndex(index);
    setOpen(true);
  };
  const nextEnabledIndex = (currentIndex: number, direction: 1 | -1) => {
    if (!enabledIndexes.length) return -1;
    const currentPosition = enabledIndexes.indexOf(currentIndex);
    const nextPosition = currentPosition < 0
      ? (direction === 1 ? 0 : enabledIndexes.length - 1)
      : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    return enabledIndexes[nextPosition]!;
  };
  const moveActive = (direction: 1 | -1) => {
    setActiveIndex(nextEnabledIndex(activeIndex, direction));
  };

  useEffect(() => {
    if (!open || enabledIndexes.includes(activeIndex)) return;
    setActiveIndex(initialActiveIndex());
  }, [activeIndex, enabledIndexes, open, options, value]);

  useEffect(() => {
    if (!open) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open]);

  useEffect(() => () => {
    if (typeaheadTimeoutRef.current) clearTimeout(typeaheadTimeoutRef.current);
  }, []);

  const selectActive = () => {
    const option = options[activeIndex];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) selectActive();
        else openSelect();
        return;
      case "Escape":
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
        return;
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1));
          setOpen(true);
        } else {
          moveActive(1);
        }
        return;
      case "ArrowUp":
        event.preventDefault();
        if (!open) {
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : (enabledIndexes[enabledIndexes.length - 1] ?? -1));
          setOpen(true);
        } else {
          moveActive(-1);
        }
        return;
      default:
        break;
    }

    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    const query = `${typeaheadRef.current}${event.key}`.toLocaleLowerCase();
    const matchingIndex = enabledIndexes.find((index) => options[index]!.label.toLocaleLowerCase().startsWith(query));
    if (matchingIndex === undefined) return;
    event.preventDefault();
    typeaheadRef.current = query;
    if (typeaheadTimeoutRef.current) clearTimeout(typeaheadTimeoutRef.current);
    typeaheadTimeoutRef.current = setTimeout(() => { typeaheadRef.current = ""; }, 500);
    setActiveIndex(matchingIndex);
    setOpen(true);
  };

  const current = options.find((option) => option.value === value) ?? null;
  const activeOptionId = open && activeIndex >= 0 ? optionId(activeIndex) : undefined;

  return (
    <div ref={rootRef} className={cn("relative inline-block w-full", className)}>
      {label && <label htmlFor={triggerId} className="mb-1 block font-mono text-xs font-medium text-[var(--color-muted-foreground)]">{label}</label>}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        disabled={disabled}
        onClick={() => !disabled && (open ? close() : openSelect())}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-label={label ? undefined : placeholder}
        aria-describedby={ariaDescribedby}
        aria-invalid={ariaInvalid || undefined}
        className={cn(
          "w-full inline-flex items-center justify-between gap-2 h-9 px-3 pxl-corner-sm font-mono text-sm",
          "bg-[var(--color-card)] border-2 border-[var(--color-border)] text-[var(--color-foreground)] pxl-shadow transition-all duration-100",
          "hover:border-[var(--color-charcoal)] hover:bg-[var(--color-muted)]/50",
          "focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-ring)]/40 focus:ring-offset-1 focus:ring-offset-[var(--color-background)]",
          disabled && "opacity-50 cursor-not-allowed",
          triggerClassName,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {prefix}
          <span className={cn("truncate", !current && "text-[var(--color-muted-foreground)]")}>
            {current?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform duration-100", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 min-w-full max-h-72 overflow-auto pxl-corner-sm",
            "bg-[var(--color-card)] border-2 border-[var(--color-border)] pxl-card-shadow p-1.5",
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          <div id={listboxId} role="listbox" aria-labelledby={triggerId}>
            {options.length === 0 && (
              <div className="px-3 py-2 font-mono text-xs text-[var(--color-muted-foreground)]">No options</div>
            )}
            {options.map((option, index) => {
              const selected = option.value === value;
              const active = index === activeIndex;
              return (
                <div
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={option.disabled || undefined}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    close(true);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-3 py-2 pxl-corner-sm font-mono text-xs text-left cursor-pointer",
                    "transition-all duration-100",
                    selected
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-bold pxl-shadow"
                      : "hover:bg-[var(--color-muted)] text-[var(--color-foreground)]",
                    active && !selected && "bg-[var(--color-muted)]",
                    option.disabled && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="truncate text-[10px] opacity-75">{option.description}</span>
                    )}
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                </div>
              );
            })}
          </div>
          {action && (
            <>
              <div className="my-1.5 border-t border-[var(--color-border)]" />
              <button
                type="button"
                onClick={() => { close(); action.onClick(); }}
                className="w-full flex items-center gap-2 px-3 py-2 pxl-corner-sm font-mono text-xs text-left text-[var(--color-primary)] hover:bg-[var(--color-muted)] transition-colors"
              >
                {action.icon}
                <span className="truncate">{action.label}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default Select;