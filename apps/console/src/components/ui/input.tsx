import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  prefixIcon?: ReactNode;
  suffixIcon?: ReactNode;
  isInvalid?: boolean;
  sizeVariant?: "sm" | "default" | "lg";
}

/**
 * PixelInput - Cloned exactly from Pxlkit UI Kit (https://pxlkit.xyz/ui-kit)
 * Features retro crisp pixel corners with polygon clip-path (pxl-corner-sm),
 * 2px solid retro border (border-retro-border-strong),
 * monospace font, and emerald/cyan focus outline.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, prefixIcon, suffixIcon, isInvalid, sizeVariant = "default", disabled, ...props }, ref) => {
    const sizeClasses = {
      sm: "h-8 text-xs",
      default: "h-10 text-sm",
      lg: "h-12 text-base",
    };

    return (
      <div className="relative w-full flex items-center">
        {prefixIcon && (
          <span className="pointer-events-none absolute left-3 flex items-center justify-center text-[var(--color-retro-muted)] z-10">
            {prefixIcon}
          </span>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            "w-full font-mono transition-all duration-150 outline-none pxl-corner-sm border-2",
            "border-[var(--color-retro-border-strong)] bg-[var(--color-retro-surface)]/50 text-[var(--color-retro-text)]",
            "placeholder:text-[var(--color-retro-muted)]/70 placeholder:font-mono",
            "hover:border-[var(--color-retro-green)]/60 hover:bg-[var(--color-retro-surface)]/70",
            "focus:bg-[var(--color-retro-surface)]/90 focus-visible:border-[var(--color-retro-green)]",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-retro-bg)] focus-visible:ring-[var(--color-retro-green)]/40",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--color-retro-muted)]/20",
            isInvalid && "border-[var(--color-retro-red)] focus-visible:border-[var(--color-retro-red)] focus-visible:ring-[var(--color-retro-red)]/40 text-[var(--color-retro-red)]",
            prefixIcon ? "pl-10" : "pl-3",
            suffixIcon ? "pr-10" : "pr-3",
            sizeClasses[sizeVariant],
            className
          )}
          {...props}
        />
        {suffixIcon && (
          <span className="absolute right-3 flex items-center justify-center text-[var(--color-retro-muted)] z-10">
            {suffixIcon}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
