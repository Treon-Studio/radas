import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Raised 3D Retro Pixel Button (Codédex & 8-Bit Arcade Style)
 * Implements 5px bottom extrusion pedestal, 2px contour border, top highlight bevel,
 * tactile physical push-down animation (translateY 4px), and pixel typography.
 */
const buttonVariants = cva(
  [
    "btn-3d inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-pixel tracking-wider uppercase outline-none",
    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-retro-bg)]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "btn-3d-success",
        primary: "btn-3d-primary",
        secondary: "btn-3d-secondary",
        outline: "btn-3d-outline",
        ghost: "!border-transparent !bg-transparent !shadow-none !mb-0 hover:!bg-[var(--color-retro-surface)]/60 text-[var(--color-retro-text)]",
        destructive: "btn-3d-destructive",
        "retro-green": "btn-3d-success",
        "retro-gold": "btn-3d-gold",
        "retro-cyan": "btn-3d-cyan",
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
