import React, { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { TimeEntry, Task, CreateTimeEntryDto } from "../entity";

interface TimeEntryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  tasks: Task[];
  timeEntry?: TimeEntry;
  defaultTaskId?: string;
  onSubmit: (data: CreateTimeEntryDto) => Promise<void>;
  loading?: boolean;
}

export function TimeEntryFormDialog({
  open,
  onOpenChange,
  projectId,
  tasks,
  timeEntry,
  defaultTaskId,
  onSubmit,
  loading,
}: TimeEntryFormDialogProps) {
  const [taskId, setTaskId] = useState("");
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (timeEntry) {
      setTaskId(timeEntry.taskId);
      setHours(timeEntry.hours.toString());
      setDescription(timeEntry.description || "");
      setDate(formatDateForInput(timeEntry.date));
    } else {
      setTaskId(defaultTaskId || tasks[0]?.id || "");
      setHours("");
      setDescription("");
      setDate(new Date().toISOString().split("T")[0]); // Today
    }
  }, [timeEntry, defaultTaskId, tasks, open]);

  const formatDateForInput = (date: any): string => {
    if (!date) return "";
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      return d.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskId || !hours || !date) return;

    await onSubmit({
      taskId,
      projectId,
      hours: parseFloat(hours),
      description: description.trim() || undefined,
      date: new Date(date),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{timeEntry ? "Edit Time Entry" : "Log Time"}</DialogTitle>
            <DialogDescription>
              {timeEntry ? "Update time entry details" : "Log time spent on a task"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Task */}
            <div className="grid gap-2">
              <Label htmlFor="task">
                Task <span className="text-destructive">*</span>
              </Label>
              <Select value={taskId} onValueChange={setTaskId} required>
                <SelectTrigger id="task">
                  <SelectValue placeholder="Select task" />
                </SelectTrigger>
                <SelectContent>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date & Hours */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="date">
                  Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="hours">
                  Hours <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="hours"
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="e.g., 2.5"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you work on?"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !taskId || !hours || !date}>
              {loading ? "Saving..." : timeEntry ? "Update" : "Log Time"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
