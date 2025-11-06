import React, { useState } from "react";
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
import { useTimer } from "../contexts/timer-context";
import { cn } from "@/shared/lib/utils";

interface TaskStopwatchProps {
  taskId: string;
  taskTitle: string;
  projectId: string;
  isAssignedToMe: boolean;
  variant?: "compact" | "full";
}

export function TaskStopwatch({ taskId, taskTitle, projectId, isAssignedToMe, variant = "compact" }: TaskStopwatchProps) {
  const {
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    getElapsedTime,
    isTimerActive,
    isTimerPaused,
  } = useTimer();

  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [description, setDescription] = useState("");

  const active = isTimerActive(taskId);
  const paused = isTimerPaused(taskId);
  const elapsedSeconds = getElapsedTime(taskId);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  const handleStart = () => {
    startTimer(taskId, taskTitle, projectId);
  };

  const handlePause = () => {
    pauseTimer(taskId);
  };

  const handleResume = () => {
    resumeTimer(taskId);
  };

  const handleStopClick = () => {
    setStopDialogOpen(true);
  };

  const handleStopConfirm = async () => {
    await stopTimer(taskId, description);
    setStopDialogOpen(false);
    setDescription("");
  };

  if (!isAssignedToMe) {
    return null;
  }

  if (variant === "compact") {
    return (
      <>
        <div className="flex items-center gap-1">
          {active && (
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono",
                paused ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
              )}
            >
              <span className="font-semibold">{formatTime(elapsedSeconds)}</span>
              {!paused && <span className="animate-pulse">●</span>}
            </div>
          )}

          {!active ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleStart}
              className="h-7 px-2"
              title="Start timer"
            >
              <Play size={12} />
            </Button>
          ) : paused ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleResume}
                className="h-7 px-2"
                title="Resume timer"
              >
                <Play size={12} />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleStopClick}
                className="h-7 px-2"
                title="Stop timer"
              >
                <Square size={12} />
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePause}
                className="h-7 px-2"
                title="Pause timer"
              >
                <Pause size={12} />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleStopClick}
                className="h-7 px-2"
                title="Stop timer"
              >
                <Square size={12} />
              </Button>
            </>
          )}
        </div>

        <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Stop Timer</DialogTitle>
              <DialogDescription>
                Time tracked: {formatTime(elapsedSeconds)}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What did you work on?"
                  className="resize-none"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStopDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleStopConfirm}>Save Time Entry</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Full variant
  return (
    <>
      <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30">
        <div className="flex-1">
          <div className="text-sm text-muted-foreground mb-1">Time Tracking</div>
          <div
            className={cn(
              "text-3xl font-mono font-bold",
              active && !paused && "text-green-600",
              active && paused && "text-yellow-600"
            )}
          >
            {formatTime(elapsedSeconds)}
          </div>
          {active && !paused && (
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="animate-pulse text-green-600">●</span>
              Timer running
            </div>
          )}
          {active && paused && (
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-yellow-600">●</span>
              Timer paused
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {!active ? (
            <Button onClick={handleStart} className="gap-2">
              <Play size={16} />
              Start Timer
            </Button>
          ) : paused ? (
            <>
              <Button onClick={handleResume} className="gap-2">
                <Play size={16} />
                Resume
              </Button>
              <Button variant="destructive" onClick={handleStopClick} className="gap-2">
                <Square size={16} />
                Stop & Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handlePause} className="gap-2">
                <Pause size={16} />
                Pause
              </Button>
              <Button variant="destructive" onClick={handleStopClick} className="gap-2">
                <Square size={16} />
                Stop & Save
              </Button>
            </>
          )}
        </div>
      </div>

      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Timer & Save Time Entry</DialogTitle>
            <DialogDescription>
              Time tracked: {formatTime(elapsedSeconds)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you work on?"
                className="resize-none"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStopDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStopConfirm}>Save Time Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
