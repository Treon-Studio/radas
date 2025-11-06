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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { AssigneeSelector } from "./assignee-selector";
import { TaskHistoryTimeline } from "./task-history-timeline";
import type {
  Task,
  Epic,
  CreateTaskDto,
  TaskType,
  ProjectStatus,
  ProjectPriority,
  ProjectLabel,
} from "../entity";
import {
  TaskType as TaskTypeEnum,
  TASK_TYPE_LABELS,
  TASK_TYPE_COLORS,
} from "../entity";

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  statuses: ProjectStatus[];
  priorities: ProjectPriority[];
  labels: ProjectLabel[];
  epics?: Epic[];
  task?: Task;
  onSubmit: (data: CreateTaskDto) => Promise<void>;
  loading?: boolean;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  projectId,
  statuses,
  priorities,
  labels,
  epics = [],
  task,
  onSubmit,
  loading,
}: TaskFormDialogProps) {
  const [activeTab, setActiveTab] = useState("details");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TaskType>(TaskTypeEnum.TASK);
  const [statusId, setStatusId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [epicId, setEpicId] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [estimatedStartDate, setEstimatedStartDate] = useState("");
  const [estimatedEndDate, setEstimatedEndDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setType(task.type);
      setStatusId(task.statusId);
      setPriorityId(task.priorityId);
      setEpicId(task.epicId || "");
      setAssigneeId(task.assigneeId);
      setSelectedLabels(task.labelIds || []);
      setDueDate(task.dueDate ? formatDateForInput(task.dueDate) : "");
      setEstimatedStartDate(task.estimatedStartDate ? formatDateTimeForInput(task.estimatedStartDate) : "");
      setEstimatedEndDate(task.estimatedEndDate ? formatDateTimeForInput(task.estimatedEndDate) : "");
      setEstimatedHours(task.estimatedHours?.toString() || "");
    } else {
      setTitle("");
      setDescription("");
      setType(TaskTypeEnum.TASK);
      setStatusId(statuses.find((s) => s.isDefault)?.id || statuses[0]?.id || "");
      setPriorityId(priorities.find((p) => p.isDefault)?.id || priorities[0]?.id || "");
      setEpicId("");
      setAssigneeId(undefined);
      setSelectedLabels([]);
      setDueDate("");
      setEstimatedStartDate("");
      setEstimatedEndDate("");
      setEstimatedHours("");
    }
  }, [task, statuses, priorities, open]);

  const formatDateForInput = (date: any): string => {
    if (!date) return "";
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      return d.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  const formatDateTimeForInput = (date: any): string => {
    if (!date) return "";
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      // Format: YYYY-MM-DDTHH:MM
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return "";
    }
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabels((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !statusId || !priorityId) return;

    await onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      statusId,
      priorityId,
      projectId,
      epicId: epicId || undefined,
      assigneeId: assigneeId || undefined,
      labelIds: selectedLabels.length > 0 ? selectedLabels : undefined,
      dueDate: dueDate ? new Date(dueDate) : null,
      estimatedStartDate: estimatedStartDate ? new Date(estimatedStartDate) : null,
      estimatedEndDate: estimatedEndDate ? new Date(estimatedEndDate) : null,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full h-screen m-0 p-0 rounded-none overflow-hidden">
        <form onSubmit={handleSubmit} className="h-full flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0 px-6 py-4 border-b">
            <DialogTitle>{task ? "Edit Task" : "Create New Task"}</DialogTitle>
            <DialogDescription>
              {task ? "Update task details below" : "Create a new task"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            {task && (
              <TabsList className="flex-shrink-0 w-full rounded-none border-b px-6">
                <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="details" className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 m-0">
              <div className="max-w-2xl mx-auto grid gap-4">
            {/* Title */}
            <div className="grid gap-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title..."
                required
              />
            </div>

            {/* Type & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
                <Select value={type} onValueChange={(value) => setType(value as TaskType)}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(TaskTypeEnum).map((taskType) => (
                      <SelectItem key={taskType} value={taskType}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: TASK_TYPE_COLORS[taskType] }}
                          />
                          {TASK_TYPE_LABELS[taskType]}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">
                  Status <span className="text-destructive">*</span>
                </Label>
                <Select value={statusId} onValueChange={setStatusId} required>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: status.color }}
                          />
                          {status.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Priority */}
            <div className="grid gap-2">
              <Label htmlFor="priority">
                Priority <span className="text-destructive">*</span>
              </Label>
              <Select value={priorityId} onValueChange={setPriorityId} required>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((priority) => (
                    <SelectItem key={priority.id} value={priority.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: priority.color }}
                        />
                        {priority.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Epic */}
            {epics && epics.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="epic">Epic (Optional)</Label>
                <Select value={epicId || "none"} onValueChange={(val) => setEpicId(val === "none" ? "" : val)}>
                  <SelectTrigger id="epic">
                    <SelectValue placeholder="No epic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No epic</SelectItem>
                    {epics.map((epic) => (
                      <SelectItem key={epic.id} value={epic.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: epic.color || "#a855f7" }}
                          />
                          {epic.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Assignee */}
            <div className="grid gap-2">
              <Label>Assignee</Label>
              <AssigneeSelector
                assigneeId={assigneeId}
                onAssigneeChange={setAssigneeId}
                variant="button"
                size="sm"
              />
            </div>

            {/* Labels */}
            {labels.length > 0 && (
              <div className="grid gap-2">
                <Label>Labels</Label>
                <div className="flex flex-wrap gap-2">
                  {labels.map((label) => (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() => toggleLabel(label.id)}
                      className={`px-2 py-1 text-xs rounded transition-opacity ${
                        selectedLabels.includes(label.id) ? "opacity-100" : "opacity-40"
                      }`}
                      style={{
                        backgroundColor: label.color,
                        color: "#fff",
                      }}
                    >
                      {label.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Estimated Start & End Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="estimatedStartDate">Estimated Start</Label>
                <Input
                  id="estimatedStartDate"
                  type="datetime-local"
                  value={estimatedStartDate}
                  onChange={(e) => setEstimatedStartDate(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="estimatedEndDate">Estimated End</Label>
                <Input
                  id="estimatedEndDate"
                  type="datetime-local"
                  value={estimatedEndDate}
                  onChange={(e) => setEstimatedEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Due Date & Estimated Hours */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="estimatedHours">Estimated Hours</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  step="0.5"
                  min="0"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Task description..."
                rows={4}
              />
            </div>
              </div>
            </TabsContent>

            {task && (
              <TabsContent value="activity" className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 m-0">
                <div className="max-w-2xl mx-auto">
                  <TaskHistoryTimeline taskId={task.id} />
                </div>
              </TabsContent>
            )}
          </Tabs>

          <DialogFooter className="flex-shrink-0 px-6 py-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !title.trim() || !statusId || !priorityId}>
              {loading ? "Saving..." : task ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
