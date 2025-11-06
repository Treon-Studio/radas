import React, { useState } from "react";
import { Plus, MoreVertical, Shield, Mail, Calendar } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/shared/components/ui/dropdown-menu";
import { Badge } from "@/shared/components/ui/badge";
import { UserFormDialog } from "../components/user-form-dialog";
import { useUsersWithRoles, useUserMutations, useRoles } from "../hooks";
import type { User, CreateUserDto, UserWithRole } from "../entity";
import { toast } from "sonner";

export function UsersSection() {
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>();

  const { usersWithRoles, loading } = useUsersWithRoles();
  const { roles } = useRoles();
  const userMutations = useUserMutations();

  const handleAddUser = () => {
    setEditingUser(undefined);
    setUserDialogOpen(true);
  };

  const handleEditUser = (user: UserWithRole) => {
    setEditingUser(user);
    setUserDialogOpen(true);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Delete this user? This action cannot be undone.")) return;

    const result = await userMutations.remove(userId);
    if (result.success) {
      toast.success("User deleted successfully");
    } else {
      toast.error("Failed to delete user");
    }
  };

  const handleSubmitUser = async (data: CreateUserDto & { status?: any }) => {
    try {
      if (editingUser) {
        const { password, workspaceId, ...updateData } = data;
        const result = await userMutations.update(editingUser.id, updateData);
        if (result.success) {
          toast.success("User updated successfully");
          handleCloseUserDialog();
        } else {
          toast.error("Failed to update user");
        }
      } else {
        const result = await userMutations.create(data);
        if (result.success) {
          toast.success("User created successfully");
          handleCloseUserDialog();
        } else {
          toast.error("Failed to create user");
        }
      }
    } catch (error) {
      console.error("Error submitting user:", error);
      toast.error("An error occurred");
    }
  };

  const handleCloseUserDialog = () => {
    setUserDialogOpen(false);
    setEditingUser(undefined);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "pending":
        return <Badge variant="outline">Pending</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Users</h3>
          <p className="text-sm text-muted-foreground">
            Manage user accounts and permissions
          </p>
        </div>
        <Button size="sm" onClick={handleAddUser}>
          <Plus size={16} className="mr-1" />
          Add User
        </Button>
      </div>

      {/* User List */}
      <div className="flex-1 overflow-auto p-4">
        {usersWithRoles.length === 0 ? (
          <div className="text-center py-12">
            <Shield size={48} className="mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Users Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add users to collaborate on projects
            </p>
            <Button onClick={handleAddUser}>
              <Plus size={16} className="mr-2" />
              Add First User
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {usersWithRoles.map((user) => (
              <div
                key={user.id}
                className="border rounded-lg p-4 bg-background hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => handleEditUser(user)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-semibold text-primary">
                          {user.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold truncate">{user.displayName}</h4>
                        {getStatusBadge(user.status)}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Mail size={14} />
                          <span className="truncate">{user.email}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Shield size={14} />
                          <span>{user.role?.name || "No Role"}</span>
                        </div>
                      </div>

                      {user.lastLoginAt && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Calendar size={12} />
                          <span>
                            Last login:{" "}
                            {new Date(user.lastLoginAt.toDate()).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditUser(user)}>
                        Edit User
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-destructive"
                      >
                        Delete User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Dialog */}
      <UserFormDialog
        open={userDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseUserDialog();
          else setUserDialogOpen(open);
        }}
        user={editingUser}
        roles={roles}
        onSubmit={handleSubmitUser}
        loading={userMutations.loading}
      />
    </div>
  );
}
