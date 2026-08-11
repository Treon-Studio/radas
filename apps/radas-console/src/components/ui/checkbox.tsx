import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Accessible checkbox matching the design tokens (accent uses --color-primary). */
export const CheckboxInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border border-[var(--color-input)] accent-[var(--color-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
CheckboxInput.displayName = "CheckboxInput";
