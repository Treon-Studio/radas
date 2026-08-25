import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Official Codédex 3D Raised Pixel Button
 * Direct 1:1 Implementation with .before, .btn-content, and .after layers.
 */
const buttonVariants = cva(
  [
    "btn-codedex select-none font-pixel uppercase tracking-wider outline-none",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "btn-codedex-default",
        primary: "btn-codedex-primary",
        secondary: "btn-codedex-secondary",
        outline: "btn-codedex-outline",
        ghost: "!border-none !bg-transparent !shadow-none hover:!bg-[var(--color-retro-surface)]/60 text-[var(--color-retro-text)]",
        destructive: "btn-codedex-destructive",
        "retro-green": "btn-codedex-success",
        "retro-gold": "btn-codedex-warning",
        "retro-cyan": "btn-codedex-primary",
      },
      size: {
        default: "h-12 px-4 text-[8px]",
        sm: "h-10 px-3 text-[8px]",
        lg: "h-14 px-6 text-[10px]",
        icon: "h-12 w-12 p-0 text-[8px]",
        pill: "h-10 px-3.5 text-[8px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, children, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      );
    }

    if (variant === "ghost") {
      return (
        <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </button>
      );
    }

    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        <span className="before" />
        <span className="btn-content">{children}</span>
        <span className="after" />
      </button>
    );
  }
);

Button.displayName = "Button";
export { buttonVariants };
export default Button;
