import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Cloned from Pxlkit UI Kit (https://pxlkit.xyz/ui-kit)
 * Features retro 3D bevel box-shadows, sharp pixel corners, tactile press feedback,
 * and high-contrast retro color variants.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono font-medium select-none",
    "transition-all duration-100 outline-none pxl-corner-sm",
    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-ring)]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
    "active:translate-x-[1px] active:translate-y-[1px]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "border-2 border-[var(--color-foreground)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
          "pxl-shadow pxl-shadow-hover pxl-shadow-active hover:brightness-110",
        ].join(" "),
        secondary: [
          "border-2 border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]",
          "pxl-shadow pxl-shadow-hover pxl-shadow-active hover:bg-[var(--color-muted)]",
        ].join(" "),
        outline: [
          "border-2 border-[var(--color-border)] bg-transparent text-[var(--color-foreground)]",
          "hover:bg-[var(--color-muted)] hover:border-[var(--color-charcoal)]",
          "pxl-shadow pxl-shadow-hover pxl-shadow-active",
        ].join(" "),
        ghost: [
          "border-2 border-transparent bg-transparent text-[var(--color-foreground)]",
          "hover:bg-[var(--color-muted)] hover:border-[var(--color-border)]",
        ].join(" "),
        destructive: [
          "border-2 border-red-600 bg-red-600 text-white dark:bg-red-700",
          "pxl-shadow pxl-shadow-hover pxl-shadow-active hover:bg-red-700",
        ].join(" "),
        "retro-green": [
          "border-2 border-[#1a7f4c] bg-[#00E599] text-[#0a0a0f] font-bold",
          "shadow-[inset_2px_2px_0_rgba(255,255,255,0.4),inset_-2px_-2px_0_rgba(0,0,0,0.35)]",
          "hover:brightness-105 active:shadow-[inset_2px_2px_0_rgba(0,0,0,0.5)]",
        ].join(" "),
        "retro-gold": [
          "border-2 border-[#b89500] bg-[#FFD700] text-[#0a0a0f] font-bold",
          "shadow-[inset_2px_2px_0_rgba(255,255,255,0.4),inset_-2px_-2px_0_rgba(0,0,0,0.35)]",
          "hover:brightness-105 active:shadow-[inset_2px_2px_0_rgba(0,0,0,0.5)]",
        ].join(" "),
        "retro-cyan": [
          "border-2 border-[#20968e] bg-[#4ECDC4] text-[#0a0a0f] font-bold",
          "shadow-[inset_2px_2px_0_rgba(255,255,255,0.4),inset_-2px_-2px_0_rgba(0,0,0,0.35)]",
          "hover:brightness-105 active:shadow-[inset_2px_2px_0_rgba(0,0,0,0.5)]",
        ].join(" "),
      },
      size: {
        default: "h-9 px-4 text-xs tracking-wider uppercase",
        sm: "h-8 px-3 text-[11px] tracking-wider uppercase",
        lg: "h-11 px-6 text-sm tracking-wider uppercase",
        icon: "h-9 w-9 p-0",
        pill: "h-8 px-3.5 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  }
);

Button.displayName = "Button";
export { buttonVariants };
export default Button;
