import React from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Bell,
  Clock,
  MessageSquare,
  FileText,
  Users,
} from "lucide-react";
import { cn } from "@radas/config/lib/utils";
import { Button } from "@radas/ui/ui/button";
import type { Notification, NotificationType } from "../entity";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead?: (id: string) => void;
  onMarkAsUnread?: (id: string) => void;
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
  onClick?: (notification: Notification) => void;
}

const typeIcons: Record<NotificationType, React.ReactNode> = {
  info: <Info size={18} className="text-blue-500" />,
  success: <CheckCircle2 size={18} className="text-green-500" />,
  warning: <AlertTriangle size={18} className="text-yellow-500" />,
  error: <XCircle size={18} className="text-red-500" />,
  task_assigned: <FileText size={18} className="text-purple-500" />,
  task_updated: <FileText size={18} className="text-blue-500" />,
  task_completed: <CheckCircle2 size={18} className="text-green-500" />,
  project_invite: <Users size={18} className="text-indigo-500" />,
  comment_mention: <MessageSquare size={18} className="text-orange-500" />,
  deadline_reminder: <Clock size={18} className="text-red-500" />,
  system: <Bell size={18} className="text-gray-500" />,
};

export function NotificationItem({
  notification,
  onMarkAsRead,
  onMarkAsUnread,
  onDelete,
  onArchive,
  onClick,
}: NotificationItemProps) {
  const isUnread = notification.status === "unread";

  const handleClick = () => {
    if (onClick) {
      onClick(notification);
    }
    if (isUnread && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }
  };

  const timeAgo = notification.createdAt
    ? formatDistanceToNow(notification.createdAt.toDate(), { addSuffix: true })
    : "";

  return (
    <div
      className={cn(
        "flex gap-3 p-4 border-b hover:bg-accent/50 transition-colors cursor-pointer",
        isUnread && "bg-blue-50/50 dark:bg-blue-950/20"
      )}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-1">
        {notification.icon
          ? notification.icon
          : typeIcons[notification.type] || typeIcons.info}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                "text-sm font-medium mb-1 truncate",
                isUnread && "font-semibold"
              )}
            >
              {notification.title}
            </h4>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {notification.message}
            </p>

            {/* Time */}
            <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
          </div>

          {/* Unread indicator */}
          {isUnread && (
            <div className="flex-shrink-0">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
            </div>
          )}
        </div>

        {/* Actions */}
        {notification.actions && notification.actions.length > 0 && (
          <div className="flex gap-2 mt-2">
            {notification.actions.map((action, index) => (
              <Button
                key={index}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  if (action.url) {
                    window.open(action.url, "_blank");
                  }
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex-shrink-0 flex gap-1" onClick={(e) => e.stopPropagation()}>
        {isUnread && onMarkAsRead && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            title="Mark as read"
            onClick={() => onMarkAsRead(notification.id)}
          >
            <CheckCircle2 size={16} />
          </Button>
        )}

        {!isUnread && onMarkAsUnread && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            title="Mark as unread"
            onClick={() => onMarkAsUnread(notification.id)}
          >
            <Bell size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}
