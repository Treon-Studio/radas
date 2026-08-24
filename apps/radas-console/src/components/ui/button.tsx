import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Built with NES.css (https://nostalgic-css.github.io/NES.css/)
 * Features authentic 8-bit retro pixel borders, 3D inline bevels (box-shadow inset),
 * tactile press animation, and compact 7px-8px pixel typography (reduced 30%).
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
        default: "h-9 px-3.5 text-[7px] tracking-wider uppercase",
        sm: "h-7 px-2.5 text-[6px] tracking-wider uppercase",
        lg: "h-10 px-4 text-[8px] tracking-wider uppercase",
        icon: "h-9 w-9 p-0 text-[7px]",
        pill: "h-7 px-3 text-[6.5px]",
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
