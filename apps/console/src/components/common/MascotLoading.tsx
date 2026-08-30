import React from "react";
import { cn } from "@/lib/utils";

interface MascotLoadingProps {
  label?: string;
  sublabel?: string;
  size?: "sm" | "md" | "lg" | "fullscreen";
  className?: string;
}

const sizeMap = {
  sm: "w-20 h-20",
  md: "w-28 h-28 sm:w-36 sm:h-36",
  lg: "w-44 h-44 sm:w-56 sm:h-56",
  fullscreen: "w-48 h-48 sm:w-64 sm:h-64",
};

export function MascotLoading({
  label = "LOADING SYSTEM DATA...",
  sublabel,
  size = "md",
  className,
}: MascotLoadingProps) {
  const isFullscreen = size === "fullscreen";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center select-none font-mono text-center",
        isFullscreen ? "min-h-[60vh] w-full py-16" : "p-6",
        className
      )}
    >
      <div className="relative flex items-center justify-center">
        {/* Ambient background cyan pulse glow */}
        <div className="absolute inset-0 rounded-full bg-[var(--color-primary)]/10 blur-xl animate-pulse pointer-events-none" />

        {/* Animated Pixel Mascot */}
        <img
          src="/images/states/mascot_loading.webp"
          alt="Loading Mascot"
          className={cn(
            "relative z-10 object-contain drop-shadow-md pixelated transition-all duration-300",
            sizeMap[size]
          )}
          style={{ imageRendering: "pixelated" }}
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.src.endsWith(".gif")) {
              target.src = "/images/states/mascot_loading.gif";
            }
          }}
        />
      </div>

      {label && (
        <div className="mt-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--color-primary)] animate-ping" />
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-foreground)]">
            {label}
          </p>
        </div>
      )}

      {sublabel && (
        <p className="mt-1.5 max-w-sm text-xs text-[var(--color-muted-foreground)]">
          {sublabel}
        </p>
      )}
    </div>
  );
}
