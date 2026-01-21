# Notifications Module

Comprehensive notification system with webhook provider integrations (Discord, WhatsApp, Slack, Telegram).

## Features

- ✅ In-app notifications
- ✅ Real-time updates with Firestore subscriptions
- ✅ Webhook integrations (Discord, WhatsApp, Slack, Telegram)
- ✅ Flexible webhook URL configuration (global or per-event)
- ✅ Event filtering and routing
- ✅ Read/unread status tracking
- ✅ Notification priority levels
- ✅ Rich notification types
- ✅ User preferences and settings

## Structure

```
notifications/
├── entity.ts                 # TypeScript interfaces and types
├── services.ts               # Firestore operations and webhook delivery
├── hooks.ts                  # React hooks for data fetching
├── hooks/
│   └── use-provider-hooks.ts # Hooks for provider configuration
├── components/
│   ├── notification-item.tsx           # Single notification display
│   ├── notification-list.tsx           # List of notifications with filters
│   ├── notification-bell.tsx           # Navbar notification icon with popover
│   └── provider-settings-form.tsx      # Webhook provider configuration form
├── page.tsx                  # Main notifications page
└── README.md                 # This file
```

## Usage

### 1. Display Notifications in Navbar

```tsx
import { NotificationBell } from "@/features/notifications/components/notification-bell";

export function Navbar() {
  return (
    <nav>
      {/* Other nav items */}
      <NotificationBell />
    </nav>
  );
}
```

### 2. Display Notification List

```tsx
import { NotificationList } from "@/features/notifications/components/notification-list";

export function NotificationsPage() {
  return (
    <div className="container">
      <h1>Notifications</h1>
      <NotificationList />
    </div>
  );
}
```

### 3. Create a Notification

```tsx
import { useNotificationMutations } from "@/features/notifications/hooks";

function TaskAssignedHandler() {
  const mutations = useNotificationMutations();

  const handleTaskAssigned = async (taskId: string, userId: string) => {
    await mutations.create({
      type: "task_assigned",
      priority: "high",
      title: "New Task Assigned",
      message: "You have been assigned to a new task",
      referenceId: taskId,
      referenceType: "task",
      actions: [
        {
          label: "View Task",
          url: `/tasks/${taskId}`,
        },
      ],
    });
  };

  return <button onClick={() => handleTaskAssigned("task-123", "user-456")}>Assign Task</button>;
}
```

### 4. Configure Webhook Providers

Users can configure webhook providers through the UI at `/notifications` page under the "Providers" tab.

**Programmatically:**

```tsx
import { useProviderMutations } from "@/features/notifications/hooks";

function ConfigureDiscord() {
  const providerMutations = useProviderMutations();

  const handleSetupDiscord = async () => {
    await providerMutations.create({
      name: "Team Discord Server",
      description: "Main team Discord server",
      provider: "discord",
      webhookUrl: "https://discord.com/api/webhooks/...",
      useGlobalUrl: true, // Use same URL for all events
      enabledEvents: [
        "task_assigned",
        "task_completed",
        "deadline_reminder",
      ],
    });
  };

  return <button onClick={handleSetupDiscord}>Setup Discord</button>;
}
```

### 5. Send Notification to Webhooks

When creating a notification, it will automatically be sent to configured webhook providers if:
- The provider is enabled
- The notification type is in the provider's `enabledEvents`

**Manual webhook delivery:**

```tsx
import { sendToWebhook } from "@/features/notifications/services";

const notification = {
  /* notification data */
};
const providerConfig = {
  /* provider config */
};

await sendToWebhook(notification, providerConfig);
```

## Notification Types

```typescript
enum NotificationType {
  INFO = "info",
  SUCCESS = "success",
  WARNING = "warning",
  ERROR = "error",
  TASK_ASSIGNED = "task_assigned",
  TASK_UPDATED = "task_updated",
  TASK_COMPLETED = "task_completed",
  PROJECT_INVITE = "project_invite",
  COMMENT_MENTION = "comment_mention",
  DEADLINE_REMINDER = "deadline_reminder",
  SYSTEM = "system",
}
```

