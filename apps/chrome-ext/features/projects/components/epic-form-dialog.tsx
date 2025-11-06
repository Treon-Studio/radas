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
import type { Epic, CreateEpicDto } from "../entity";
import { EPIC_STATUS_LABELS, EPIC_STATUS_COLORS } from "../entity";

interface EpicFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  epic?: Epic;
  onSubmit: (data: CreateEpicDto) => Promise<void>;
  loading?: boolean;
}

export function EpicFormDialog({
  open,
  onOpenChange,
  epic,
  onSubmit,
  loading,
}: EpicFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#a855f7");
  const [status, setStatus] = useState<"planning" | "in_progress" | "completed" | "cancelled">("planning");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (epic) {
      setName(epic.name);
      setDescription(epic.description || "");
      setColor(epic.color || "#a855f7");
      setStatus(epic.status);
      setStartDate(epic.startDate ? formatDateForInput(epic.startDate) : "");
      setDueDate(epic.dueDate ? formatDateForInput(epic.dueDate) : "");
    } else {
      setName("");
      setDescription("");
      setColor("#a855f7");
      setStatus("planning");
      setStartDate("");
      setDueDate("");
    }
  }, [epic, open]);

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

    if (!name.trim()) return;

    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      status,
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{epic ? "Edit Epic" : "Create New Epic"}</DialogTitle>
            <DialogDescription>
              {epic ? "Update epic details" : "Create a new epic to group related tasks"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">
                Epic Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="User Authentication System"
                required
              />
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the epic..."
                rows={3}
              />
            </div>

            {/* Status & Color */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as typeof status)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EPIC_STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: EPIC_STATUS_COLORS[key as keyof typeof EPIC_STATUS_COLORS] }}
                          />
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="color">Color</Label>
                <input
                  type="color"
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-full rounded border cursor-pointer"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Saving..." : epic ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
