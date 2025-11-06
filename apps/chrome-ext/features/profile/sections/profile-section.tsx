import { useState } from "react";
import { User as UserIcon, Mail, Building2, Shield, LogOut, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import { useCurrentUser } from "@/features/users/hooks";
import { useWorkspaces } from "@/features/workspaces/hooks";
import { useAuth } from "@/shared/contexts/auth-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";

export function ProfileSection() {
  const { user, logout } = useAuth();
  const { currentUser, loading: userLoading } = useCurrentUser();
  const { workspaces, loading: workspacesLoading } = useWorkspaces();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (confirm("Are you sure you want to logout?")) {
      setLoggingOut(true);
      try {
        await logout();
      } catch (error) {
        console.error("Logout error:", error);
        setLoggingOut(false);
      }
    }
  };

  if (userLoading || workspacesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">No user data</p>
      </div>
    );
  }

  const initials = currentUser.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header with Avatar */}
      <div className="p-6 bg-gradient-to-br from-primary/10 to-primary/5">
        <div className="flex flex-col items-center text-center">
          <Avatar className="h-20 w-20 mb-4 border-4 border-background shadow-lg">
            <AvatarImage src={currentUser.photoURL} alt={currentUser.displayName} />
            <AvatarFallback className="text-2xl font-semibold bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <h2 className="text-xl font-bold">{currentUser.displayName}</h2>
          <p className="text-sm text-muted-foreground mt-1">{currentUser.email}</p>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Roles Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Roles</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {currentUser.roles && currentUser.roles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {currentUser.roles.map((role) => (
                  <Badge key={role.id} variant="secondary">
                    {role.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No roles assigned</p>
            )}
            {currentUser.roles && currentUser.roles.length > 0 && (
              <div className="text-xs text-muted-foreground mt-2">
                {currentUser.roles[0].permissionIds.length} permissions
              </div>
            )}
          </CardContent>
        </Card>

        {/* Workspaces Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Workspaces</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {workspaces.length > 0 ? (
              <div className="space-y-2">
                {workspaces.map((workspace) => {
                  const isAdmin = workspace.adminIds.includes(currentUser.id);
                  const isCurrent = currentUser.currentWorkspaceId === workspace.id;

                  return (
                    <div
                      key={workspace.id}
                      className={`flex items-center justify-between p-2 rounded-md transition-colors ${
                        isCurrent ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{workspace.name}</p>
                          <p className="text-xs text-muted-foreground">/{workspace.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <Badge variant="outline" className="text-xs">
                            Admin
                          </Badge>
                        )}
                        {isCurrent && (
                          <Badge variant="default" className="text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No workspaces</p>
            )}
          </CardContent>
        </Card>

        {/* Account Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Account Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <Badge
                variant={currentUser.status === "active" ? "default" : "secondary"}
                className="capitalize"
              >
                {currentUser.status}
              </Badge>
            </div>
            {currentUser.lastLoginAt && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Login</span>
                <span className="text-xs">
                  {new Date(currentUser.lastLoginAt.toDate()).toLocaleDateString()}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Member Since</span>
              <span className="text-xs">
                {new Date(currentUser.createdAt.toDate()).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Logout Button */}
      <div className="p-4 border-t bg-background">
        <Button
          variant="destructive"
          className="w-full"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          {loggingOut ? "Logging out..." : "Logout"}
        </Button>
      </div>
    </div>
  );
}
