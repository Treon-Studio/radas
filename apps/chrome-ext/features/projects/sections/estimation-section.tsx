import React, { useState, useMemo } from "react";
import { Plus, Clock, TrendingUp, TrendingDown, Edit, Trash2, Calendar } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { TimeEntryFormDialog } from "../components/time-entry-form-dialog";
import {
  useProjectWithData,
  useProjectTimeEntries,
  useTimeEntryMutations,
} from "../hooks";
import type { TimeEntry, CreateTimeEntryDto } from "../entity";
import { getTaskTimeTracking, getProjectTimeTracking } from "../services";
import { toast } from "sonner";

interface EstimationSectionProps {
  projectId: string;
}

export function EstimationSection({ projectId }: EstimationSectionProps) {
  const [timeEntryDialogOpen, setTimeEntryDialogOpen] = useState(false);
  const [editingTimeEntry, setEditingTimeEntry] = useState<TimeEntry | undefined>();
  const [defaultTaskId, setDefaultTaskId] = useState<string | undefined>();
  const [deletingEntryId, setDeletingEntryId] = useState<string | undefined>();

  const { tasks, tasksWithDetails, loading: tasksLoading } = useProjectWithData(projectId);
  const { timeEntries, loading: entriesLoading } = useProjectTimeEntries(projectId);
  const timeEntryMutations = useTimeEntryMutations();

  // Calculate project time tracking
  const projectTracking = useMemo(() => {
    return getProjectTimeTracking(tasks, timeEntries);
  }, [tasks, timeEntries]);

  // Calculate task time tracking
  const tasksWithTimeTracking = useMemo(() => {
    return tasks.map((task) => {
      const taskEntries = timeEntries.filter((e) => e.taskId === task.id);
      return {
        task,
        tracking: getTaskTimeTracking(task, taskEntries),
      };
    }).filter((t) => t.task.estimatedHours || t.tracking.totalLoggedHours > 0);
  }, [tasks, timeEntries]);

  // Sort time entries by date (newest first)
  const sortedTimeEntries = useMemo(() => {
    return [...timeEntries].sort((a, b) => {
      const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
      const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });
  }, [timeEntries]);

  // Handlers
  const handleAddTimeEntry = (taskId?: string) => {
    setEditingTimeEntry(undefined);
    setDefaultTaskId(taskId);
    setTimeEntryDialogOpen(true);
  };

  const handleEditTimeEntry = (entry: TimeEntry) => {
    setEditingTimeEntry(entry);
    setDefaultTaskId(undefined);
    setTimeEntryDialogOpen(true);
  };

  const handleDeleteTimeEntry = async (entryId: string) => {
    const result = await timeEntryMutations.remove(entryId);
    if (result.success) {
      toast.success("Time entry deleted");
      setDeletingEntryId(undefined);
    } else {
      toast.error("Failed to delete time entry");
    }
  };

  const handleSubmitTimeEntry = async (data: CreateTimeEntryDto) => {
    try {
      if (editingTimeEntry) {
        const result = await timeEntryMutations.update(editingTimeEntry.id, data);
        if (result.success) {
          toast.success("Time entry updated");
          handleCloseDialog();
        } else {
          toast.error("Failed to update time entry");
        }
      } else {
        const result = await timeEntryMutations.create(data);
        if (result.success) {
          toast.success("Time logged successfully");
          handleCloseDialog();
        } else {
          toast.error("Failed to log time");
        }
      }
    } catch (error) {
      console.error("Error submitting time entry:", error);
      toast.error("An error occurred");
    }
  };

  const handleCloseDialog = () => {
    setTimeEntryDialogOpen(false);
    setEditingTimeEntry(undefined);
    setDefaultTaskId(undefined);
  };

  const formatDate = (date: any): string => {
    if (!date) return "";
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  const formatTime = (decimalHours: number): string => {
    const totalSeconds = Math.round(decimalHours * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const loading = tasksLoading || entriesLoading;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading time tracking...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-background">
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={() => handleAddTimeEntry()}>
            <Plus size={14} className="mr-1" />
            Log Time
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Summary Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Estimated */}
            <div className="p-4 border rounded-lg bg-background">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-blue-500" />
                <span className="text-sm font-medium">Estimated</span>
              </div>
              <div className="text-2xl font-bold">
                {projectTracking.totalEstimatedHours.toFixed(1)}h
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {projectTracking.tasksWithTime} of {projectTracking.totalTasks} tasks
              </p>
            </div>

            {/* Total Logged */}
            <div className="p-4 border rounded-lg bg-background">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={16} className="text-green-500" />
                <span className="text-sm font-medium">Logged</span>
              </div>
              <div className="text-2xl font-bold">
                {projectTracking.totalLoggedHours.toFixed(1)}h
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                From {timeEntries.length} {timeEntries.length !== 1 ? "entries" : "entry"}
              </p>
            </div>

            {/* Variance */}
            <div className="p-4 border rounded-lg bg-background">
              <div className="flex items-center gap-2 mb-2">
                {projectTracking.variance >= 0 ? (
                  <TrendingUp size={16} className="text-orange-500" />
                ) : (
                  <TrendingDown size={16} className="text-green-500" />
                )}
                <span className="text-sm font-medium">Variance</span>
              </div>
              <div className={`text-2xl font-bold ${
                projectTracking.variance > 0 ? "text-orange-500" : "text-green-500"
              }`}>
                {projectTracking.variance > 0 ? "+" : ""}
                {projectTracking.variance.toFixed(1)}h
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {projectTracking.variance > 0 ? "Over estimate" : projectTracking.variance < 0 ? "Under estimate" : "On track"}
              </p>
            </div>
          </div>

          {/* Tasks with Time Tracking */}
          {tasksWithTimeTracking.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3">Tasks Overview</h4>
              <div className="space-y-2">
                {tasksWithTimeTracking.map(({ task, tracking }) => (
                  <div key={task.id} className="p-4 border rounded-lg bg-background">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h5 className="font-medium text-sm">{task.title}</h5>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span>Est: {tracking.estimatedHours || 0}h</span>
                          <span>Logged: {tracking.totalLoggedHours.toFixed(1)}h</span>
                          <span className={tracking.variance > 0 ? "text-orange-500" : "text-green-500"}>
                            {tracking.variance > 0 ? "+" : ""}{tracking.variance.toFixed(1)}h
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddTimeEntry(task.id)}
                        className="h-8"
                      >
                        <Plus size={14} className="mr-1" />
                        Log
                      </Button>
                    </div>

                    {/* Progress Bar */}
                    {tracking.estimatedHours && tracking.estimatedHours > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-medium">{tracking.percentComplete}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              tracking.percentComplete > 100 ? "bg-orange-500" : "bg-primary"
                            }`}
                            style={{ width: `${Math.min(tracking.percentComplete, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Time Entries */}
          <div>
            <h4 className="font-semibold mb-3">Recent Entries</h4>
            {sortedTimeEntries.length === 0 ? (
              <div className="text-center py-12 border rounded-lg bg-muted/30">
                <Clock size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No time entries yet</p>
                <Button onClick={() => handleAddTimeEntry()}>
                  <Plus size={16} className="mr-2" />
                  Log Your First Entry
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedTimeEntries.map((entry) => {
                  const task = tasks.find((t) => t.id === entry.taskId);
                  return (
                    <div
                      key={entry.id}
                      className="p-3 border rounded-lg bg-background hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{task?.title || "Unknown Task"}</div>
                          {entry.description && (
                            <p className="text-xs text-muted-foreground mt-1">{entry.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{formatDate(entry.date)}</span>
                            <span className="font-medium">{formatTime(entry.hours)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditTimeEntry(entry)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeletingEntryId(entry.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Time Entry Form Dialog */}
      <TimeEntryFormDialog
        open={timeEntryDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseDialog();
          else setTimeEntryDialogOpen(open);
        }}
        projectId={projectId}
        tasks={tasks}
        timeEntry={editingTimeEntry}
        defaultTaskId={defaultTaskId}
        onSubmit={handleSubmitTimeEntry}
        loading={timeEntryMutations.loading}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingEntryId}
        onOpenChange={(open) => !open && setDeletingEntryId(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this time entry. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingEntryId && handleDeleteTimeEntry(deletingEntryId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
