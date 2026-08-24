import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

/**
 * PixelButton - Official NES.css & Codédex 8-Bit Pixel Button
 * Directly uses NES.css border-image 9-slice SVG and 3D inset shadow ::after.
 */
const buttonVariants = cva(
  [
    "nes-btn inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-pixel uppercase tracking-wider outline-none",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "is-success",
        primary: "is-primary",
        secondary: "",
        outline: "",
        ghost: "!border-none !bg-transparent !shadow-none hover:!bg-[var(--color-retro-surface)]/60 text-[var(--color-retro-text)]",
        destructive: "is-error",
        "retro-green": "is-success",
        "retro-gold": "is-warning",
        "retro-cyan": "is-primary",
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
