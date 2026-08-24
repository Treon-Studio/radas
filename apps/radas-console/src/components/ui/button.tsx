import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Harmonized with PixelInput & Pxlkit design system
 * Uses identical 2px borders, stepped notched corners (pxl-corner-sm),
 * JetBrains Mono font typography, matching font-size, and proportional 3D inline shadow.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-mono font-semibold tracking-wider uppercase transition-all duration-150 outline-none",
    "border-2 border-[var(--color-retro-border-strong)] pxl-corner-sm",
    "shadow-[inset_-2px_-2px_0_0_rgba(0,0,0,0.32),inset_1px_1px_0_0_rgba(255,255,255,0.2)]",
    "hover:shadow-[inset_-3px_-3px_0_0_rgba(0,0,0,0.4),inset_1px_1px_0_0_rgba(255,255,255,0.3)]",
    "active:shadow-[inset_2px_2px_0_0_rgba(0,0,0,0.45)] active:translate-x-[1px] active:translate-y-[1px]",
    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-retro-bg)] focus-visible:ring-[var(--color-retro-green)]/50",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-[var(--color-retro-green)] text-[#0a0a0f] font-bold",
          "hover:bg-[var(--color-retro-green)]/90",
        ].join(" "),
        primary: [
          "bg-[var(--color-retro-cyan)] text-[#0a0a0f] font-bold",
          "hover:brightness-105",
        ].join(" "),
        secondary: [
          "bg-[var(--color-retro-surface)] text-[var(--color-retro-text)]",
          "hover:bg-[var(--color-retro-card)]",
        ].join(" "),
        outline: [
          "bg-[var(--color-retro-surface)]/50 text-[var(--color-retro-text)]",
          "hover:bg-[var(--color-retro-surface)]/80 hover:border-[var(--color-retro-green)]/60",
        ].join(" "),
        ghost: [
          "!border-transparent !bg-transparent !shadow-none hover:!bg-[var(--color-retro-surface)]/60 hover:!border-[var(--color-retro-border)] text-[var(--color-retro-text)]",
        ].join(" "),
        destructive: [
          "bg-[var(--color-retro-red)] text-white font-bold",
          "hover:brightness-110",
        ].join(" "),
        "retro-green": [
          "bg-[var(--color-retro-green)] text-[#0a0a0f] font-bold",
          "hover:bg-[var(--color-retro-green)]/90",
        ].join(" "),
        "retro-gold": [
          "bg-[var(--color-retro-gold)] text-[#0a0a0f] font-bold",
          "hover:brightness-105",
        ].join(" "),
        "retro-cyan": [
          "bg-[var(--color-retro-cyan)] text-[#0a0a0f] font-bold",
          "hover:brightness-105",
        ].join(" "),
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0 text-sm",
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
