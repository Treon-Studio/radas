import { useState } from "react";
import { Plus, Building2, Settings, Users } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { WorkspaceFormDialog } from "../components/workspace-form-dialog";
import { useWorkspaces, useIsWorkspaceAdmin } from "../hooks";
import type { Workspace } from "../entity";

export function WorkspaceSection() {
  const { workspaces, loading } = useWorkspaces();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);

  const handleCreate = () => {
    setEditingWorkspace(null);
    setDialogOpen(true);
  };

  const handleEdit = (workspace: Workspace) => {
    setEditingWorkspace(workspace);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Loading workspaces...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Workspaces</h2>
          <p className="text-sm text-muted-foreground">
            Manage your workspaces and team members
          </p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          New
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No workspaces yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first workspace to get started
          </p>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Workspace
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3">
          {workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              onEdit={() => handleEdit(workspace)}
            />
          ))}
        </div>
      )}

      <WorkspaceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspace={editingWorkspace}
      />
    </div>
  );
}

interface WorkspaceCardProps {
  workspace: Workspace;
  onEdit: () => void;
}

function WorkspaceCard({ workspace, onEdit }: WorkspaceCardProps) {
  const { isAdmin } = useIsWorkspaceAdmin(workspace.id);

  const totalMembers = workspace.adminIds.length + workspace.memberIds.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {workspace.logo ? (
              <img
                src={workspace.logo}
                alt={workspace.name}
                className="h-10 w-10 rounded-md object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
            )}
            <div>
              <CardTitle className="text-base">{workspace.name}</CardTitle>
              <CardDescription className="text-xs">/{workspace.slug}</CardDescription>
            </div>
          </div>
          {isAdmin && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {workspace.description && (
          <p className="text-sm text-muted-foreground mb-3">{workspace.description}</p>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>{totalMembers} members</span>
          </div>
          {isAdmin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}
