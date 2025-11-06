import React, { useState } from "react";
import { MoreVertical, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { TaskCard } from "./task-card";
import type {
  TaskWithDetails,
  ProjectStatus,
  TasksByStatus,
} from "../entity";

interface TaskBoardProps {
  tasksByStatus: TasksByStatus;
  statuses: ProjectStatus[];
  tasksWithDetails: TaskWithDetails[];
  onTaskClick: (task: TaskWithDetails) => void;
  onDeleteTask: (taskId: string) => void;
  onCreateTask: (statusId: string) => void;
  onTaskUpdate?: (taskId: string, updates: { assigneeId?: string; statusId?: string }) => void;
  loading?: boolean;
  currentUserId?: string;
  projectId: string;
}

// Draggable Task Card Wrapper
function DraggableTaskCard({
  task,
  onClick,
  onDelete,
  currentUserId,
  projectId,
}: {
  task: TaskWithDetails;
  onClick: () => void;
  onDelete: () => void;
  currentUserId?: string;
  projectId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
      }
    : { cursor: 'grab' };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      <TaskCard
        task={task}
        onClick={onClick}
        onDelete={onDelete}
        currentUserId={currentUserId}
        projectId={projectId}
      />
    </div>
  );
}

// Droppable Column Wrapper
function DroppableColumn({
  statusId,
  children,
  isOver,
}: {
  statusId: string;
  children: React.ReactNode;
  isOver?: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: statusId,
    data: { statusId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`space-y-3 min-h-[100px] transition-colors ${
        isOver ? "bg-gray-50 rounded-lg p-2" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function TaskBoard({
  tasksByStatus,
  statuses,
  tasksWithDetails,
  onTaskClick,
  onDeleteTask,
  onCreateTask,
  onTaskUpdate,
  loading,
  currentUserId,
  projectId,
}: TaskBoardProps) {
  const [activeTask, setActiveTask] = useState<TaskWithDetails | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start dragging
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = active.data.current?.task as TaskWithDetails;
    setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveTask(null);
      return;
    }

    const taskId = active.id as string;
    const newStatusId = over.id as string;
    const task = active.data.current?.task as TaskWithDetails;

    // Only update if status changed
    if (task.statusId !== newStatusId && onTaskUpdate) {
      onTaskUpdate(taskId, { statusId: newStatusId });
    }

    setActiveTask(null);
  };

  if (loading) {
    return (
      <div className="flex gap-6 overflow-x-auto pb-4 px-4">
        {[1, 2, 3, 4].map((column) => (
          <div key={column} className="flex-shrink-0 w-72">
            {/* Column Header Skeleton */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Skeleton className="w-24 h-5" />
                <Skeleton className="w-6 h-5 rounded-full" />
              </div>
              <Skeleton className="w-6 h-6 rounded" />
            </div>

            {/* Task Cards Skeleton */}
            <div className="space-y-3">
              {[1, 2].map((task) => (
                <div key={task} className="bg-white rounded border p-3">
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4 mb-3" />
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="w-16 h-5 rounded" />
                    <Skeleton className="w-5 h-5 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full mb-2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (statuses.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No statuses found for this project</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex gap-6 overflow-x-auto pb-4 px-4">
        {statuses.map((status) => {
          const tasksWithDetailsForStatus = tasksWithDetails.filter((t) => t.statusId === status.id);

          return (
            <div
              key={status.id}
              className="flex-shrink-0 w-72"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">
                    {status.name}
                  </h3>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                    {tasksWithDetailsForStatus.length}
                  </span>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                    >
                      <MoreVertical size={16} className="text-gray-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onCreateTask(status.id)}>
                      Add task
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Droppable Task Cards */}
              <DroppableColumn statusId={status.id}>
                {tasksWithDetailsForStatus.map((task) => (
                  <DraggableTaskCard
                    key={task.id}
                    task={task}
                    onClick={() => onTaskClick(task)}
                    onDelete={() => onDeleteTask(task.id)}
                    currentUserId={currentUserId}
                    projectId={projectId}
                  />
                ))}

                {/* Add Task Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCreateTask(status.id)}
                  className="w-full justify-start text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-2 border-dashed border-gray-200"
                >
                  <Plus size={16} className="mr-1" />
                  Add task
                </Button>
              </DroppableColumn>
            </div>
          );
        })}
      </div>

      {/* Drag Overlay - shows the task while dragging */}
      <DragOverlay>
        {activeTask ? (
          <div className="w-72 opacity-90">
            <TaskCard
              task={activeTask}
              onClick={() => {}}
              onDelete={() => {}}
              currentUserId={currentUserId}
              projectId={projectId}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
