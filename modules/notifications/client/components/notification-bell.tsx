import React, { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@radas/ui/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@radas/ui/ui/popover";
import { ScrollArea } from "@radas/ui/ui/scroll-area";
import { NotificationItem } from "./notification-item";
import { useNotifications, useUnreadCount, useNotificationMutations } from "../hooks";
import { NotificationStatus } from "../entity";

interface NotificationBellProps {
  onViewAll?: () => void;
}

export function NotificationBell({ onViewAll }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  // Show notifications from all projects (no projectId filter)
  const { count } = useUnreadCount();
  const { notifications, loading } = useNotifications(undefined, {
    status: NotificationStatus.UNREAD,
    limit: 5,
  });
  const mutations = useNotificationMutations();

  const handleViewAll = () => {
    setOpen(false);
    if (onViewAll) {
      onViewAll();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell size={20} />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {count > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => mutations.markAllAsRead()}
            >
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-96">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center p-4">
              <Bell size={32} className="text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No new notifications
              </p>
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={mutations.markAsRead}
                  onClick={() => setOpen(false)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-2 border-t">
          <Button
            variant="ghost"
            className="w-full"
            size="sm"
            onClick={handleViewAll}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
