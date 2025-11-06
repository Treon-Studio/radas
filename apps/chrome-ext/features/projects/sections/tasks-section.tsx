import React, { useState, useMemo } from "react";
import { LayoutGrid, GanttChart, Calendar } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { TaskFormDialog } from "../components/task-form-dialog";
import { TaskBoard } from "../components/task-board";
import { TaskTimeline } from "../components/task-timeline";
import { TaskCalendar } from "../components/task-calendar";
import {
  useProjectWithData,
  useTaskMutations,
} from "../hooks";
import { useAutoStopTimer } from "../hooks/use-auto-stop-timer";
import { useAuth } from "@/shared/contexts/auth-context";
import type { Task, CreateTaskDto, TaskWithDetails, TaskType } from "../entity";
import { TaskType as TaskTypeEnum, TASK_TYPE_LABELS } from "../entity";
import { toast } from "sonner";

interface TasksSectionProps {
  projectId: string;
}

type ViewMode = "board" | "timeline" | "calendar";

export function TasksSection({ projectId }: TasksSectionProps) {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [defaultStatusId, setDefaultStatusId] = useState<string | undefined>();

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterEpic, setFilterEpic] = useState<string>("all");
  const [filterLabel, setFilterLabel] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const {
    tasks,
    epics,
    statuses,
    labels,
    priorities,
    tasksByStatus,
    tasksWithDetails,
    loading,
  } = useProjectWithData(projectId);

  const taskMutations = useTaskMutations();

  // Auto-stop timer when task is reassigned
  useAutoStopTimer(tasks);

  // Filtered tasks
  const filteredTasksWithDetails = useMemo(() => {
    let filtered = [...tasksWithDetails];

    // Search by title
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((task) =>
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter((task) => task.type === filterType);
    }

    // Filter by priority
    if (filterPriority !== "all") {
      filtered = filtered.filter((task) => task.priorityId === filterPriority);
    }

    // Filter by epic
    if (filterEpic !== "all") {
      if (filterEpic === "none") {
        filtered = filtered.filter((task) => !task.epicId);
      } else {
        filtered = filtered.filter((task) => task.epicId === filterEpic);
      }
    }

    // Filter by label
    if (filterLabel !== "all") {
      filtered = filtered.filter((task) => task.labelIds?.includes(filterLabel));
    }

    return filtered;
  }, [tasksWithDetails, searchQuery, filterType, filterPriority, filterEpic, filterLabel]);

  // Group filtered tasks by status
  const filteredTasksByStatus = useMemo(() => {
    const grouped: Record<string, TaskWithDetails[]> = {};

    statuses.forEach((status) => {
      grouped[status.id] = [];
    });

    filteredTasksWithDetails.forEach((task) => {
      if (grouped[task.statusId]) {
        grouped[task.statusId].push(task);
      }
    });

    return grouped;
  }, [filteredTasksWithDetails, statuses]);

  // Check if any filters are active
  const hasActiveFilters = searchQuery.trim() || filterType !== "all" ||
    filterPriority !== "all" || filterEpic !== "all" || filterLabel !== "all";

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery("");
    setFilterType("all");
    setFilterPriority("all");
    setFilterEpic("all");
    setFilterLabel("all");
  };

  // Handlers
  const handleAddTask = (statusId?: string) => {
    setEditingTask(undefined);
    setDefaultStatusId(statusId);
    setTaskDialogOpen(true);
  };

  const handleEditTask = (task: TaskWithDetails) => {
    setEditingTask(task);
    setDefaultStatusId(undefined);
    setTaskDialogOpen(true);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Delete this task?")) return;

    const result = await taskMutations.remove(taskId);
    if (result.success) {
      toast.success("Task deleted successfully");
    } else {
      toast.error("Failed to delete task");
    }
  };

  const handleSubmitTask = async (data: CreateTaskDto) => {
    try {
      if (editingTask) {
        const result = await taskMutations.update(editingTask.id, data);
        if (result.success) {
          toast.success("Task updated successfully");
          handleCloseTaskDialog();
        } else {
          toast.error("Failed to update task");
        }
      } else {
        const result = await taskMutations.create(data);
        if (result.success) {
          toast.success("Task created successfully");
          handleCloseTaskDialog();
        } else {
          toast.error("Failed to create task");
        }
      }
    } catch (error) {
      console.error("Error submitting task:", error);
      toast.error("An error occurred");
    }
  };

  const handleCloseTaskDialog = () => {
    setTaskDialogOpen(false);
    setEditingTask(undefined);
    setDefaultStatusId(undefined);
  };

  const handleTaskUpdate = async (taskId: string, updates: { assigneeId?: string; statusId?: string }) => {
    const result = await taskMutations.update(taskId, updates);
    if (result.success) {
      toast.success("Task updated successfully");
    } else {
      toast.error("Failed to update task");
    }
  };

  const taskFormStatusId = defaultStatusId || statuses.find((s) => s.isDefault)?.id || statuses[0]?.id || "";

  return (
    <div className="h-full flex flex-col">
      {/* View Switcher */}
      <div className="flex-shrink-0 px-4 py-3 border-b flex items-center gap-2">
        <Button
          size="sm"
          variant={viewMode === "board" ? "default" : "ghost"}
          onClick={() => setViewMode("board")}
        >
          <LayoutGrid size={16} className="mr-1" />
          Board
        </Button>
        <Button
          size="sm"
          variant={viewMode === "timeline" ? "default" : "ghost"}
          onClick={() => setViewMode("timeline")}
        >
          <GanttChart size={16} className="mr-1" />
          Timeline
        </Button>
        <Button
          size="sm"
          variant={viewMode === "calendar" ? "default" : "ghost"}
          onClick={() => setViewMode("calendar")}
        >
          <Calendar size={16} className="mr-1" />
          Calendar
        </Button>
      </div>

      {/* View Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "board" && (
          <div className="h-full overflow-auto p-4">
            <TaskBoard
              tasksByStatus={filteredTasksByStatus}
              statuses={statuses}
              tasksWithDetails={filteredTasksWithDetails}
              onTaskClick={handleEditTask}
              onDeleteTask={handleDeleteTask}
              onCreateTask={handleAddTask}
              onTaskUpdate={handleTaskUpdate}
              loading={loading}
              currentUserId={user?.uid}
              projectId={projectId}
            />
          </div>
        )}

        {viewMode === "timeline" && (
          <TaskTimeline
            tasks={filteredTasksWithDetails}
            onTaskClick={handleEditTask}
          />
        )}

        {viewMode === "calendar" && (
          <TaskCalendar
            tasks={filteredTasksWithDetails}
            onTaskClick={handleEditTask}
          />
        )}
      </div>

      {/* Task Dialog */}
      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseTaskDialog();
          else setTaskDialogOpen(open);
        }}
        projectId={projectId}
        statuses={statuses}
        priorities={priorities}
        labels={labels}
        epics={epics}
        task={editingTask}
        onSubmit={handleSubmitTask}
        loading={taskMutations.loading}
      />
    </div>
  );
}
