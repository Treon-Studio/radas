import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * PixelCard - Cloned from Pxlkit UI Kit (https://pxlkit.xyz/ui-kit)
 * Features retro sharp pixel borders, subtle pixel grid backgrounds,
 * and high-contrast retro borders.
 */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div
    ref={ref}
    className={cn(
      "border-2 border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)] pxl-corner-md pxl-card-shadow transition-colors duration-100",
      className
    )}
    {...p}
  />
));
Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col gap-1.5 p-5 border-b border-[var(--color-border)]/60 bg-[var(--color-muted)]/30",
      className
    )}
    {...p}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(({ className, ...p }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-sm sm:text-base font-mono font-semibold tracking-tight uppercase text-[var(--color-foreground)]",
      className
    )}
    {...p}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(({ className, ...p }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs font-mono text-[var(--color-muted-foreground)]", className)}
    {...p}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div ref={ref} className={cn("p-5", className)} {...p} />
));
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...p }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center p-5 pt-0 border-t border-[var(--color-border)]/40 mt-4",
      className
    )}
    {...p}
  />
));
CardFooter.displayName = "CardFooter";

export default Card;
