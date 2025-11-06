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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Badge } from "@/shared/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Separator } from "@/shared/components/ui/separator";
import { User, Mail, Shield, Building2, Calendar, AlertCircle } from "lucide-react";
import type { User as UserType, CreateUserDto, Role, UserStatus } from "../entity";
import { useCurrentWorkspace } from "@/features/workspaces/hooks";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserType;
  roles: Role[];
  onSubmit: (data: CreateUserDto) => Promise<void>;
  loading?: boolean;
}

export function UserFormDialog({
  open,
  onOpenChange,
  user,
  roles,
  onSubmit,
  loading,
}: UserFormDialogProps) {
  const { workspace } = useCurrentWorkspace();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [status, setStatus] = useState<UserStatus>("active");

  useEffect(() => {
    if (user) {
      setEmail(user.email);
      setDisplayName(user.displayName);
      setPhotoURL(user.photoURL || "");
      setSelectedRoleIds(user.roleIds || []);
      setStatus(user.status || "active");
      setPassword(""); // Never pre-fill password
    } else {
      setEmail("");
      setDisplayName("");
      setPhotoURL("");
      setSelectedRoleIds(roles[0] ? [roles[0].id] : []);
      setStatus("active");
      setPassword("");
    }
  }, [user, roles, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !displayName.trim() || selectedRoleIds.length === 0) return;
    if (!user && !password.trim()) return; // Password required for new users
    if (!workspace?.id) {
      console.error("No workspace selected");
      return;
    }

    const submitData: any = {
      email: email.trim(),
      displayName: displayName.trim(),
      photoURL: photoURL.trim() || undefined,
      roleIds: selectedRoleIds,
      workspaceId: workspace.id,
      password: password.trim(),
    };

    // Add status if editing existing user
    if (user) {
      submitData.status = status;
    }

    await onSubmit(submitData);
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    );
  };

  const getStatusColor = (s: UserStatus) => {
    switch (s) {
      case "active":
        return "bg-green-500";
      case "inactive":
        return "bg-gray-500";
      case "pending":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <form onSubmit={handleSubmit} className="h-full flex flex-col px-6 py-6">
          <SheetHeader className="space-y-4 pb-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={photoURL} alt={displayName} />
                <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                  {displayName ? getInitials(displayName) : <User size={24} />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <SheetTitle className="text-2xl">
                  {user ? "Edit User" : "Create New User"}
                </SheetTitle>
                <SheetDescription>
                  {user
                    ? "Update user details and permissions"
                    : "Add a new user to your workspace"}
                </SheetDescription>
              </div>
            </div>

            {!user && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  The user will receive an email invitation to join the workspace.
                </AlertDescription>
              </Alert>
            )}
          </SheetHeader>

          <Tabs defaultValue="details" className="flex-1">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">
                <User className="h-4 w-4 mr-2" />
                Details
              </TabsTrigger>
              <TabsTrigger value="roles">
                <Shield className="h-4 w-4 mr-2" />
                Roles
              </TabsTrigger>
              <TabsTrigger value="workspace">
                <Building2 className="h-4 w-4 mr-2" />
                Workspace
              </TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="space-y-6 mt-6">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  disabled={!!user} // Cannot change email for existing users
                />
                {user && (
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed for existing users
                  </p>
                )}
              </div>

              {/* Display Name */}
              <div className="space-y-2">
                <Label htmlFor="displayName">
                  Display Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>

              {/* Photo URL */}
              <div className="space-y-2">
                <Label htmlFor="photoURL">Profile Photo URL</Label>
                <Input
                  id="photoURL"
                  type="url"
                  value={photoURL}
                  onChange={(e) => setPhotoURL(e.target.value)}
                  placeholder="https://example.com/photo.jpg"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Provide a URL to the user's profile photo
                </p>
              </div>

              {/* Password (only for new users) */}
              {!user && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="password">
                      Password <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum 6 characters. User can change this later.
                    </p>
                  </div>
                </>
              )}

              {/* Status (only for edit) */}
              {user && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="status">Account Status</Label>
                    <Select
                      value={status}
                      onValueChange={(value) => setStatus(value as UserStatus)}
                    >
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor("active")}`} />
                            Active
                          </div>
                        </SelectItem>
                        <SelectItem value="inactive">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor("inactive")}`} />
                            Inactive
                          </div>
                        </SelectItem>
                        <SelectItem value="pending">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor("pending")}`} />
                            Pending
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </TabsContent>

            {/* Roles Tab */}
            <TabsContent value="roles" className="space-y-6 mt-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  User Roles <span className="text-destructive">*</span>
                </Label>
                <p className="text-sm text-muted-foreground">
                  Select one or more roles for this user. Multiple roles combine their permissions.
                </p>
              </div>

              <div className="space-y-3">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    htmlFor={`role-${role.id}`}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors block ${
                      selectedRoleIds.includes(role.id)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`role-${role.id}`}
                        checked={selectedRoleIds.includes(role.id)}
                        onCheckedChange={() => toggleRole(role.id)}
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{role.name}</h4>
                          {role.isSystem && (
                            <Badge variant="outline" className="text-xs">
                              System
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{role.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {role.permissionIds?.length || 0} permissions
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {selectedRoleIds.length === 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Please select at least one role for the user
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>

            {/* Workspace Tab */}
            <TabsContent value="workspace" className="space-y-6 mt-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Workspace Information
                </Label>
                <p className="text-sm text-muted-foreground">
                  User will be added to the current workspace
                </p>
              </div>

              {workspace && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{workspace.name}</h4>
                      <p className="text-sm text-muted-foreground">/{workspace.slug}</p>
                    </div>
                    <Badge>Current</Badge>
                  </div>

                  {workspace.description && (
                    <p className="text-sm text-muted-foreground">{workspace.description}</p>
                  )}

                  <Separator />

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Admins</p>
                      <p className="font-medium">{workspace.adminIds?.length || 0}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Members</p>
                      <p className="font-medium">{workspace.memberIds?.length || 0}</p>
                    </div>
                  </div>
                </div>
              )}

              {user && user.createdAt && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Account History
                    </Label>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Member Since</span>
                        <span className="font-medium">
                          {new Date(user.createdAt.toDate()).toLocaleDateString()}
                        </span>
                      </div>
                      {user.lastLoginAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Login</span>
                          <span className="font-medium">
                            {new Date(user.lastLoginAt.toDate()).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          {/* Footer Actions */}
          <div className="flex gap-3 pt-6 border-t mt-auto">
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
              disabled={
                loading ||
                !email.trim() ||
                !displayName.trim() ||
                selectedRoleIds.length === 0 ||
                (!user && !password.trim())
              }
              className="flex-1"
            >
              {loading ? "Saving..." : user ? "Update User" : "Create User"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
