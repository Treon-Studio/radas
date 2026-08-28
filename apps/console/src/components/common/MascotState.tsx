import React from "react";
import { Button } from "@/components/ui/button";

export type MascotStateType =
  | "empty_projects"
  | "empty_deployments"
  | "empty_logs"
  | "empty_search"
  | "empty_inbox"
  | "empty_database"
  | "error_404"
  | "error_500"
  | "error_connection"
  | "error_access_denied"
  | "error_timeout"
  | "error_crash";

interface MascotStateProps {
  type: MascotStateType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "w-20 h-20 sm:w-24 sm:h-24",
  md: "w-28 h-28 sm:w-36 sm:h-36",
  lg: "w-40 h-40 sm:w-48 sm:h-48",
};

export function MascotState({
  type,
  title,
  description,
  actionLabel,
  onAction,
  className = "",
  size = "md",
}: MascotStateProps) {
  const imageSrc = `/images/states/${type}.webp`;

  return (
    <div className={`flex flex-col items-center justify-center text-center p-6 sm:p-8 space-y-4 ${className}`}>
      <div className="relative group cursor-pointer transition-transform hover:scale-105 active:scale-95 duration-200">
        <img
          src={imageSrc}
          alt={title}
          className={`${sizeClasses[size]} object-contain select-none pointer-events-none drop-shadow-sm`}
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      <div className="space-y-1.5 max-w-sm">
        <h3 className="font-pixel text-xs sm:text-sm text-[var(--color-foreground)] tracking-wide uppercase">
          {title}
        </h3>
        {description && (
          <p className="font-mono text-[11px] sm:text-xs text-[var(--color-muted-foreground)] leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          size="sm"
          className="mt-2 font-pixel text-[9px] uppercase tracking-wider"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
