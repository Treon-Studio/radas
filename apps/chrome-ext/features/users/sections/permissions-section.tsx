import React, { useState } from "react";
import { Plus, MoreVertical, Lock, Shield } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/shared/components/ui/dropdown-menu";
import { Badge } from "@/shared/components/ui/badge";
import { PermissionFormDialog } from "../components/permission-form-dialog";
import { usePermissions, usePermissionMutations } from "../hooks";
import type { Permission, CreatePermissionDto } from "../entity";
import { toast } from "sonner";

export function PermissionsSection() {
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [editingPermission, setEditingPermission] = useState<Permission | undefined>();

  const { permissions, loading } = usePermissions();
  const permissionMutations = usePermissionMutations();

  const handleAddPermission = () => {
    setEditingPermission(undefined);
    setPermissionDialogOpen(true);
  };

  const handleEditPermission = (permission: Permission) => {
    setEditingPermission(permission);
    setPermissionDialogOpen(true);
  };

  const handleDeletePermission = async (permissionId: string) => {
    if (!confirm("Delete this permission? This action cannot be undone.")) return;

    const result = await permissionMutations.remove(permissionId);
    if (result.success) {
      toast.success("Permission deleted successfully");
    } else {
      toast.error(result.error?.message || "Failed to delete permission");
    }
  };

  const handleSubmitPermission = async (data: CreatePermissionDto) => {
    try {
      if (editingPermission) {
        const result = await permissionMutations.update(editingPermission.id, data);
        if (result.success) {
          toast.success("Permission updated successfully");
          handleClosePermissionDialog();
        } else {
          toast.error(result.error?.message || "Failed to update permission");
        }
      } else {
        const result = await permissionMutations.create(data);
        if (result.success) {
          toast.success("Permission created successfully");
          handleClosePermissionDialog();
        } else {
          toast.error("Failed to create permission");
        }
      }
    } catch (error) {
      console.error("Error submitting permission:", error);
      toast.error("An error occurred");
    }
  };

  const handleClosePermissionDialog = () => {
    setPermissionDialogOpen(false);
    setEditingPermission(undefined);
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "create":
        return "bg-green-500/10 text-green-700 border-green-200";
      case "read":
        return "bg-blue-500/10 text-blue-700 border-blue-200";
      case "update":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-200";
      case "delete":
        return "bg-red-500/10 text-red-700 border-red-200";
      case "manage":
        return "bg-purple-500/10 text-purple-700 border-purple-200";
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Group permissions by resource
  const groupedPermissions = permissions.reduce((acc, permission) => {
    const resource = permission.resource || "other";
    if (!acc[resource]) {
      acc[resource] = [];
    }
    acc[resource].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage individual permissions
        </p>
        <Button size="sm" onClick={handleAddPermission}>
          <Plus size={16} className="mr-1" />
          Add Permission
        </Button>
      </div>

      {/* Permission List */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {permissions.length === 0 ? (
          <div className="text-center py-12">
            <Lock size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Permissions Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create permissions to assign to roles
            </p>
            <Button onClick={handleAddPermission}>
              <Plus size={16} className="mr-2" />
              Add First Permission
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedPermissions).map(([resource, perms]) => (
              <div key={resource}>
                <h4 className="font-semibold mb-3 capitalize flex items-center gap-2">
                  <Shield size={16} className="text-primary" />
                  {resource.split("_").join(" ")}
                  <Badge variant="secondary" className="ml-auto">
                    {perms.length}
                  </Badge>
                </h4>
                <div className="space-y-3">
                  {perms.map((permission) => (
                    <div
                      key={permission.id}
                      className="border rounded-lg p-3 bg-background hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant="outline"
                              className={`text-xs ${getActionColor(permission.action)}`}
                            >
                              {permission.action}
                            </Badge>
                            <h5 className="font-medium text-sm">{permission.name}</h5>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {permission.description}
                          </p>
                        </div>

                        {/* Actions */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 ml-2">
                              <MoreVertical size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditPermission(permission)}>
                              Edit Permission
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeletePermission(permission.id)}
                              className="text-destructive"
                            >
                              Delete Permission
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Permission Dialog */}
      <PermissionFormDialog
        open={permissionDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleClosePermissionDialog();
          else setPermissionDialogOpen(open);
        }}
        permission={editingPermission}
        onSubmit={handleSubmitPermission}
        loading={permissionMutations.loading}
      />
    </div>
  );
}
