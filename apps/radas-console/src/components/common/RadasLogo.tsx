import React from "react";

interface RadasLogoProps {
  className?: string;
  size?: number;
}

export function RadasLogo({ className = "h-6 w-6 text-[var(--color-primary)]", size }: RadasLogoProps) {
  const style = size ? { width: size, height: size } : undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      viewBox="0 0 24 24"
      className={className}
      style={style}
      aria-label="RADAS Logo"
    >
      <path d="M16 8h2v2h2v2h2v8H2v-8h2v-2h2V8h2V6h8v2Zm-8 8h2v-4H8v4Zm6-4v4h2v-4h-2ZM6 8H4V6h2v2Zm14 0h-2V6h2v2ZM4 6H2V4h2v2Zm18 0h-2V4h2v2Z" />
    </svg>
  );
}

export default RadasLogo;
