import React from "react";
import type { User } from "@/shared/contexts/auth-context";

interface AssigneeAvatarProps {
  user: User | undefined;
  size?: "sm" | "md" | "lg";
}

export function AssigneeAvatar({ user, size = "md" }: AssigneeAvatarProps) {
  const sizeClasses = {
    sm: "w-5 h-5 text-xs",
    md: "w-6 h-6 text-sm",
    lg: "w-8 h-8 text-base",
  };

  if (!user) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-medium`}
      >
        ?
      </div>
    );
  }

  const initial = user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || 'U';
  const colors = [
    '#ef4444', // red
    '#f59e0b', // amber
    '#10b981', // emerald
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
  ];

  // Generate color based on email
  const colorIndex = user.email ? user.email.charCodeAt(0) % colors.length : 0;
  const backgroundColor = colors[colorIndex];

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center text-white font-medium`}
      style={{ backgroundColor }}
      title={user.displayName || user.email}
    >
      {initial}
    </div>
  );
}
