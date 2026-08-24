import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Rounded 3D Raised Pixel Button (Codédex Style)
 * Implements border-radius: 6px, 2px contour border, 3D bottom extrusion ledge,
 * top highlight bevel, and tactile pushdown animation.
 */
const buttonVariants = cva(
  [
    "btn-3d inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-pixel uppercase tracking-wider outline-none",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "btn-3d-success",
        primary: "btn-3d-primary",
        secondary: "btn-3d-secondary",
        outline: "btn-3d-outline",
        ghost: "!border-none !bg-transparent !shadow-none hover:!bg-[var(--color-retro-surface)]/60 text-[var(--color-retro-text)]",
        destructive: "btn-3d-destructive",
        "retro-green": "btn-3d-success",
        "retro-gold": "btn-3d-gold",
        "retro-cyan": "btn-3d-primary",
      },
      size: {
        default: "h-11 px-4 text-[8px] tracking-wider uppercase",
        sm: "h-9 px-3 text-[8px] tracking-wider uppercase",
        lg: "h-13 px-6 text-[10px] tracking-wider uppercase",
        icon: "h-11 w-11 p-0 text-[8px]",
        pill: "h-9 px-3.5 text-[8px]",
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
