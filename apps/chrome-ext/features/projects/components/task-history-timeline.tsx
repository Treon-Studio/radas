import React from "react";
import {
  Clock,
  User,
  ArrowRight,
  Tag,
  Calendar,
  Flag,
  FileText,
  MessageSquare,
  Paperclip,
  CheckCircle2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useTaskHistory } from "../hooks/use-task-history";
import type { TaskHistoryEvent, TaskHistoryEventType } from "../entities/task-history.entity";
import { formatDistanceToNow } from "date-fns";

interface TaskHistoryTimelineProps {
  taskId: string;
}

const EVENT_ICONS: Record<TaskHistoryEventType, React.ReactNode> = {
  created: <CheckCircle2 size={14} className="text-green-600" />,
  status_changed: <ArrowRight size={14} className="text-blue-600" />,
  assignee_changed: <User size={14} className="text-purple-600" />,
  priority_changed: <Flag size={14} className="text-orange-600" />,
  title_changed: <FileText size={14} className="text-gray-600" />,
  description_changed: <FileText size={14} className="text-gray-600" />,
  due_date_changed: <Calendar size={14} className="text-red-600" />,
  estimated_dates_changed: <Calendar size={14} className="text-red-600" />,
  epic_changed: <Tag size={14} className="text-indigo-600" />,
  labels_changed: <Tag size={14} className="text-pink-600" />,
  time_entry_added: <Clock size={14} className="text-green-600" />,
  time_entry_deleted: <Clock size={14} className="text-red-600" />,
  comment_added: <MessageSquare size={14} className="text-blue-600" />,
  attachment_added: <Paperclip size={14} className="text-gray-600" />,
  attachment_removed: <Paperclip size={14} className="text-gray-600" />,
};

function formatTimestamp(timestamp: any): string {
  try {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return "Unknown time";
  }
}

function HistoryEventItem({ event }: { event: TaskHistoryEvent }) {
  const initials = event.userName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <div className="flex gap-3 group">
      {/* Avatar */}
      <div className="flex-shrink-0">
        <Avatar className="h-8 w-8 border-2 border-background">
          <AvatarImage src={event.userPhotoURL} alt={event.userName} />
          <AvatarFallback className="text-xs bg-primary text-primary-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-start gap-2">
          {/* Event Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {EVENT_ICONS[event.eventType]}
          </div>

          {/* Event Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-medium">{event.userName || "Unknown"}</span>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(event.createdAt)}
              </span>
            </div>

            <p className="text-sm text-muted-foreground mt-0.5">
              {event.description}
            </p>

            {/* Show value changes for certain events */}
            {(event.eventType === "status_changed" ||
              event.eventType === "priority_changed" ||
              event.eventType === "assignee_changed") && (
              <div className="flex items-center gap-2 mt-2">
                {event.previousValue && (
                  <Badge variant="outline" className="text-xs">
                    {event.previousValue}
                  </Badge>
                )}
                {event.previousValue && event.newValue && (
                  <ArrowRight size={12} className="text-muted-foreground" />
                )}
                {event.newValue && (
                  <Badge variant="secondary" className="text-xs">
                    {event.newValue}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskHistoryTimeline({ taskId }: TaskHistoryTimelineProps) {
  const { history, loading, error } = useTaskHistory(taskId);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-destructive">Failed to load history</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock size={32} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-4 bottom-0 w-px bg-border" />

      {/* History events */}
      <div className="relative space-y-0">
        {history.map((event) => (
          <HistoryEventItem key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
