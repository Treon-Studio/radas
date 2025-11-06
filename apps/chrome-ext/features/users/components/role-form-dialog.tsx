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
import { Checkbox } from "@/shared/components/ui/checkbox";
import type { Role, CreateRoleDto, Permission, PermissionResource } from "../entity";

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role;
  permissions: Permission[];
  onSubmit: (data: CreateRoleDto) => Promise<void>;
  loading?: boolean;
}

export function RoleFormDialog({
  open,
  onOpenChange,
  role,
  permissions,
  onSubmit,
  loading,
}: RoleFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);

  useEffect(() => {
    if (role) {
      setName(role.name);
      setDescription(role.description);
      setSelectedPermissionIds(role.permissionIds);
    } else {
      setName("");
      setDescription("");
      setSelectedPermissionIds([]);
    }
  }, [role, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !description.trim()) return;

    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      permissionIds: selectedPermissionIds,
    });
  };

  const togglePermission = (permissionId: string) => {
    setSelectedPermissionIds((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const toggleAllForResource = (resource: PermissionResource) => {
    const resourcePermissions = permissions.filter((p) => p.resource === resource);
    const allSelected = resourcePermissions.every((p) =>
      selectedPermissionIds.includes(p.id)
    );

    if (allSelected) {
      // Remove all permissions for this resource
      setSelectedPermissionIds((prev) =>
        prev.filter((id) => !resourcePermissions.some((p) => p.id === id))
      );
    } else {
      // Add all permissions for this resource
      const newIds = resourcePermissions.map((p) => p.id);
      setSelectedPermissionIds((prev) => [...new Set([...prev, ...newIds])]);
    }
  };

  // Group permissions by resource
  const permissionsByResource = permissions.reduce((acc, permission) => {
    if (!acc[permission.resource]) {
      acc[permission.resource] = [];
    }
    acc[permission.resource].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{role ? "Edit Role" : "Create New Role"}</DialogTitle>
            <DialogDescription>
              {role ? "Update role details and permissions" : "Create a new role with specific permissions"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">
                Role Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Project Manager"
                required
                disabled={role?.isSystem} // Cannot change system role names
              />
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this role can do..."
                required
                disabled={role?.isSystem} // Cannot change system role descriptions
                rows={3}
              />
            </div>

            {/* Permissions */}
            <div className="grid gap-2">
              <Label>Permissions</Label>
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                {Object.entries(permissionsByResource).map(([resource, perms]) => (
                  <div key={resource} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm capitalize">
                        {resource.replace("_", " ")}
                      </h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAllForResource(resource as PermissionResource)}
                        className="h-7 text-xs"
                      >
                        {perms.every((p) => selectedPermissionIds.includes(p.id))
                          ? "Deselect All"
                          : "Select All"}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {perms.map((permission) => (
                        <div
                          key={permission.id}
                          className="flex items-center space-x-2 p-2 bg-background rounded border"
                        >
                          <Checkbox
                            id={permission.id}
                            checked={selectedPermissionIds.includes(permission.id)}
                            onCheckedChange={() => togglePermission(permission.id)}
                          />
                          <label
                            htmlFor={permission.id}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                          >
                            <div className="capitalize">{permission.action}</div>
                            <div className="text-xs text-muted-foreground">
                              {permission.description}
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected {selectedPermissionIds.length} of {permissions.length} permissions
              </p>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !description.trim()}
            >
              {loading ? "Saving..." : role ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
