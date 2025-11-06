import { useState } from "react";
import { Plus, Briefcase, MapPin, Calendar, MoreVertical } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useJobPositions, useJobPositionMutations } from "../hooks";
import { JobPositionFormDialog } from "../components/job-position-form-dialog";
import type { JobPosition, CreateJobPositionDto } from "../entity";
import { toast } from "sonner";
import { format } from "date-fns";

export function PositionsSection() {
  const { positions, loading } = useJobPositions();
  const positionMutations = useJobPositionMutations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<JobPosition | undefined>();

  const handleCreate = () => {
    setEditingPosition(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (position: JobPosition) => {
    setEditingPosition(position);
    setDialogOpen(true);
  };

  const handleSubmit = async (data: CreateJobPositionDto) => {
    try {
      if (editingPosition) {
        const result = await positionMutations.update(editingPosition.id, data);
        if (result.success) {
          toast.success("Position updated successfully");
          setDialogOpen(false);
        } else {
          toast.error("Failed to update position");
        }
      } else {
        const result = await positionMutations.create(data);
        if (result.success) {
          toast.success("Position created successfully");
          setDialogOpen(false);
        } else {
          toast.error("Failed to create position");
        }
      }
    } catch (error) {
      console.error("Error submitting position:", error);
      toast.error("An error occurred");
    }
  };

  const handleDelete = async (positionId: string) => {
    if (confirm("Are you sure you want to delete this position?")) {
      const result = await positionMutations.remove(positionId);
      if (result.success) {
        toast.success("Position deleted");
      } else {
        toast.error("Failed to delete position");
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-green-500";
      case "closed":
        return "bg-gray-500";
      case "on_hold":
        return "bg-yellow-500";
      default:
        return "bg-blue-500";
    }
  };

  const getTypeLabel = (type: string) => {
    return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Loading positions...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Job Positions</h2>
            <p className="text-sm text-muted-foreground">
              {positions.length} position{positions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            New Position
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {positions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Briefcase size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No positions yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first job position to start recruiting
              </p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-1" />
                Create Position
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {positions.map((position) => (
              <Card key={position.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-base">{position.title}</CardTitle>
                        <Badge className={getStatusColor(position.status)}>
                          {getTypeLabel(position.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {position.department}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {position.location}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getTypeLabel(position.type)}
                        </Badge>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(position)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(position.id)}
                          className="text-destructive"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {position.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {position.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {position.openings} opening{position.openings !== 1 ? "s" : ""}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(position.createdAt.toDate(), "MMM d, yyyy")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <JobPositionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        position={editingPosition}
        onSubmit={handleSubmit}
        loading={positionMutations.loading}
      />
    </div>
  );
}
