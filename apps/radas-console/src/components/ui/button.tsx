import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Built with NES.css (https://nostalgic-css.github.io/NES.css/)
 * Preserves all original NES.css retro colors (Green is-success, Blue is-primary, Gold is-warning, Red is-error),
 * 3D inline bevels, and Press Start 2P pixel typography, with harmonized 2px border-width matching inputs.
 */
const buttonVariants = cva(
  [
    "nes-btn inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "transition-all duration-100 outline-none font-pixel",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "is-success",
        primary: "is-primary",
        secondary: "bg-[var(--color-retro-surface)] text-[var(--color-retro-text)]",
        outline: "bg-[var(--color-retro-card)]/60 text-[var(--color-retro-text)]",
        ghost: "!border-transparent !bg-transparent !shadow-none hover:!bg-[var(--color-retro-surface)]/60 text-[var(--color-retro-text)]",
        destructive: "is-error",
        "retro-green": "is-success",
        "retro-gold": "is-warning",
        "retro-cyan": "is-primary",
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
