import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface PixelIconProps extends HTMLAttributes<HTMLElement> {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | number;
}

/**
 * PixelIcon - Component from Pixel Icon Library (https://pixeliconlibrary.com/)
 * Powered by @hackernoon/pixel-icon-library
 *
 * Example usage:
 *   <PixelIcon name="search" />
 *   <PixelIcon name="eye-slash" size="sm" />
 *   <PixelIcon name="user-solid" className="text-retro-green" />
 */
export function PixelIcon({ name, size = "md", className, style, ...props }: PixelIconProps) {
  const sizeClasses = {
    xs: "text-[12px]",
    sm: "text-[14px]",
    md: "text-[16px]",
    lg: "text-[20px]",
    xl: "text-[24px]",
  };

  const customStyle =
    typeof size === "number" ? { fontSize: `${size}px`, ...style } : style;

  return (
    <i
      className={cn(
        "hn",
        `hn-${name}`,
        "inline-flex items-center justify-center leading-none select-none not-italic",
        typeof size === "string" && sizeClasses[size],
        className
      )}
      style={customStyle}
      aria-hidden="true"
      {...props}
    />
  );
}

export default PixelIcon;
