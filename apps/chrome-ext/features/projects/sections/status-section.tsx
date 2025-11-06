import React, { useState, useEffect } from "react";
import { Plus, Edit, Trash2, GripVertical, Star, CheckCircle2 } from "lucide-react";
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StatusFormDialog } from "../components/status-form-dialog";
import {
  useProjectStatuses,
  useStatusMutations,
} from "../hooks";
import type { ProjectStatus, CreateProjectStatusDto } from "../entity";
import { toast } from "sonner";

interface StatusSectionProps {
  projectId: string;
}

// Sortable Status Item Component
function SortableStatusItem({
  status,
  index,
  onEdit,
  onDelete,
}: {
  status: ProjectStatus;
  index: number;
  onEdit: (status: ProjectStatus) => void;
  onDelete: (statusId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-4 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="text-muted-foreground cursor-move hover:text-foreground"
      >
        <GripVertical size={16} />
      </div>

      {/* Order */}
      <div className="flex-shrink-0 w-8 text-center">
        <span className="text-sm font-medium text-muted-foreground">{index + 1}</span>
      </div>

      {/* Color Badge */}
      <div
        className="flex-shrink-0 w-4 h-4 rounded"
        style={{ backgroundColor: status.color }}
      />

      {/* Name */}
      <div className="flex-1">
        <div className="font-medium">{status.name}</div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          {status.isDefault && (
            <span className="flex items-center gap-1">
              <Star size={12} className="text-yellow-500 fill-yellow-500" />
              Default
            </span>
          )}
          {status.isFinal && (
            <span className="flex items-center gap-1">
              <CheckCircle2 size={12} className="text-green-500" />
              Final
            </span>
          )}
          {!status.isDefault && !status.isFinal && (
            <span className="text-muted-foreground">Order: {status.order}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onEdit(status)}
          className="h-8 w-8 p-0"
        >
          <Edit size={14} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(status.id)}
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}

export function StatusSection({ projectId }: StatusSectionProps) {
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<ProjectStatus | undefined>();
  const [deletingStatusId, setDeletingStatusId] = useState<string | undefined>();

  const { statuses, loading } = useProjectStatuses(projectId);
  const statusMutations = useStatusMutations();

  // Sort by order
  const [sortedStatuses, setSortedStatuses] = useState<ProjectStatus[]>([]);

  useEffect(() => {
    setSortedStatuses([...statuses].sort((a, b) => a.order - b.order));
  }, [statuses]);

  // Drag and Drop Sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Drag End Handler
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedStatuses.findIndex((s) => s.id === active.id);
      const newIndex = sortedStatuses.findIndex((s) => s.id === over.id);

      const newOrder = arrayMove(sortedStatuses, oldIndex, newIndex);
      setSortedStatuses(newOrder);

      // Update all statuses with new order
      try {
        const updatePromises = newOrder.map((status, index) =>
          statusMutations.update(status.id, { order: index + 1 })
        );
        await Promise.all(updatePromises);
        toast.success("Status order updated");
      } catch (error) {
        toast.error("Failed to update status order");
        // Revert to original order
        setSortedStatuses([...statuses].sort((a, b) => a.order - b.order));
      }
    }
  };

  // Handlers
  const handleAddStatus = () => {
    setEditingStatus(undefined);
    setStatusDialogOpen(true);
  };

  const handleEditStatus = (status: ProjectStatus) => {
    setEditingStatus(status);
    setStatusDialogOpen(true);
  };

  const handleDeleteStatus = async (statusId: string) => {
    const result = await statusMutations.remove(statusId);
    if (result.success) {
      toast.success("Status deleted successfully");
      setDeletingStatusId(undefined);
    } else {
      toast.error("Failed to delete status");
    }
  };

  const handleSubmitStatus = async (data: CreateProjectStatusDto) => {
    try {
      if (editingStatus) {
        const result = await statusMutations.update(editingStatus.id, data);
        if (result.success) {
          toast.success("Status updated successfully");
          handleCloseDialog();
        } else {
          toast.error("Failed to update status");
        }
      } else {
        const result = await statusMutations.create(projectId, data);
        if (result.success) {
          toast.success("Status created successfully");
          handleCloseDialog();
        } else {
          toast.error("Failed to create status");
        }
      }
    } catch (error) {
      console.error("Error submitting status:", error);
      toast.error("An error occurred");
    }
  };

  const handleCloseDialog = () => {
    setStatusDialogOpen(false);
    setEditingStatus(undefined);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading statuses...</p>
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
            <h3 className="font-semibold">Workflow Statuses</h3>
            <p className="text-xs text-muted-foreground">
              {sortedStatuses.length} status{sortedStatuses.length !== 1 ? "es" : ""}
            </p>
          </div>
          <Button size="sm" onClick={handleAddStatus}>
            <Plus size={14} className="mr-1" />
            Add Status
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {sortedStatuses.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">🔄</div>
            <p className="text-muted-foreground mb-4">No statuses yet</p>
            <Button onClick={handleAddStatus}>
              <Plus size={16} className="mr-2" />
              Create First Status
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedStatuses.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="max-w-3xl mx-auto space-y-2">
                {sortedStatuses.map((status, index) => (
                  <SortableStatusItem
                    key={status.id}
                    status={status}
                    index={index}
                    onEdit={handleEditStatus}
                    onDelete={setDeletingStatusId}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Info */}
        {sortedStatuses.length > 0 && (
          <div className="max-w-3xl mx-auto mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-medium mb-2">Tips:</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Drag and drop statuses to reorder them</li>
              <li>• Order determines the position in the kanban board</li>
              <li>• Set one status as "Default" for new tasks</li>
              <li>• Set one status as "Final" for completed tasks</li>
              <li>• Tasks will automatically use these statuses in the board</li>
            </ul>
          </div>
        )}
      </div>

      {/* Status Form Dialog */}
      <StatusFormDialog
        open={statusDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseDialog();
          else setStatusDialogOpen(open);
        }}
        status={editingStatus}
        existingStatuses={statuses}
        onSubmit={handleSubmitStatus}
        loading={statusMutations.loading}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingStatusId}
        onOpenChange={(open) => !open && setDeletingStatusId(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Status?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the status from your project. Tasks with this status will need
              to be updated manually. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingStatusId && handleDeleteStatus(deletingStatusId)}
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
