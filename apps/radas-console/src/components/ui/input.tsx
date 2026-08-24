import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  prefixIcon?: ReactNode;
  suffixIcon?: ReactNode;
  isInvalid?: boolean;
  sizeVariant?: "sm" | "default" | "lg";
}

/**
 * PixelInput - Cloned from Pxlkit UI Kit (https://pxlkit.xyz/ui-kit)
 * Features retro crisp pixel borders, inset pixel shadow, monospace font,
 * and high-contrast retro focus ring.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, prefixIcon, suffixIcon, isInvalid, sizeVariant = "default", disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: "h-8 px-2.5 text-xs",
      default: "h-9 px-3 text-sm",
      lg: "h-11 px-4 text-base",
    };

    return (
      <div className="relative w-full flex items-center">
        {prefixIcon && (
          <span className="pointer-events-none absolute left-3 flex items-center justify-center text-[var(--color-muted-foreground)]">
            {prefixIcon}
          </span>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            "w-full font-mono bg-[var(--color-card)] text-[var(--color-foreground)] transition-all duration-100",
            "border-2 border-[var(--color-border)] pxl-corner-sm pxl-input-shadow",
            "placeholder:text-[var(--color-smoke)] placeholder:font-mono",
            "hover:border-[var(--color-charcoal)]",
            "focus-visible:outline-none focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-background)]",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--color-muted)]",
            isInvalid && "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/30 text-red-600 dark:text-red-400",
            prefixIcon && "pl-9",
            suffixIcon && "pr-9",
            sizeClasses[sizeVariant],
            className
          )}
          {...props}
        />
        {suffixIcon && (
          <span className="absolute right-3 flex items-center justify-center text-[var(--color-muted-foreground)]">
            {suffixIcon}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
