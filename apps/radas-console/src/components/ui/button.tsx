import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Cloned from Pxlkit UI Kit (https://pxlkit.xyz/ui-kit)
 * Features retro 3D inline shadow bevels (pxl-btn-shadow), stepped pixel corners (pxl-corner-sm),
 * tactile press feedback, and pixel typography.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "transition-all duration-100 outline-none pxl-corner-sm pxl-btn-shadow border-2",
    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-ring)]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "border-[var(--color-retro-border-strong)] bg-[var(--color-retro-green)] text-white font-bold",
          "hover:bg-[var(--color-retro-green)]/90",
        ].join(" "),
        secondary: [
          "border-[var(--color-retro-border-strong)] bg-[var(--color-retro-surface)] text-[var(--color-retro-text)] font-semibold",
          "hover:bg-[var(--color-retro-card)]",
        ].join(" "),
        outline: [
          "border-[var(--color-retro-border-strong)] bg-[var(--color-retro-surface)]/40 text-[var(--color-retro-text)] font-semibold",
          "hover:bg-[var(--color-retro-surface)]/80 hover:border-[var(--color-retro-green)]/60",
        ].join(" "),
        ghost: [
          "border-transparent bg-transparent text-[var(--color-retro-text)] shadow-none font-semibold",
          "hover:bg-[var(--color-retro-surface)]/60 hover:border-[var(--color-retro-border)]",
        ].join(" "),
        destructive: [
          "border-[var(--color-retro-border-strong)] bg-[var(--color-retro-red)] text-white font-bold",
          "hover:brightness-110",
        ].join(" "),
        "retro-green": [
          "border-[var(--color-retro-border-strong)] bg-[#45a049] text-white font-bold",
          "hover:brightness-105",
        ].join(" "),
        "retro-gold": [
          "border-[var(--color-retro-border-strong)] bg-[var(--color-retro-gold)] text-[#0a0a0f] font-bold",
          "hover:brightness-105",
        ].join(" "),
        "retro-cyan": [
          "border-[var(--color-retro-border-strong)] bg-[var(--color-retro-cyan)] text-[#0a0a0f] font-bold",
          "hover:brightness-105",
        ].join(" "),
      },
      size: {
        default: "h-10 px-4 text-[11px] tracking-wider uppercase font-pixel",
        sm: "h-8 px-3 text-[9px] tracking-wider uppercase font-pixel",
        lg: "h-12 px-6 text-xs tracking-wider uppercase font-pixel",
        icon: "h-10 w-10 p-0 font-pixel",
        pill: "h-8 px-3.5 text-[9px] font-pixel",
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
