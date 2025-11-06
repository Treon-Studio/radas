import React, { useState } from "react";
import { Plus, Edit, Trash2, Target } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { EpicFormDialog } from "../components/epic-form-dialog";
import { useProjectEpics, useEpicMutations, useProjectWithData } from "../hooks";
import type { Epic, CreateEpicDto, EpicWithTaskCount } from "../entity";
import { EPIC_STATUS_LABELS, EPIC_STATUS_COLORS } from "../entity";
import { toast } from "sonner";

interface EpicsSectionProps {
  projectId: string;
}

export function EpicsSection({ projectId }: EpicsSectionProps) {
  const [epicDialogOpen, setEpicDialogOpen] = useState(false);
  const [editingEpic, setEditingEpic] = useState<Epic | undefined>();
  const [deletingEpicId, setDeletingEpicId] = useState<string | undefined>();

  const { epicsWithTaskCount, loading } = useProjectWithData(projectId);
  const epicMutations = useEpicMutations();

  // Handlers
  const handleAddEpic = () => {
    setEditingEpic(undefined);
    setEpicDialogOpen(true);
  };

  const handleEditEpic = (epic: Epic) => {
    setEditingEpic(epic);
    setEpicDialogOpen(true);
  };

  const handleDeleteEpic = async (epicId: string) => {
    const result = await epicMutations.remove(epicId);
    if (result.success) {
      toast.success("Epic deleted successfully");
      setDeletingEpicId(undefined);
    } else {
      toast.error("Failed to delete epic");
    }
  };

  const handleSubmitEpic = async (data: CreateEpicDto) => {
    try {
      if (editingEpic) {
        const result = await epicMutations.update(editingEpic.id, data);
        if (result.success) {
          toast.success("Epic updated successfully");
          handleCloseDialog();
        } else {
          toast.error("Failed to update epic");
        }
      } else {
        const result = await epicMutations.create(projectId, data);
        if (result.success) {
          toast.success("Epic created successfully");
          handleCloseDialog();
        } else {
          toast.error("Failed to create epic");
        }
      }
    } catch (error) {
      console.error("Error submitting epic:", error);
      toast.error("An error occurred");
    }
  };

  const handleCloseDialog = () => {
    setEpicDialogOpen(false);
    setEditingEpic(undefined);
  };

  const renderEpicCard = (epic: EpicWithTaskCount) => (
    <div
      key={epic.id}
      className="border rounded-lg p-4 bg-background hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div
            className="w-1 h-16 rounded-full flex-shrink-0"
            style={{ backgroundColor: epic.color || "#a855f7" }}
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-lg mb-1 truncate">{epic.name}</h4>
            {epic.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{epic.description}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleEditEpic(epic)}
            className="h-8 w-8 p-0"
          >
            <Edit size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeletingEpicId(epic.id)}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="px-2 py-1 rounded text-xs font-medium text-white"
          style={{ backgroundColor: EPIC_STATUS_COLORS[epic.status] }}
        >
          {EPIC_STATUS_LABELS[epic.status]}
        </div>
        <div className="text-xs text-muted-foreground">
          {epic.taskCount} task{epic.taskCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{epic.progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${epic.progress}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {epic.completedTaskCount} of {epic.taskCount} completed
        </div>
      </div>

      {/* Dates */}
      {(epic.startDate || epic.dueDate) && (
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          {epic.startDate && (
            <span>Start: {formatDate(epic.startDate)}</span>
          )}
          {epic.dueDate && (
            <span>Due: {formatDate(epic.dueDate)}</span>
          )}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading epics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Epics</h3>
            <p className="text-xs text-muted-foreground">
              {epicsWithTaskCount.length} epic{epicsWithTaskCount.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button size="sm" onClick={handleAddEpic}>
            <Plus size={14} className="mr-1" />
            Create Epic
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {epicsWithTaskCount.length === 0 ? (
          <div className="text-center py-12">
            <Target size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No epics yet</p>
            <p className="text-sm text-muted-foreground mb-6">
              Epics help you group and track large features across multiple tasks
            </p>
            <Button onClick={handleAddEpic}>
              <Plus size={16} className="mr-2" />
              Create First Epic
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 max-w-4xl mx-auto">
            {epicsWithTaskCount.map((epic) => renderEpicCard(epic))}
          </div>
        )}
      </div>

      {/* Epic Form Dialog */}
      <EpicFormDialog
        open={epicDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseDialog();
          else setEpicDialogOpen(open);
        }}
        epic={editingEpic}
        onSubmit={handleSubmitEpic}
        loading={epicMutations.loading}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingEpicId}
        onOpenChange={(open) => !open && setDeletingEpicId(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Epic?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the epic. Tasks linked to this epic will not be deleted, but will be unlinked.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingEpicId && handleDeleteEpic(deletingEpicId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatDate(date: any): string {
  if (!date) return "";
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
