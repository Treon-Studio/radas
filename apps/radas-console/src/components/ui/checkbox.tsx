import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * PixelCheckbox - Cloned from Pxlkit UI Kit (https://pxlkit.xyz/ui-kit)
 * Retro pixel checkbox with sharp corners and custom pixel checkmark styling.
 */
export const CheckboxInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 pxl-corner-sm border-2 border-[var(--color-border)] bg-[var(--color-card)]",
        "accent-[var(--color-primary)] pxl-input-shadow cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
CheckboxInput.displayName = "CheckboxInput";
export default CheckboxInput;
