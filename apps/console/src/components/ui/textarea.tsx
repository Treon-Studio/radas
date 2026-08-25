import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  isInvalid?: boolean;
}

/**
 * PixelTextarea - Cloned from Pxlkit UI Kit (https://pxlkit.xyz/ui-kit)
 * Retro pixel multi-line text input with inset shadow, monospace font, and sharp borders.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isInvalid, disabled, ...props }, ref) => (
    <textarea
      ref={ref}
      disabled={disabled}
      className={cn(
        "flex w-full min-h-[80px] pxl-corner-sm border-2 border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2",
        "font-mono text-sm text-[var(--color-foreground)] pxl-input-shadow transition-all duration-100",
        "placeholder:text-[var(--color-smoke)] placeholder:font-mono",
        "hover:border-[var(--color-charcoal)]",
        "focus-visible:outline-none focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-background)]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--color-muted)]",
        isInvalid && "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/30",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
export default Textarea;