## Priority Levels

```typescript
enum NotificationPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent",
}
```

## Provider Configuration

### Discord

```typescript
{
  provider: "discord",
  webhookUrl: "https://discord.com/api/webhooks/...",
  useGlobalUrl: true, // or false for per-event URLs
  webhookUrlPerEvent: {
    task_assigned: "https://discord.com/api/webhooks/.../channel-1",
    deadline_reminder: "https://discord.com/api/webhooks/.../channel-2",
  },
  enabledEvents: ["task_assigned", "task_completed"]
}
```

**Discord Webhook Setup:**
1. Go to Server Settings → Integrations
2. Click "Create Webhook"
3. Copy the webhook URL

### WhatsApp

```typescript
{
  provider: "whatsapp",
  webhookUrl: "https://api.twilio.com/...", // Or your WhatsApp webhook provider
  useGlobalUrl: true,
  enabledEvents: ["task_assigned", "deadline_reminder"]
}
```

### Slack

```typescript
{
  provider: "slack",
  webhookUrl: "https://hooks.slack.com/services/...",
  useGlobalUrl: true,
  enabledEvents: ["project_invite", "task_completed"]
}
```

## Hooks API

### useNotifications(filter?)

Fetch and subscribe to notifications with real-time updates.

```tsx
const { notifications, loading, error } = useNotifications({
  status: "unread",
  type: "task_assigned",
  limit: 10,
});
```

### useUnreadCount()

Get count of unread notifications.

```tsx
const { count, loading } = useUnreadCount();
```

### useNotificationMutations()

CRUD operations for notifications.

```tsx
const mutations = useNotificationMutations();

// Create
await mutations.create({ ...data });

// Update
await mutations.update(id, { ...data });

// Mark as read/unread
await mutations.markAsRead(id);
await mutations.markAsUnread(id);

// Delete
await mutations.remove(id);

// Bulk operations
await mutations.markAllAsRead();
await mutations.deleteAllRead();
```

### useProviderConfigs()

Fetch webhook provider configurations.

```tsx
const { configs, loading, error } = useProviderConfigs();
```

### useProviderMutations()

CRUD operations for provider configurations.

```tsx
const providerMutations = useProviderMutations();

// Create
await providerMutations.create({ ...data });

// Update
await providerMutations.update(id, { ...data });

// Delete
await providerMutations.remove(id);
```

## Firestore Collections

### notifications

```
{
  id: string
  userId: string
  orgId: string
  type: NotificationType
  priority: NotificationPriority
  status: "unread" | "read" | "archived"
  title: string
  message: string
  icon?: string
  referenceId?: string
  referenceType?: string
  actions?: NotificationAction[]
  senderId?: string
  metadata?: Record<string, any>
  createdAt: Timestamp
  updatedAt: Timestamp
  readAt?: Timestamp
  archivedAt?: Timestamp
  channels?: ("app" | "email" | "push")[]
}
```

### notificationProviderConfigs

```
{
  id: string
  userId: string
  orgId: string
  provider: "discord" | "whatsapp" | "slack" | "telegram"
  enabled: boolean
  webhookUrl: string
  webhookUrlPerEvent?: Record<NotificationType, string>
  useGlobalUrl: boolean
  enabledEvents: NotificationType[]
  name: string
  description?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

## Best Practices

1. **Use appropriate notification types** - Choose the correct type for better categorization
2. **Set proper priority** - Use priority levels to indicate urgency
3. **Include reference data** - Add referenceId and referenceType for linking
4. **Add actions** - Provide quick action buttons for better UX
5. **Configure webhooks wisely** - Only enable events you need to avoid spam
6. **Test webhooks** - Always test webhook URLs before enabling in production

## Future Enhancements

- [ ] Email notification delivery
- [ ] Push notifications (Web Push API)
- [ ] Notification templates
- [ ] Scheduled notifications
- [ ] Notification groups/channels
- [ ] Advanced filtering and search
- [ ] Export notification history
- [ ] Analytics and statistics
