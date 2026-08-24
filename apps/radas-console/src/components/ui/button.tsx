import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Harmonized with PixelInput & NES.css 8-bit aesthetic
 * Uses identical 2px solid retro borders, stepped notched corners (pxl-corner-sm),
 * 2px 3D inline bevel shadows (inset box-shadow), and Press Start 2P pixel typography (8px / 10px).
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-pixel tracking-wider uppercase transition-all duration-100 outline-none",
    "border-2 border-[var(--color-retro-border-strong)] pxl-corner-sm",
    "shadow-[inset_-2px_-2px_0_0_rgba(0,0,0,0.35),inset_1px_1px_0_0_rgba(255,255,255,0.25)]",
    "hover:shadow-[inset_-3px_-3px_0_0_rgba(0,0,0,0.45),inset_1px_1px_0_0_rgba(255,255,255,0.35)]",
    "active:shadow-[inset_2px_2px_0_0_rgba(0,0,0,0.5),inset_-1px_-1px_0_0_rgba(255,255,255,0.1)] active:translate-x-[1px] active:translate-y-[1px]",
    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-retro-bg)] focus-visible:ring-[var(--color-retro-green)]/40",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-[#92cc41] text-white font-bold hover:bg-[#76c442]",
          "shadow-[inset_-2px_-2px_0_0_#4aa52e,inset_1px_1px_0_0_rgba(255,255,255,0.4)]",
          "hover:shadow-[inset_-3px_-3px_0_0_#4aa52e,inset_1px_1px_0_0_rgba(255,255,255,0.5)]",
          "active:shadow-[inset_2px_2px_0_0_#4aa52e]",
        ].join(" "),
        primary: [
          "bg-[#209cee] text-white font-bold hover:bg-[#108de0]",
          "shadow-[inset_-2px_-2px_0_0_#006bb3,inset_1px_1px_0_0_rgba(255,255,255,0.4)]",
          "hover:shadow-[inset_-3px_-3px_0_0_#006bb3,inset_1px_1px_0_0_rgba(255,255,255,0.5)]",
          "active:shadow-[inset_2px_2px_0_0_#006bb3]",
        ].join(" "),
        secondary: [
          "bg-[var(--color-retro-surface)] text-[var(--color-retro-text)] hover:bg-[var(--color-retro-card)]",
        ].join(" "),
        outline: [
          "bg-[var(--color-retro-surface)]/50 text-[var(--color-retro-text)] hover:bg-[var(--color-retro-surface)]/80 hover:border-[var(--color-retro-green)]/60",
        ].join(" "),
        ghost: [
          "!border-transparent !bg-transparent !shadow-none hover:!bg-[var(--color-retro-surface)]/60 hover:!border-[var(--color-retro-border)] text-[var(--color-retro-text)]",
        ].join(" "),
        destructive: [
          "bg-[#e76e55] text-white font-bold hover:bg-[#ce372b]",
          "shadow-[inset_-2px_-2px_0_0_#8c2022,inset_1px_1px_0_0_rgba(255,255,255,0.4)]",
          "hover:shadow-[inset_-3px_-3px_0_0_#8c2022,inset_1px_1px_0_0_rgba(255,255,255,0.5)]",
          "active:shadow-[inset_2px_2px_0_0_#8c2022]",
        ].join(" "),
        "retro-green": [
          "bg-[#92cc41] text-white font-bold hover:bg-[#76c442]",
          "shadow-[inset_-2px_-2px_0_0_#4aa52e,inset_1px_1px_0_0_rgba(255,255,255,0.4)]",
          "hover:shadow-[inset_-3px_-3px_0_0_#4aa52e,inset_1px_1px_0_0_rgba(255,255,255,0.5)]",
          "active:shadow-[inset_2px_2px_0_0_#4aa52e]",
        ].join(" "),
        "retro-gold": [
          "bg-[#f7d51d] text-[#212529] font-bold hover:bg-[#f2c409]",
          "shadow-[inset_-2px_-2px_0_0_#e59400,inset_1px_1px_0_0_rgba(255,255,255,0.4)]",
          "hover:shadow-[inset_-3px_-3px_0_0_#e59400,inset_1px_1px_0_0_rgba(255,255,255,0.5)]",
          "active:shadow-[inset_2px_2px_0_0_#e59400]",
        ].join(" "),
        "retro-cyan": [
          "bg-[#209cee] text-white font-bold hover:bg-[#108de0]",
          "shadow-[inset_-2px_-2px_0_0_#006bb3,inset_1px_1px_0_0_rgba(255,255,255,0.4)]",
          "hover:shadow-[inset_-3px_-3px_0_0_#006bb3,inset_1px_1px_0_0_rgba(255,255,255,0.5)]",
          "active:shadow-[inset_2px_2px_0_0_#006bb3]",
        ].join(" "),
      },
      size: {
        default: "h-10 px-4 text-[8px] tracking-wider uppercase",
        sm: "h-8 px-3 text-[8px] tracking-wider uppercase",
        lg: "h-12 px-6 text-[10px] tracking-wider uppercase",
        icon: "h-10 w-10 p-0 text-[8px]",
        pill: "h-8 px-3.5 text-[8px]",
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
