import React, { useState, useMemo } from "react";
import { LayoutGrid, List, Calendar as CalendarIcon, TrendingUp, Save, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
  useTasksWithDetails,
  useProjectViews,
  useViewMutations,
} from "../hooks";
import type {
  ViewType,
  GroupBy,
  TaskSortBy,
  SortDirection,
  CreateViewDto,
  TaskWithDetails,
  ProjectLabel,
} from "../entity";
import {
  ViewType as ViewTypeEnum,
  GroupBy as GroupByEnum,
  VIEW_TYPE_LABELS,
  VIEW_TYPE_ICONS,
  GROUP_BY_LABELS,
  TASK_TYPE_LABELS,
  TASK_TYPE_COLORS,
} from "../entity";
import { toast } from "sonner";

interface ViewsSectionProps {
  projectId: string;
}

export function ViewsSection({ projectId }: ViewsSectionProps) {
  const [currentViewType, setCurrentViewType] = useState<ViewType>(ViewTypeEnum.BOARD);
  const [groupBy, setGroupBy] = useState<GroupBy>(GroupByEnum.STATUS);
  const [sortBy, setSortBy] = useState<TaskSortBy>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [saveViewDialogOpen, setSaveViewDialogOpen] = useState(false);
  const [viewName, setViewName] = useState("");

  const { tasksWithDetails, loading } = useTasksWithDetails(projectId);
  const { views } = useProjectViews(projectId);
  const viewMutations = useViewMutations();

  // Group tasks
  const groupedTasks = useMemo(() => {
    const groups: Record<string, { label: string; tasks: TaskWithDetails[]; color?: string }> = {};

    tasksWithDetails.forEach((task: TaskWithDetails) => {
      let groupKey = "";
      let groupLabel = "";
      let groupColor: string | undefined;

      switch (groupBy) {
        case GroupByEnum.STATUS:
          groupKey = task.status?.id || "none";
          groupLabel = task.status?.name || "No Status";
          groupColor = task.status?.color;
          break;
        case GroupByEnum.PRIORITY:
          groupKey = task.priority?.id || "none";
          groupLabel = task.priority?.name || "No Priority";
          groupColor = task.priority?.color;
          break;
        case GroupByEnum.EPIC:
          groupKey = task.epic?.id || "none";
          groupLabel = task.epic?.name || "No Epic";
          groupColor = task.epic?.color;
          break;
        case GroupByEnum.CYCLE:
          groupKey = task.cycle?.id || "none";
          groupLabel = task.cycle?.name || "No Cycle";
          break;
        case GroupByEnum.ASSIGNEE:
          groupKey = task.assigneeId || "unassigned";
          groupLabel = task.assigneeId ? `User ${task.assigneeId.slice(0, 8)}` : "Unassigned";
          break;
        case GroupByEnum.LABEL:
          if (task.labels && task.labels.length > 0) {
            task.labels.forEach((label: ProjectLabel) => {
              const key = label.id;
              if (!groups[key]) {
                groups[key] = { label: label.name, tasks: [], color: label.color };
              }
              groups[key].tasks.push(task);
            });
            return;
          } else {
            groupKey = "none";
            groupLabel = "No Label";
          }
          break;
        default:
          groupKey = "all";
          groupLabel = "All Tasks";
      }

      if (!groups[groupKey]) {
        groups[groupKey] = { label: groupLabel, tasks: [], color: groupColor };
      }
      groups[groupKey].tasks.push(task);
    });

    return groups;
  }, [tasksWithDetails, groupBy]);

  // Sort tasks within groups
  const sortedGroups = useMemo(() => {
    const sorted = { ...groupedTasks };
    Object.keys(sorted).forEach((key) => {
      sorted[key].tasks.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortBy) {
          case "title":
            aValue = a.title.toLowerCase();
            bValue = b.title.toLowerCase();
            break;
          case "createdAt":
            aValue = a.createdAt?.toDate?.() || new Date(a.createdAt);
            bValue = b.createdAt?.toDate?.() || new Date(b.createdAt);
            break;
          case "updatedAt":
            aValue = a.updatedAt?.toDate?.() || new Date(a.updatedAt);
            bValue = b.updatedAt?.toDate?.() || new Date(b.updatedAt);
            break;
          case "dueDate":
            aValue = a.dueDate ? (a.dueDate?.toDate?.() || new Date(a.dueDate)) : new Date(9999, 0);
            bValue = b.dueDate ? (b.dueDate?.toDate?.() || new Date(b.dueDate)) : new Date(9999, 0);
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    });
    return sorted;
  }, [groupedTasks, sortBy, sortDirection]);

  const handleSaveView = async () => {
    if (!viewName.trim()) {
      toast.error("View name is required");
      return;
    }

    const data: CreateViewDto = {
      name: viewName.trim(),
      viewType: currentViewType,
      groupBy,
      sortBy,
      sortDirection,
    };

    try {
      const result = await viewMutations.create(projectId, data);
      if (result.success) {
        toast.success("View saved");
        setSaveViewDialogOpen(false);
        setViewName("");
      } else {
        toast.error("Failed to save view");
      }
    } catch (error) {
      console.error("Error saving view:", error);
      toast.error("An error occurred");
    }
  };

  const loadView = (viewId: string) => {
    const view = views.find((v) => v.id === viewId);
    if (view) {
      setCurrentViewType(view.viewType);
      setGroupBy(view.groupBy);
      setSortBy(view.sortBy);
      setSortDirection(view.sortDirection);
      toast.success(`Loaded view: ${view.name}`);
    }
  };

  const renderBoardView = () => (
    <div className="flex gap-4 h-full overflow-x-auto pb-4">
      {Object.entries(sortedGroups).map(([key, group]) => (
        <div key={key} className="flex-shrink-0 w-80">
          <div className="mb-2 flex items-center gap-2">
            {group.color && (
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: group.color }}
              />
            )}
            <h4 className="font-semibold">{group.label}</h4>
            <span className="text-xs text-muted-foreground">({group.tasks.length})</span>
          </div>
          <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
            {group.tasks.map((task) => (
              <div
                key={task.id}
                className="p-3 border rounded-lg bg-background hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-2 mb-2">
                  <span
                    className="px-1.5 py-0.5 text-xs rounded"
                    style={{
                      backgroundColor: `${TASK_TYPE_COLORS[task.type]}20`,
                      color: TASK_TYPE_COLORS[task.type],
                    }}
                  >
                    {TASK_TYPE_LABELS[task.type]}
                  </span>
                </div>
                <h5 className="font-medium text-sm mb-1">{task.title}</h5>
                {task.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {task.description}
                  </p>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {task.priority && (
                    <span
                      className="px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: `${task.priority.color}20`,
                        color: task.priority.color,
                      }}
                    >
                      {task.priority.name}
                    </span>
                  )}
                  {task.epic && <span>Epic: {task.epic.name}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderListView = () => (
    <div className="space-y-2">
      {Object.entries(sortedGroups).map(([key, group]) => (
        <div key={key}>
          <div className="mb-2 flex items-center gap-2 sticky top-0 bg-background py-2">
            {group.color && (
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: group.color }}
              />
            )}
            <h4 className="font-semibold">{group.label}</h4>
            <span className="text-xs text-muted-foreground">({group.tasks.length})</span>
          </div>
          <div className="space-y-1">
            {group.tasks.map((task) => (
              <div
                key={task.id}
                className="p-2 border-l-4 bg-background hover:bg-muted/50 transition-colors flex items-center justify-between"
                style={{ borderLeftColor: task.status?.color || "#ccc" }}
              >
                <div className="flex-1 flex items-center gap-3">
                  <span
                    className="px-2 py-0.5 text-xs rounded"
                    style={{
                      backgroundColor: `${TASK_TYPE_COLORS[task.type]}20`,
                      color: TASK_TYPE_COLORS[task.type],
                    }}
                  >
                    {TASK_TYPE_LABELS[task.type]}
                  </span>
                  <span className="font-medium">{task.title}</span>
                  {task.priority && (
                    <span
                      className="px-1.5 py-0.5 text-xs rounded"
                      style={{
                        backgroundColor: `${task.priority.color}20`,
                        color: task.priority.color,
                      }}
                    >
                      {task.priority.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {task.epic && <span>{task.epic.name}</span>}
                  {task.cycle && <span>{task.cycle.name}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTimelineView = () => (
    <div className="p-4">
      <div className="text-center py-12">
        <TrendingUp size={64} className="mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Timeline View</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Timeline/Gantt chart visualization is coming soon. This will show task timelines based on due dates and dependencies.
        </p>
      </div>
    </div>
  );

  const renderCalendarView = () => (
    <div className="p-4">
      <div className="text-center py-12">
        <CalendarIcon size={64} className="mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Calendar View</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Calendar visualization is coming soon. This will show tasks organized by their due dates in a monthly/weekly calendar format.
        </p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading tasks...</p>
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
            <h3 className="font-semibold">Custom Views</h3>
            <p className="text-xs text-muted-foreground">
              {tasksWithDetails.length} task{tasksWithDetails.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button size="sm" onClick={() => setSaveViewDialogOpen(true)}>
            <Save size={14} className="mr-1" />
            Save View
          </Button>
        </div>

        {/* Saved Views */}
        {views.length > 0 && (
          <div className="mb-3 flex gap-2 flex-wrap">
            {views.map((view) => (
              <button
                key={view.id}
                onClick={() => loadView(view.id)}
                className="px-3 py-1.5 text-xs border rounded-md hover:bg-muted transition-colors flex items-center gap-1"
              >
                <span>{VIEW_TYPE_ICONS[view.viewType]}</span>
                <span>{view.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* View Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Type Switcher */}
          <div className="flex border rounded-md overflow-hidden">
            {Object.entries(ViewTypeEnum).map(([key, value]) => (
              <button
                key={value}
                onClick={() => setCurrentViewType(value)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  currentViewType === value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                title={VIEW_TYPE_LABELS[value]}
              >
                {value === ViewTypeEnum.BOARD && <LayoutGrid size={14} />}
                {value === ViewTypeEnum.LIST && <List size={14} />}
                {value === ViewTypeEnum.TIMELINE && <TrendingUp size={14} />}
                {value === ViewTypeEnum.CALENDAR && <CalendarIcon size={14} />}
              </button>
            ))}
          </div>

          {/* Group By */}
          <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(GroupByEnum).map(([key, value]) => (
                <SelectItem key={value} value={value}>
                  Group by {GROUP_BY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort By */}
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as TaskSortBy)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Created Date</SelectItem>
              <SelectItem value="updatedAt">Updated Date</SelectItem>
              <SelectItem value="dueDate">Due Date</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort Direction */}
          <Select value={sortDirection} onValueChange={(value) => setSortDirection(value as SortDirection)}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Ascending</SelectItem>
              <SelectItem value="desc">Descending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {currentViewType === ViewTypeEnum.BOARD && renderBoardView()}
        {currentViewType === ViewTypeEnum.LIST && renderListView()}
        {currentViewType === ViewTypeEnum.TIMELINE && renderTimelineView()}
        {currentViewType === ViewTypeEnum.CALENDAR && renderCalendarView()}
      </div>

      {/* Save View Dialog */}
      <Dialog open={saveViewDialogOpen} onOpenChange={setSaveViewDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
            <DialogDescription>
              Save your current view configuration for quick access later
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="viewName">
                View Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="viewName"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="e.g., My Sprint Board"
              />
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>Current configuration:</p>
              <ul className="list-disc list-inside">
                <li>View type: {VIEW_TYPE_LABELS[currentViewType]}</li>
                <li>Group by: {GROUP_BY_LABELS[groupBy]}</li>
                <li>Sort by: {sortBy}</li>
                <li>Direction: {sortDirection}</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveViewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveView} disabled={!viewName.trim() || viewMutations.loading}>
              {viewMutations.loading ? "Saving..." : "Save View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
