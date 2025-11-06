import React, { useState } from "react";
import { Plus, MoreVertical, Shield, Users, Lock } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/shared/components/ui/dropdown-menu";
import { Badge } from "@/shared/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { RoleFormDialog } from "../components/role-form-dialog";
import { PermissionsSection } from "./permissions-section";
import { useRolesWithPermissions, useRoleMutations, usePermissions } from "../hooks";
import type { Role, CreateRoleDto, RoleWithPermissions } from "../entity";
import { toast } from "sonner";

export function RolesSection() {
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | undefined>();

  const { rolesWithPermissions, loading } = useRolesWithPermissions();
  const { permissions } = usePermissions();
  const roleMutations = useRoleMutations();

  const handleAddRole = () => {
    setEditingRole(undefined);
    setRoleDialogOpen(true);
  };

  const handleEditRole = (role: RoleWithPermissions) => {
    setEditingRole(role);
    setRoleDialogOpen(true);
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm("Delete this role? This action cannot be undone.")) return;

    const result = await roleMutations.remove(roleId);
    if (result.success) {
      toast.success("Role deleted successfully");
    } else {
      toast.error(result.error?.message || "Failed to delete role");
    }
  };

  const handleSubmitRole = async (data: CreateRoleDto) => {
    try {
      if (editingRole) {
        const result = await roleMutations.update(editingRole.id, data);
        if (result.success) {
          toast.success("Role updated successfully");
          handleCloseRoleDialog();
        } else {
          toast.error(result.error?.message || "Failed to update role");
        }
      } else {
        const result = await roleMutations.create(data);
        if (result.success) {
          toast.success("Role created successfully");
          handleCloseRoleDialog();
        } else {
          toast.error("Failed to create role");
        }
      }
    } catch (error) {
      console.error("Error submitting role:", error);
      toast.error("An error occurred");
    }
  };

  const handleCloseRoleDialog = () => {
    setRoleDialogOpen(false);
    setEditingRole(undefined);
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Tabs defaultValue="roles" className="h-full flex flex-col overflow-hidden">
        {/* Header with Tabs */}
        <div className="flex-shrink-0 px-4 pt-3 border-b">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold">Roles & Permissions</h3>
              <p className="text-sm text-muted-foreground">
                Manage roles and their permissions
              </p>
            </div>
          </div>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="roles" className="flex-1">
              <Shield size={16} className="mr-2" />
              Roles
            </TabsTrigger>
            <TabsTrigger value="permissions" className="flex-1">
              <Lock size={16} className="mr-2" />
              Permissions
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Roles Tab Content */}
        <TabsContent value="roles" className="flex-1 flex flex-col m-0 overflow-hidden min-h-0">
          <div className="flex-shrink-0 px-4 py-3 border-b flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Create and manage user roles
            </p>
            <Button size="sm" onClick={handleAddRole}>
              <Plus size={16} className="mr-1" />
              Add Role
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {rolesWithPermissions.length === 0 ? (
          <div className="text-center py-12">
            <Shield size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Roles Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create roles to manage user permissions
            </p>
            <Button onClick={handleAddRole}>
              <Plus size={16} className="mr-2" />
              Add First Role
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {rolesWithPermissions.map((role) => (
              <div
                key={role.id}
                className="border rounded-lg p-4 bg-background hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Shield size={20} className="text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{role.name}</h4>
                      {role.isSystem && (
                        <Badge variant="secondary" className="text-xs">
                          System Role
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditRole(role)}>
                        Edit Role
                      </DropdownMenuItem>
                      {!role.isSystem && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteRole(role.id)}
                            className="text-destructive"
                          >
                            Delete Role
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                  {role.description}
                </p>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Lock size={14} className="text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {role.permissions.length} permissions
                    </span>
                  </div>

                  {role.permissions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.slice(0, 3).map((permission) => (
                        <Badge key={permission.id} variant="outline" className="text-xs">
                          {permission.action}:{permission.resource.replace("_", " ")}
                        </Badge>
                      ))}
                      {role.permissions.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{role.permissions.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
          </div>
        </TabsContent>

        {/* Permissions Tab Content */}
        <TabsContent value="permissions" className="flex-1 flex flex-col m-0 overflow-hidden min-h-0">
          <PermissionsSection />
        </TabsContent>
      </Tabs>

      {/* Role Dialog */}
      <RoleFormDialog
        open={roleDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseRoleDialog();
          else setRoleDialogOpen(open);
        }}
        role={editingRole}
        permissions={permissions}
        onSubmit={handleSubmitRole}
        loading={roleMutations.loading}
      />
    </div>
  );
}
