import React, { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Separator } from "@/shared/components/ui/separator";
import { Calendar, Users, Palette } from "lucide-react";
import { TiptapEditor } from "@/shared/components/tiptap-editor";
import { DateRangePicker } from "@/shared/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";
import type { Project, CreateProjectDto } from "../entity";
import { useCurrentWorkspace } from "@/features/workspaces/hooks";
import { useUsers } from "@/features/users/hooks";

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
  onSubmit: (data: CreateProjectDto) => Promise<void>;
  loading?: boolean;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSubmit,
  loading,
}: ProjectFormDialogProps) {
  const { workspace } = useCurrentWorkspace();
  const { users } = useUsers(true, workspace?.id);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setKey(project.key);
      setDescription(project.description || "");
      setColor(project.color || "#3b82f6");
      setDateRange({
        from: project.startDate ? project.startDate.toDate() : undefined,
        to: project.endDate ? project.endDate.toDate() : undefined,
      });
      setAssigneeIds(project.assigneeIds || []);
    } else {
      setName("");
      setKey("");
      setDescription("");
      setColor("#3b82f6");
      setDateRange(undefined);
      setAssigneeIds([]);
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !key.trim()) return;
    if (!workspace?.id) {
      console.error("No workspace selected");
      return;
    }

    // Clean description - remove empty HTML tags
    const cleanDescription = description.replace(/<p><\/p>/g, '').trim();

    await onSubmit({
      name: name.trim(),
      key: key.trim().toUpperCase(),
      description: cleanDescription || undefined,
      color,
      startDate: dateRange?.from?.toISOString().split('T')[0],
      endDate: dateRange?.to?.toISOString().split('T')[0],
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      workspaceId: workspace.id, // Current workspace
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        <form onSubmit={handleSubmit} className="h-full flex flex-col">
          <SheetHeader className="flex-shrink-0 space-y-4 px-6 pt-6 pb-6">
            <SheetTitle className="text-2xl">
              {project ? "Edit Project" : "Create New Project"}
            </SheetTitle>
            <SheetDescription>
              {project
                ? "Update project details below"
                : "Create a new project with default statuses, priorities, and labels"}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 space-y-6">
            {/* Basic Info Section */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Project Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome Project"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="key">
                  Project Key <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="key"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  placeholder="PROJ"
                  maxLength={10}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Used for task IDs (e.g., PROJ-123). Max 10 characters.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <TiptapEditor
                  content={description}
                  onChange={setDescription}
                  placeholder="Type your project description... (supports formatting)"
                />
                <p className="text-xs text-muted-foreground">
                  Type <kbd className="px-1 py-0.5 bg-muted rounded text-xs">/</kbd> for commands,
                  or use <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Cmd+B</kbd> for bold,
                  <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Cmd+I</kbd> for italic
                </p>
              </div>
            </div>

            <Separator />

            {/* Styling Section */}
            <div className="space-y-4">
              <Label className="flex items-center gap-2">
                <Palette size={16} />
                Project Color
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{color}</span>
              </div>
            </div>

            <Separator />

            {/* Timeline Section */}
            <div className="space-y-4">
              <Label className="flex items-center gap-2">
                <Calendar size={16} />
                Project Timeline
              </Label>
              <DateRangePicker
                date={dateRange}
                onDateChange={setDateRange}
              />
              {dateRange?.from && (
                <p className="text-xs text-muted-foreground">
                  {dateRange.to
                    ? `Selected: ${new Date(dateRange.from).toLocaleDateString()} - ${new Date(dateRange.to).toLocaleDateString()}`
                    : `Start date: ${new Date(dateRange.from).toLocaleDateString()}`}
                </p>
              )}
            </div>

            <Separator />

            {/* Team Section */}
            <div className="space-y-4">
              <Label className="flex items-center gap-2">
                <Users size={16} />
                Assign Team Members
              </Label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                {users.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No users available
                  </p>
                ) : (
                  users.map((user) => (
                    <label
                      key={user.id}
                      htmlFor={`user-${user.id}`}
                      className="flex items-center space-x-2 cursor-pointer hover:bg-accent rounded p-2"
                    >
                      <Checkbox
                        id={`user-${user.id}`}
                        checked={assigneeIds.includes(user.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setAssigneeIds([...assigneeIds, user.id]);
                          } else {
                            setAssigneeIds(assigneeIds.filter(id => id !== user.id));
                          }
                        }}
                      />
                      <span className="text-sm flex-1">{user.displayName}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex-shrink-0 flex gap-3 px-6 py-4 border-t bg-background">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !key.trim()}
              className="flex-1"
            >
              {loading ? "Saving..." : project ? "Update Project" : "Create Project"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
