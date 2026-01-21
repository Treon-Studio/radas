import type { Timestamp } from "firebase/firestore";

// Notification types
export enum NotificationType {
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

// Notification priority
export enum NotificationPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent",
}

// Notification status
export enum NotificationStatus {
  UNREAD = "unread",
  READ = "read",
  ARCHIVED = "archived",
}

// Notification action
export interface NotificationAction {
  label: string;
  url?: string;
  action?: string;
}

// Main Notification interface
export interface Notification {
  id: string;
  userId: string; // User who receives the notification
  projectId: string; // Project this notification belongs to

  // Content
  type: NotificationType;
  priority: NotificationPriority;
  status: NotificationStatus;

  title: string;
  message: string;
  icon?: string;

  // Context/Reference
  referenceId?: string; // ID of related entity (task, project, etc.)
  referenceType?: string; // Type of reference (task, project, comment, etc.)

  // Actions
  actions?: NotificationAction[];

  // Metadata
  senderId?: string; // User who triggered the notification
  metadata?: Record<string, any>;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  readAt?: Timestamp;
  archivedAt?: Timestamp;

  // Delivery
  channels?: ("app" | "email" | "push")[]; // Delivery channels
  scheduled?: boolean;
  scheduledFor?: Timestamp;
}

// DTO for creating notification
export interface CreateNotificationDto {
  userId: string;
  projectId: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  icon?: string;
  referenceId?: string;
  referenceType?: string;
  actions?: NotificationAction[];
  senderId?: string;
  metadata?: Record<string, any>;
  channels?: ("app" | "email" | "push")[];
  scheduled?: boolean;
  scheduledFor?: Date;
}

// DTO for updating notification
export interface UpdateNotificationDto {
  status?: NotificationStatus;
  readAt?: Date;
  archivedAt?: Date;
}

// Filter for querying notifications
export interface NotificationFilter {
  userId?: string;
  projectId?: string;
  type?: NotificationType | NotificationType[];
  status?: NotificationStatus | NotificationStatus[];
  priority?: NotificationPriority | NotificationPriority[];
  referenceType?: string;
  unreadOnly?: boolean;
  limit?: number;
}

// Notification settings for user
export interface NotificationSettings {
  id: string;
  userId: string;
  projectId: string;

  // Channel preferences
  emailEnabled: boolean;
  pushEnabled: boolean;
  appEnabled: boolean;

  // Type preferences
  enabledTypes: NotificationType[];

  // Timing
  quietHoursStart?: string; // HH:mm format
  quietHoursEnd?: string; // HH:mm format

  // Frequency
  digestMode?: boolean; // Send digest instead of real-time
  digestFrequency?: "daily" | "weekly";

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// DTO for notification settings
export interface UpdateNotificationSettingsDto {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  appEnabled?: boolean;
  enabledTypes?: NotificationType[];
  quietHoursStart?: string;
  quietHoursEnd?: string;
  digestMode?: boolean;
  digestFrequency?: "daily" | "weekly";
}

// ============ Notification Providers (Webhooks) ============

export enum NotificationProvider {
  DISCORD = "discord",
  WHATSAPP = "whatsapp",
  SLACK = "slack",
  TELEGRAM = "telegram",
}

// Provider configuration for webhooks
export interface NotificationProviderConfig {
  id: string;
  userId: string;
  projectId: string;

  provider: NotificationProvider;
  enabled: boolean;

  // Webhook configuration
  webhookUrl: string;
  webhookUrlPerEvent?: Record<NotificationType, string>; // Optional: different URLs per event
  useGlobalUrl: boolean; // If true, use webhookUrl for all events

  // Event filters
  enabledEvents: NotificationType[]; // Which events to send to this provider

  // Metadata
  name: string; // User-friendly name for this configuration
  description?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// DTO for creating provider config
export interface CreateProviderConfigDto {
  userId: string;
  projectId: string;
  provider: NotificationProvider;
  webhookUrl: string;
  useGlobalUrl: boolean;
  webhookUrlPerEvent?: Record<NotificationType, string>;
  enabledEvents: NotificationType[];
  name: string;
  description?: string;
}

// DTO for updating provider config
export interface UpdateProviderConfigDto {
  enabled?: boolean;
  webhookUrl?: string;
  useGlobalUrl?: boolean;
  webhookUrlPerEvent?: Record<NotificationType, string>;
  enabledEvents?: NotificationType[];
  name?: string;
  description?: string;
}
