import React from "react";
import { Paperclip, MoreVertical } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { TaskStopwatch } from "./task-stopwatch";
import type { TaskWithDetails } from "../entity";

interface TaskCardProps {
  task: TaskWithDetails;
  onClick: () => void;
  onDelete: () => void;
  currentUserId?: string;
  projectId: string;
}

export function TaskCard({ task, onClick, onDelete, currentUserId, projectId }: TaskCardProps) {
  const formatDate = (date: any) => {
    if (!date) return "";
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/');
    } catch {
      return "";
    }
  };

  const startDate = task.estimatedStartDate ? formatDate(task.estimatedStartDate) : "";
  const endDate = task.estimatedEndDate || task.dueDate ? formatDate(task.estimatedEndDate || task.dueDate) : "";
  const dateRange = startDate && endDate ? `${startDate} ${endDate}` : startDate || endDate;

  return (
    <div
      className="relative bg-white rounded border border-gray-200 p-3 hover:shadow-sm transition-shadow cursor-pointer group"
      onClick={onClick}
    >
      {/* Title */}
      <h4 className="text-sm font-medium text-gray-900 mb-2 pr-6">
        {task.title}
      </h4>

      {/* Status Badge and User Avatar */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{
            backgroundColor: task.status?.color ? `${task.status.color}15` : '#f3f4f6',
            color: task.status?.color || '#6b7280'
          }}
        >
          {task.status?.name || 'No Status'}
        </span>

        {task.assignee && (
          <div className="flex items-center">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium text-white"
              style={{ backgroundColor: '#3b82f6' }}
            >
              {task.assignee.displayName?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
        )}
      </div>

      {/* Notes Placeholder */}
      <p className="text-xs text-gray-400 mb-2">
        Enter notes...
      </p>

      {/* Date Range and Labels */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {dateRange && (
          <span className="text-xs text-gray-600">
            {dateRange}
          </span>
        )}

        {task.labels && task.labels.length > 0 && task.labels.map((label) => (
          <span
            key={label.id}
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: `${label.color}20`,
              color: label.color,
            }}
          >
            {label.name}
          </span>
        ))}
      </div>

      {/* Timer */}
      {currentUserId && (
        <div className="mb-2" onClick={(e) => e.stopPropagation()}>
          <TaskStopwatch
            taskId={task.id}
            taskTitle={task.title}
            projectId={projectId}
            isAssignedToMe={task.assigneeId === currentUserId}
            variant="compact"
          />
        </div>
      )}

      {/* Attachments (if any) - placeholder for now */}
      {task.description && (
        <div className="flex items-center gap-1 mb-2">
          <Paperclip size={12} className="text-gray-400" />
          <span className="text-xs text-gray-500">1</span>
        </div>
      )}

      {/* Description/Subtitle */}
      {task.description && (
        <p className="text-xs text-gray-600 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* More Actions Button (visible on hover) */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
            >
              <MoreVertical size={14} className="text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
