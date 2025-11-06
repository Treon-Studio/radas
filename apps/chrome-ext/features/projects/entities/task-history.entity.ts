import type { Timestamp } from "firebase/firestore";

export type TaskHistoryEventType =
  | "created"
  | "status_changed"
  | "assignee_changed"
  | "priority_changed"
  | "title_changed"
  | "description_changed"
  | "due_date_changed"
  | "estimated_dates_changed"
  | "epic_changed"
  | "labels_changed"
  | "time_entry_added"
  | "time_entry_deleted"
  | "comment_added"
  | "attachment_added"
  | "attachment_removed";

export interface TaskHistoryEvent {
  id: string;
  taskId: string;
  projectId: string;
  eventType: TaskHistoryEventType;
  userId: string; // User who made the change
  userName?: string; // Cached user name for display
  userPhotoURL?: string; // Cached user photo for display

  // Previous and new values
  previousValue?: any;
  newValue?: any;

  // Additional context
  description?: string; // Human-readable description
  metadata?: Record<string, any>; // Additional data

  createdAt: Timestamp;
}

export interface TaskHistoryDto {
  taskId: string;
  projectId: string;
  eventType: TaskHistoryEventType;
  userId: string;
  userName?: string;
  userPhotoURL?: string;
  previousValue?: any;
  newValue?: any;
  description?: string;
  metadata?: Record<string, any>;
}

// Helper type for history display
export interface TaskHistoryWithDetails extends TaskHistoryEvent {
  formattedDescription: string;
  icon: string;
  color: string;
}

// Constants for history event labels
export const TASK_HISTORY_EVENT_LABELS: Record<TaskHistoryEventType, string> = {
  created: "Task Created",
  status_changed: "Status Changed",
  assignee_changed: "Assignee Changed",
  priority_changed: "Priority Changed",
  title_changed: "Title Changed",
  description_changed: "Description Changed",
  due_date_changed: "Due Date Changed",
  estimated_dates_changed: "Estimated Dates Changed",
  epic_changed: "Epic Changed",
  labels_changed: "Labels Changed",
  time_entry_added: "Time Entry Added",
  time_entry_deleted: "Time Entry Deleted",
  comment_added: "Comment Added",
  attachment_added: "Attachment Added",
  attachment_removed: "Attachment Removed",
};

// Constants for history event colors
export const TASK_HISTORY_EVENT_COLORS: Record<TaskHistoryEventType, string> = {
  created: "text-green-600",
  status_changed: "text-blue-600",
  assignee_changed: "text-purple-600",
  priority_changed: "text-orange-600",
  title_changed: "text-gray-600",
  description_changed: "text-gray-600",
  due_date_changed: "text-red-600",
  estimated_dates_changed: "text-red-600",
  epic_changed: "text-indigo-600",
  labels_changed: "text-pink-600",
  time_entry_added: "text-green-600",
  time_entry_deleted: "text-red-600",
  comment_added: "text-blue-600",
  attachment_added: "text-gray-600",
  attachment_removed: "text-gray-600",
};
