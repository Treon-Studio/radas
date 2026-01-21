import React from "react";
import { NotificationBell } from "@radas/module-notifications/components/notification-bell";

interface AppHeaderProps {
  onNavigateToNotifications?: () => void;
}

export function AppHeader({ onNavigateToNotifications }: AppHeaderProps) {
  return (
    <div className="w-full bg-background border-b px-3 py-2 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold">Radas</h1>
      </div>

      <div className="flex items-center gap-1">
        <NotificationBell onViewAll={onNavigateToNotifications} />
      </div>
    </div>
  );
}
