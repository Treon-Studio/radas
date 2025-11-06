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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import type {
  Permission,
  CreatePermissionDto,
  PermissionAction,
  PermissionResource,
} from "../entity";

interface PermissionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  permission?: Permission;
  onSubmit: (data: CreatePermissionDto) => Promise<void>;
  loading?: boolean;
}

const ACTIONS: PermissionAction[] = ["create", "read", "update", "delete", "manage"];
const RESOURCES: PermissionResource[] = [
  "project",
  "task",
  "epic",
  "page",
  "document",
  "link",
  "test_case",
  "user",
  "role",
  "all",
];

export function PermissionFormDialog({
  open,
  onOpenChange,
  permission,
  onSubmit,
  loading,
}: PermissionFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [action, setAction] = useState<PermissionAction>("read");
  const [resource, setResource] = useState<PermissionResource>("project");

  useEffect(() => {
    if (permission) {
      setName(permission.name);
      setDescription(permission.description);
      setAction(permission.action);
      setResource(permission.resource);
    } else {
      setName("");
      setDescription("");
      setAction("read");
      setResource("project");
    }
  }, [permission, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !description.trim()) return;

    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      action,
      resource,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {permission ? "Edit Permission" : "Create Permission"}
            </DialogTitle>
            <DialogDescription>
              {permission
                ? "Update permission details"
                : "Add a new permission to the system"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Permission Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Create Project"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ability to create new projects"
                required
                rows={3}
              />
            </div>

            {/* Action */}
            <div className="space-y-2">
              <Label htmlFor="action">
                Action <span className="text-destructive">*</span>
              </Label>
              <Select value={action} onValueChange={(val) => setAction(val as PermissionAction)}>
                <SelectTrigger id="action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((act) => (
                    <SelectItem key={act} value={act}>
                      {act.charAt(0).toUpperCase() + act.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Resource */}
            <div className="space-y-2">
              <Label htmlFor="resource">
                Resource <span className="text-destructive">*</span>
              </Label>
              <Select value={resource} onValueChange={(val) => setResource(val as PermissionResource)}>
                <SelectTrigger id="resource">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCES.map((res) => (
                    <SelectItem key={res} value={res}>
                      {res.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !description.trim()}
            >
              {loading
                ? "Saving..."
                : permission
                ? "Update Permission"
                : "Create Permission"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
