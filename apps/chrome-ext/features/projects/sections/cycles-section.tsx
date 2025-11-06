import React, { useState, useMemo } from "react";
import { Plus, Edit, Trash2, Calendar, Target, TrendingUp, Users } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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
  useCyclesWithStats,
  useCycleMutations,
} from "../hooks";
import type {
  Cycle,
  CreateCycleDto,
  CycleType,
  CycleStatus,
} from "../entity";
import {
  CycleType as CycleTypeEnum,
  CycleStatus as CycleStatusEnum,
  CYCLE_TYPE_LABELS,
  CYCLE_TYPE_ICONS,
  CYCLE_STATUS_LABELS,
  CYCLE_STATUS_COLORS,
} from "../entity";
import { toast } from "sonner";

interface CyclesSectionProps {
  projectId: string;
}

export function CyclesSection({ projectId }: CyclesSectionProps) {
  const [cycleDialogOpen, setCycleDialogOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<Cycle | undefined>();
  const [deletingCycleId, setDeletingCycleId] = useState<string | undefined>();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<CycleType>(CycleTypeEnum.SPRINT);
  const [status, setStatus] = useState<CycleStatus>(CycleStatusEnum.PLANNED);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [goals, setGoals] = useState("");
  const [plannedPoints, setPlannedPoints] = useState("");

  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { cyclesWithStats, loading } = useCyclesWithStats(projectId);
  const cycleMutations = useCycleMutations();

  // Filter cycles
  const filteredCycles = useMemo(() => {
    let filtered = [...cyclesWithStats];

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter((cycle) => cycle.type === filterType);
    }

    // Filter by status
    if (filterStatus !== "all") {
      filtered = filtered.filter((cycle) => cycle.status === filterStatus);
    }

    return filtered;
  }, [cyclesWithStats, filterType, filterStatus]);

  // Active cycle
  const activeCycle = cyclesWithStats.find((c) => c.status === CycleStatusEnum.ACTIVE);

  const handleAddCycle = () => {
    setEditingCycle(undefined);
    setName("");
    setDescription("");
    setType(CycleTypeEnum.SPRINT);
    setStatus(CycleStatusEnum.PLANNED);
    setStartDate("");
    setEndDate("");
    setGoals("");
    setPlannedPoints("");
    setCycleDialogOpen(true);
  };

  const handleEditCycle = (cycle: Cycle) => {
    setEditingCycle(cycle);
    setName(cycle.name);
    setDescription(cycle.description || "");
    setType(cycle.type);
    setStatus(cycle.status);

    const start = cycle.startDate?.toDate?.() || new Date(cycle.startDate);
    const end = cycle.endDate?.toDate?.() || new Date(cycle.endDate);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);

    setGoals(cycle.goals || "");
    setPlannedPoints(cycle.plannedPoints?.toString() || "");
    setCycleDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!startDate || !endDate) {
      toast.error("Start and end dates are required");
      return;
    }

    const data: CreateCycleDto = {
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      status,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      goals: goals.trim() || undefined,
      plannedPoints: plannedPoints ? parseInt(plannedPoints, 10) : undefined,
    };

    try {
      if (editingCycle) {
        const result = await cycleMutations.update(editingCycle.id, data);
        if (result.success) {
          toast.success("Cycle updated");
          handleCloseDialog();
        } else {
          toast.error("Failed to update cycle");
        }
      } else {
        const result = await cycleMutations.create(projectId, data);
        if (result.success) {
          toast.success("Cycle created");
          handleCloseDialog();
        } else {
          toast.error("Failed to create cycle");
        }
      }
    } catch (error) {
      console.error("Error submitting cycle:", error);
      toast.error("An error occurred");
    }
  };

  const handleCloseDialog = () => {
    setCycleDialogOpen(false);
    setEditingCycle(undefined);
  };

  const handleDelete = async (cycleId: string) => {
    const result = await cycleMutations.remove(cycleId);
    if (result.success) {
      toast.success("Cycle deleted");
      setDeletingCycleId(undefined);
    } else {
      toast.error("Failed to delete cycle");
    }
  };

  const formatDate = (date: any) => {
    const d = date?.toDate?.() || new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading cycles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-background">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">Cycles</h3>
            <p className="text-xs text-muted-foreground">
              {filteredCycles.length} cycle{filteredCycles.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button size="sm" onClick={handleAddCycle}>
            <Plus size={14} className="mr-1" />
            New Cycle
          </Button>
        </div>

        {/* Active Cycle Summary */}
        {activeCycle && (
          <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-950 mb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{CYCLE_TYPE_ICONS[activeCycle.type]}</span>
                  <h4 className="font-medium">{activeCycle.name}</h4>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-500 text-white">
                    ACTIVE
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {formatDate(activeCycle.startDate)} - {formatDate(activeCycle.endDate)}
                  </span>
                  <span>{activeCycle.daysRemaining} days remaining</span>
                  <span>{activeCycle.taskCount} tasks</span>
                  <span>{activeCycle.progress}% complete</span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-2">
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${activeCycle.progress}%` }}
                />
              </div>
            </div>

            {/* Velocity */}
            {activeCycle.velocity && (
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp size={12} />
                Velocity: {activeCycle.velocity.toFixed(1)} points/day
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(CycleTypeEnum).map(([key, value]) => (
                <SelectItem key={value} value={value}>
                  <div className="flex items-center gap-2">
                    <span>{CYCLE_TYPE_ICONS[value]}</span>
                    <span>{CYCLE_TYPE_LABELS[value]}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {Object.entries(CycleStatusEnum).map(([key, value]) => (
                <SelectItem key={value} value={value}>
                  {CYCLE_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {filteredCycles.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Calendar size={64} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No cycles yet</p>
              <Button onClick={handleAddCycle}>
                <Plus size={16} className="mr-2" />
                Create First Cycle
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-3">
            {filteredCycles.map((cycle) => (
              <div
                key={cycle.id}
                className="p-4 border rounded-lg bg-background hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{CYCLE_TYPE_ICONS[cycle.type]}</span>
                      <h5 className="font-medium">{cycle.name}</h5>
                      <span
                        className="px-2 py-0.5 text-xs rounded"
                        style={{
                          backgroundColor: `${CYCLE_STATUS_COLORS[cycle.status]}20`,
                          color: CYCLE_STATUS_COLORS[cycle.status],
                        }}
                      >
                        {CYCLE_STATUS_LABELS[cycle.status]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {CYCLE_TYPE_LABELS[cycle.type]}
                      </span>
                    </div>

                    {cycle.description && (
                      <p className="text-sm text-muted-foreground mb-2">{cycle.description}</p>
                    )}

                    {cycle.goals && (
                      <div className="mb-2 flex items-start gap-1 text-sm">
                        <Target size={14} className="mt-0.5 text-muted-foreground" />
                        <span className="text-muted-foreground">{cycle.goals}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(cycle.startDate)} - {formatDate(cycle.endDate)}
                      </span>
                      <span>{cycle.daysRemaining} days remaining</span>
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {cycle.taskCount} tasks
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{cycle.progress}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${cycle.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Points & Velocity */}
                    {(cycle.plannedPoints || cycle.completedPoints || cycle.velocity) && (
                      <div className="flex items-center gap-4 text-xs">
                        {cycle.plannedPoints && (
                          <span className="text-muted-foreground">
                            Planned: {cycle.plannedPoints} pts
                          </span>
                        )}
                        {cycle.completedPoints !== undefined && (
                          <span className="text-muted-foreground">
                            Completed: {cycle.completedPoints} pts
                          </span>
                        )}
                        {cycle.velocity && (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <TrendingUp size={12} />
                            {cycle.velocity.toFixed(1)} pts/day
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEditCycle(cycle)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeletingCycleId(cycle.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cycle Dialog */}
      <Dialog open={cycleDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingCycle ? "Edit Cycle" : "Create Cycle"}</DialogTitle>
            <DialogDescription>
              {editingCycle ? "Update cycle details" : "Create a new sprint or release"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Sprint 1, Release 1.0"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
                <Select value={type} onValueChange={(value) => setType(value as CycleType)}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CycleTypeEnum).map(([key, value]) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <span>{CYCLE_TYPE_ICONS[value]}</span>
                          <span>{CYCLE_TYPE_LABELS[value]}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as CycleStatus)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CycleStatusEnum).map(([key, value]) => (
                      <SelectItem key={value} value={value}>
                        {CYCLE_STATUS_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="startDate">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="endDate">
                  End Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="goals">Goals</Label>
              <Textarea
                id="goals"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="Sprint/release goals..."
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="plannedPoints">Planned Story Points</Label>
              <Input
                id="plannedPoints"
                type="number"
                value={plannedPoints}
                onChange={(e) => setPlannedPoints(e.target.value)}
                placeholder="e.g., 40"
                min="0"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || !startDate || !endDate || cycleMutations.loading}
            >
              {cycleMutations.loading ? "Saving..." : editingCycle ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingCycleId}
        onOpenChange={(open) => !open && setDeletingCycleId(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cycle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this cycle. Tasks assigned to this cycle will not be
              deleted but will be unassigned from it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingCycleId && handleDelete(deletingCycleId)}
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
