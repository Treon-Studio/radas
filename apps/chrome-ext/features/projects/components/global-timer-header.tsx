import React, { useState, useMemo } from "react";
import { Play, Pause, Square } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useTimer } from "../contexts/timer-context";
import { useProjectStatuses } from "../hooks";
import { cn } from "@/shared/lib/utils";

export function GlobalTimerHeader() {
  const { activeTimers, pauseTimer, resumeTimer, stopTimer, getElapsedTime, isTimerPaused } = useTimer();
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [stopDescription, setStopDescription] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState<string>("");

  // Get the first active timer
  const activeTimer = useMemo(() => {
    const timers = Array.from(activeTimers.entries());
    if (timers.length > 0) {
      const [taskId, timer] = timers[0];
      return { taskId, ...timer };
    }
    return null;
  }, [activeTimers]);

  // Get statuses for the active timer's project
  const { statuses, loading: statusesLoading } = useProjectStatuses(activeTimer?.projectId, true);

  // Debug log
  React.useEffect(() => {
    if (stopDialogOpen) {
      console.log('[GlobalTimerHeader] Active Timer:', activeTimer);
      console.log('[GlobalTimerHeader] Project ID:', activeTimer?.projectId);
      console.log('[GlobalTimerHeader] Statuses:', statuses);
      console.log('[GlobalTimerHeader] Statuses loading:', statusesLoading);
    }
  }, [stopDialogOpen, activeTimer, statuses, statusesLoading]);

  if (!activeTimer) {
    return null;
  }

  const { taskId, taskTitle } = activeTimer;

  const elapsedSeconds = getElapsedTime(taskId);
  const isPaused = isTimerPaused(taskId);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  const handleStop = async () => {
    await stopTimer(taskId, stopDescription || undefined, newTaskStatus || undefined);
    setStopDialogOpen(false);
    setStopDescription("");
    setNewTaskStatus("");
  };

  const handleDialogOpen = (open: boolean) => {
    setStopDialogOpen(open);
    if (!open) {
      setStopDescription("");
      setNewTaskStatus("");
    }
  };

  const handleTogglePause = () => {
    if (isPaused) {
      resumeTimer(taskId);
    } else {
      pauseTimer(taskId);
    }
  };

  return (
    <>
      <div className="w-full bg-green-50 border-b border-green-200 px-3 py-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className={cn(
                "px-2 py-1 rounded text-xs font-mono font-semibold",
                isPaused ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
              )}
            >
              {formatTime(elapsedSeconds)}
              {!isPaused && <span className="ml-1 animate-pulse">●</span>}
            </div>
            <span className="text-xs font-medium truncate">
              {taskTitle}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleTogglePause}
              className="h-7 w-7 p-0"
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? <Play size={14} /> : <Pause size={14} />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStopDialogOpen(true)}
              className="h-7 w-7 p-0"
              title="Stop & Save"
            >
              <Square size={14} />
            </Button>
          </div>
        </div>
      </div>

      {/* Stop Dialog */}
      <Dialog open={stopDialogOpen} onOpenChange={handleDialogOpen}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-visible">
          <DialogHeader>
            <DialogTitle>Stop Timer</DialogTitle>
            <DialogDescription>
              Time tracked: {formatTime(elapsedSeconds)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Status Dropdown */}
            <div className="grid gap-2">
              <Label htmlFor="status">
                Change Task Status (Optional)
              </Label>
              <Select
                value={newTaskStatus}
                onValueChange={setNewTaskStatus}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder={
                    statusesLoading
                      ? "Loading statuses..."
                      : statuses.length === 0
                        ? "No statuses available"
                        : "Keep current status"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {statuses.length > 0 ? (
                    statuses.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: status.color }}
                          />
                          {status.name}
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-status" disabled>
                      No statuses available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="What did you work on?"
                value={stopDescription}
                onChange={(e) => setStopDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleStop}>
              Save Time Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
