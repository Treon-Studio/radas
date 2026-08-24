import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Raised 3D Retro Pixel Button
 * Implements tactile 3D physical push-down extrusion (4px bottom base shadow),
 * stepped pixel corner geometry (pxl-corner-sm), top bevel highlight,
 * and Press Start 2P pixel typography with text shadow.
 */
const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-pixel tracking-wider uppercase transition-all duration-75 outline-none pxl-corner-sm",
    "border-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-retro-bg)]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-[#22c55e] text-white font-bold border-[#15803d]",
          "shadow-[inset_0_2px_0_0_rgba(255,255,255,0.45),0_4px_0_0_#15803d]",
          "hover:bg-[#2ed66b] hover:shadow-[inset_0_2px_0_0_rgba(255,255,255,0.6),0_4px_0_0_#15803d]",
          "active:translate-y-[3px] active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_1px_0_0_#15803d]",
          "drop-shadow-[0_1px_0_#15803d]",
        ].join(" "),
        primary: [
          "bg-[#00a2ff] text-white font-bold border-[#006bb3]",
          "shadow-[inset_0_2px_0_0_rgba(255,255,255,0.45),0_4px_0_0_#005bb5]",
          "hover:bg-[#21b0ff] hover:shadow-[inset_0_2px_0_0_rgba(255,255,255,0.6),0_4px_0_0_#005bb5]",
          "active:translate-y-[3px] active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_1px_0_0_#005bb5]",
          "drop-shadow-[0_1px_0_#005bb5]",
        ].join(" "),
        secondary: [
          "bg-[var(--color-retro-surface)] text-[var(--color-retro-text)] border-[var(--color-retro-border-strong)]",
          "shadow-[inset_0_2px_0_0_rgba(255,255,255,0.2),0_4px_0_0_rgba(0,0,0,0.35)]",
          "hover:bg-[var(--color-retro-card)] hover:shadow-[inset_0_2px_0_0_rgba(255,255,255,0.3),0_4px_0_0_rgba(0,0,0,0.4)]",
          "active:translate-y-[3px] active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_0_0_rgba(0,0,0,0.35)]",
        ].join(" "),
        outline: [
          "bg-white dark:bg-[#1e2230] text-[#0a0a0f] dark:text-[#f2f0eb] border-[#94a3b8] dark:border-[#475569]",
          "shadow-[inset_0_2px_0_0_rgba(255,255,255,0.8),0_4px_0_0_#64748b] dark:shadow-[inset_0_2px_0_0_rgba(255,255,255,0.1),0_4px_0_0_#334155]",
          "hover:bg-[#f8fafc] dark:hover:bg-[#272c3d]",
          "active:translate-y-[3px] active:shadow-[0_1px_0_0_#64748b] dark:active:shadow-[0_1px_0_0_#334155]",
        ].join(" "),
        ghost: [
          "!border-transparent !bg-transparent !shadow-none hover:!bg-[var(--color-retro-surface)]/60 hover:!border-[var(--color-retro-border)] text-[var(--color-retro-text)]",
        ].join(" "),
        destructive: [
          "bg-[#ef4444] text-white font-bold border-[#b91c1c]",
          "shadow-[inset_0_2px_0_0_rgba(255,255,255,0.45),0_4px_0_0_#991b1b]",
          "hover:bg-[#f87171] hover:shadow-[inset_0_2px_0_0_rgba(255,255,255,0.6),0_4px_0_0_#991b1b]",
          "active:translate-y-[3px] active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_1px_0_0_#991b1b]",
          "drop-shadow-[0_1px_0_#991b1b]",
        ].join(" "),
        "retro-green": [
          "bg-[#22c55e] text-white font-bold border-[#15803d]",
          "shadow-[inset_0_2px_0_0_rgba(255,255,255,0.45),0_4px_0_0_#15803d]",
          "hover:bg-[#2ed66b] hover:shadow-[inset_0_2px_0_0_rgba(255,255,255,0.6),0_4px_0_0_#15803d]",
          "active:translate-y-[3px] active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_1px_0_0_#15803d]",
          "drop-shadow-[0_1px_0_#15803d]",
        ].join(" "),
        "retro-gold": [
          "bg-[#facc15] text-[#0a0a0f] font-bold border-[#ca8a04]",
          "shadow-[inset_0_2px_0_0_rgba(255,255,255,0.5),0_4px_0_0_#a16207]",
          "hover:bg-[#fde047] hover:shadow-[inset_0_2px_0_0_rgba(255,255,255,0.6),0_4px_0_0_#a16207]",
          "active:translate-y-[3px] active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_1px_0_0_#a16207]",
        ].join(" "),
        "retro-cyan": [
          "bg-[#00a2ff] text-white font-bold border-[#006bb3]",
          "shadow-[inset_0_2px_0_0_rgba(255,255,255,0.45),0_4px_0_0_#005bb5]",
          "hover:bg-[#21b0ff] hover:shadow-[inset_0_2px_0_0_rgba(255,255,255,0.6),0_4px_0_0_#005bb5]",
          "active:translate-y-[3px] active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_1px_0_0_#005bb5]",
          "drop-shadow-[0_1px_0_#005bb5]",
        ].join(" "),
      },
      size: {
        default: "h-10 px-4 text-[8px] tracking-wider uppercase mb-1",
        sm: "h-8 px-3 text-[8px] tracking-wider uppercase mb-1",
        lg: "h-12 px-6 text-[10px] tracking-wider uppercase mb-1",
        icon: "h-10 w-10 p-0 text-[8px] mb-1",
        pill: "h-8 px-3.5 text-[8px] mb-1",
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
