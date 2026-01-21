import React, { useState } from "react";
import { Bell, Inbox, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@radas/ui/ui/button";
import { ScrollArea } from "@radas/ui/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radas/ui/ui/tabs";
import { NotificationItem } from "./notification-item";
import { useNotifications, useNotificationMutations } from "../hooks";
import { NotificationStatus } from "../entity";

interface NotificationListProps {
  projectId?: string; // Optional - if not provided, shows all projects
}

export function NotificationList({ projectId }: NotificationListProps = {}) {
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");

  const statusFilter: NotificationStatus[] | undefined =
    activeTab === "unread" ? [NotificationStatus.UNREAD] : undefined;

  // Show notifications from specific project or all projects if projectId not provided
  const { notifications, loading } = useNotifications(projectId, {
    status: statusFilter,
    limit: 50,
  });

  const mutations = useNotificationMutations();

  const handleMarkAllAsRead = async () => {
    await mutations.markAllAsRead(projectId);
  };

  const handleDeleteAllRead = async () => {
    if (confirm("Delete all read notifications?")) {
      await mutations.deleteAllRead(projectId);
    }
  };

  const unreadCount = notifications.filter((n) => n.status === NotificationStatus.UNREAD).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell size={20} />
            Notifications
            {unreadCount > 0 && (
              <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </h2>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleMarkAllAsRead}
              disabled={mutations.loading}
            >
              <CheckCheck size={16} className="mr-1" />
              Mark all read
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDeleteAllRead}
            disabled={mutations.loading}
          >
            <Trash2 size={16} className="mr-1" />
            Clear read
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="all"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            All
          </TabsTrigger>
          <TabsTrigger
            value="unread"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            Unread {unreadCount > 0 && `(${unreadCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center p-8">
                <Inbox size={48} className="text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No notifications</h3>
                <p className="text-sm text-muted-foreground">
                  You're all caught up!
                </p>
              </div>
            ) : (
              <div>
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={mutations.markAsRead}
                    onMarkAsUnread={mutations.markAsUnread}
                    onDelete={mutations.remove}
                    onArchive={mutations.archive}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="unread" className="flex-1 mt-0">
          <ScrollArea className="h-full">
            {notifications.filter((n) => n.status === NotificationStatus.UNREAD).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center p-8">
                <CheckCheck size={48} className="text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">All caught up!</h3>
                <p className="text-sm text-muted-foreground">
                  No unread notifications
                </p>
              </div>
            ) : (
              <div>
                {notifications
                  .filter((n) => n.status === NotificationStatus.UNREAD)
                  .map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={mutations.markAsRead}
                      onMarkAsUnread={mutations.markAsUnread}
                      onDelete={mutations.remove}
                      onArchive={mutations.archive}
                    />
                  ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
