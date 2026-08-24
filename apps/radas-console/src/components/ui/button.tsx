import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Raised 3D Retro Pixel Button (Codédex & 8-Bit Arcade Style)
 * Features 3D bottom extrusion ledge (inset 0 -6px), top highlight bevel (inset 0 2px),
 * physical push-down click animation (active:translate-y-[3px]), and pixel typography with shadow.
 */
const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-pixel tracking-wider uppercase transition-all duration-75 outline-none rounded-lg border-2",
    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-retro-bg)]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-[#22c55e] text-white font-bold border-[#15803d]",
          "shadow-[inset_0_-6px_0_0_#166534,inset_0_2px_0_0_rgba(255,255,255,0.45)]",
          "hover:bg-[#28d166] hover:shadow-[inset_0_-6px_0_0_#166534,inset_0_2px_0_0_rgba(255,255,255,0.6)]",
          "active:translate-y-[3px] active:shadow-[inset_0_-2px_0_0_#166534,inset_0_1px_0_0_rgba(255,255,255,0.2)]",
          "drop-shadow-[0_1px_0_#166534]",
        ].join(" "),
        primary: [
          "bg-[#1ea7fd] text-white font-bold border-[#064b7f]",
          "shadow-[inset_0_-6px_0_0_#0d70b7,inset_0_2px_0_0_rgba(255,255,255,0.45)]",
          "hover:bg-[#34b0ff] hover:shadow-[inset_0_-6px_0_0_#0d70b7,inset_0_2px_0_0_rgba(255,255,255,0.6)]",
          "active:translate-y-[3px] active:shadow-[inset_0_-2px_0_0_#0d70b7,inset_0_1px_0_0_rgba(255,255,255,0.2)]",
          "drop-shadow-[0_1px_0_#0d70b7]",
        ].join(" "),
        secondary: [
          "bg-[var(--color-retro-surface)] text-[var(--color-retro-text)] border-[var(--color-retro-border-strong)]",
          "shadow-[inset_0_-6px_0_0_rgba(0,0,0,0.3),inset_0_2px_0_0_rgba(255,255,255,0.25)]",
          "hover:bg-[var(--color-retro-card)] hover:shadow-[inset_0_-6px_0_0_rgba(0,0,0,0.4),inset_0_2px_0_0_rgba(255,255,255,0.35)]",
          "active:translate-y-[3px] active:shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.3),inset_0_1px_0_0_rgba(255,255,255,0.1)]",
        ].join(" "),
        outline: [
          "bg-white dark:bg-[#1e2230] text-[#0a0a0f] dark:text-[#f2f0eb] border-[#64748b] dark:border-[#475569]",
          "shadow-[inset_0_-6px_0_0_#cbd5e1,inset_0_2px_0_0_rgba(255,255,255,0.9)] dark:shadow-[inset_0_-6px_0_0_#0f172a,inset_0_2px_0_0_rgba(255,255,255,0.1)]",
          "hover:bg-[#f8fafc] dark:hover:bg-[#272c3d]",
          "active:translate-y-[3px] active:shadow-[inset_0_-2px_0_0_#cbd5e1] dark:active:shadow-[inset_0_-2px_0_0_#0f172a]",
        ].join(" "),
        ghost: [
          "!border-transparent !bg-transparent !shadow-none hover:!bg-[var(--color-retro-surface)]/60 hover:!border-[var(--color-retro-border)] text-[var(--color-retro-text)]",
        ].join(" "),
        destructive: [
          "bg-[#ef4444] text-white font-bold border-[#991b1b]",
          "shadow-[inset_0_-6px_0_0_#7f1d1d,inset_0_2px_0_0_rgba(255,255,255,0.45)]",
          "hover:bg-[#f87171] hover:shadow-[inset_0_-6px_0_0_#7f1d1d,inset_0_2px_0_0_rgba(255,255,255,0.6)]",
          "active:translate-y-[3px] active:shadow-[inset_0_-2px_0_0_#7f1d1d,inset_0_1px_0_0_rgba(255,255,255,0.2)]",
          "drop-shadow-[0_1px_0_#7f1d1d]",
        ].join(" "),
        "retro-green": [
          "bg-[#22c55e] text-white font-bold border-[#15803d]",
          "shadow-[inset_0_-6px_0_0_#166534,inset_0_2px_0_0_rgba(255,255,255,0.45)]",
          "hover:bg-[#28d166] hover:shadow-[inset_0_-6px_0_0_#166534,inset_0_2px_0_0_rgba(255,255,255,0.6)]",
          "active:translate-y-[3px] active:shadow-[inset_0_-2px_0_0_#166534,inset_0_1px_0_0_rgba(255,255,255,0.2)]",
          "drop-shadow-[0_1px_0_#166534]",
        ].join(" "),
        "retro-gold": [
          "bg-[#facc15] text-[#0a0a0f] font-bold border-[#a16207]",
          "shadow-[inset_0_-6px_0_0_#854d0e,inset_0_2px_0_0_rgba(255,255,255,0.55)]",
          "hover:bg-[#fde047] hover:shadow-[inset_0_-6px_0_0_#854d0e,inset_0_2px_0_0_rgba(255,255,255,0.7)]",
          "active:translate-y-[3px] active:shadow-[inset_0_-2px_0_0_#854d0e,inset_0_1px_0_0_rgba(255,255,255,0.2)]",
        ].join(" "),
        "retro-cyan": [
          "bg-[#1ea7fd] text-white font-bold border-[#064b7f]",
          "shadow-[inset_0_-6px_0_0_#0d70b7,inset_0_2px_0_0_rgba(255,255,255,0.45)]",
          "hover:bg-[#34b0ff] hover:shadow-[inset_0_-6px_0_0_#0d70b7,inset_0_2px_0_0_rgba(255,255,255,0.6)]",
          "active:translate-y-[3px] active:shadow-[inset_0_-2px_0_0_#0d70b7,inset_0_1px_0_0_rgba(255,255,255,0.2)]",
          "drop-shadow-[0_1px_0_#0d70b7]",
        ].join(" "),
      },
      size: {
        default: "h-11 px-4 pb-1 text-[8px] tracking-wider uppercase",
        sm: "h-9 px-3 pb-1 text-[8px] tracking-wider uppercase",
        lg: "h-13 px-6 pb-1 text-[10px] tracking-wider uppercase",
        icon: "h-11 w-11 p-0 pb-1 text-[8px]",
        pill: "h-9 px-3.5 pb-1 text-[8px]",
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
