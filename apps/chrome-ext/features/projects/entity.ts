// ============ Enums ============

export const TaskType = {
  TASK: "task",
  BUG: "bug",
  STORY: "story",
  EPIC: "epic",
} as const;

export type TaskType = (typeof TaskType)[keyof typeof TaskType];

// ============ Dynamic Config Entities ============

export interface ProjectStatus {
  id: string;
  name: string;
  color: string;
  order: number;
  projectId: string;
  isDefault?: boolean; // Default status when creating task
  isFinal?: boolean; // Final status (like "Done")
}

export interface ProjectLabel {
  id: string;
  name: string;
  color: string;
  projectId: string;
}

export interface ProjectPriority {
  id: string;
  name: string;
  color: string;
  order: number; // Lower number = higher priority
  projectId: string;
  isDefault?: boolean;
}

// ============ Core Entities ============

export interface Project {
  id: string;
  name: string;
  description?: string;
  key: string; // Project key (e.g., "PROJ", "DEV")
  workspaceId: string; // Workspace this project belongs to
  userId: string; // Owner
  assigneeIds?: string[]; // Array of user IDs assigned to this project
  startDate?: any; // Project start date
  endDate?: any; // Project end date
  color?: string;
  icon?: string;
  defaultStatusId?: string; // Default status for new tasks
  defaultPriorityId?: string; // Default priority for new tasks
  createdAt: any;
  updatedAt: any;
}

export interface Epic {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  userId: string; // Creator
  color?: string;
  startDate?: any;
  dueDate?: any;
  status: "planning" | "in_progress" | "completed" | "cancelled";
  createdAt: any;
  updatedAt: any;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  statusId: string; // Reference to ProjectStatus
  priorityId: string; // Reference to ProjectPriority
  projectId: string;
  epicId?: string; // Reference to Epic
  cycleId?: string; // Reference to Cycle (Sprint/Release)
  userId: string; // Creator
  assigneeId?: string; // Assigned user
  labelIds?: string[]; // References to ProjectLabel
  dueDate?: any;
  estimatedStartDate?: any; // NEW: Estimated start date with time
  estimatedEndDate?: any; // NEW: Estimated end date with time
  estimatedHours?: number;
  completedAt?: any;
  createdAt: any;
  updatedAt: any;
}

// ============ Create/Update DTOs ============

export interface CreateProjectDto {
  name: string;
  description?: string;
  key: string;
  workspaceId: string; // Required when creating project
  assigneeIds?: string[]; // Users assigned to project
  startDate?: any; // Project start date
  endDate?: any; // Project end date
  color?: string;
  icon?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  assigneeIds?: string[]; // Users assigned to project
  startDate?: any; // Project start date
  endDate?: any; // Project end date
  key?: string;
  color?: string;
  icon?: string;
  defaultStatusId?: string;
  defaultPriorityId?: string;
}

export interface CreateProjectStatusDto {
  name: string;
  color: string;
  order: number;
  isDefault?: boolean;
  isFinal?: boolean;
}

export interface UpdateProjectStatusDto {
  name?: string;
  color?: string;
  order?: number;
  isDefault?: boolean;
  isFinal?: boolean;
}

export interface CreateProjectLabelDto {
  name: string;
  color: string;
}

export interface UpdateProjectLabelDto {
  name?: string;
  color?: string;
}

export interface CreateProjectPriorityDto {
  name: string;
  color: string;
  order: number;
  isDefault?: boolean;
}

export interface UpdateProjectPriorityDto {
  name?: string;
  color?: string;
  order?: number;
  isDefault?: boolean;
}

export interface CreateEpicDto {
  name: string;
  description?: string;
  color?: string;
  startDate?: Date | null;
  dueDate?: Date | null;
  status: "planning" | "in_progress" | "completed" | "cancelled";
}

export interface UpdateEpicDto {
  name?: string;
  description?: string;
  color?: string;
  startDate?: Date | null;
  dueDate?: Date | null;
  status?: "planning" | "in_progress" | "completed" | "cancelled";
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  type: TaskType;
  statusId: string;
  priorityId: string;
  projectId: string;
  epicId?: string;
  cycleId?: string;
  assigneeId?: string;
  labelIds?: string[];
  dueDate?: Date | null;
  estimatedStartDate?: Date | null; // NEW
  estimatedEndDate?: Date | null; // NEW
  estimatedHours?: number;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  type?: TaskType;
  statusId?: string;
  priorityId?: string;
  projectId?: string;
  epicId?: string;
  cycleId?: string;
  assigneeId?: string;
  labelIds?: string[];
  dueDate?: Date | null;
  estimatedStartDate?: Date | null; // NEW
  estimatedEndDate?: Date | null; // NEW
  estimatedHours?: number;
  completedAt?: Date | null;
}

// ============ Filter/Sort Types ============

export interface TaskFilters {
  projectId?: string;
  statusId?: string;
  priorityId?: string;
  type?: TaskType;
  assigneeId?: string;
  labelIds?: string[];
}

export type TaskSortBy = "createdAt" | "updatedAt" | "dueDate" | "title";
export type SortDirection = "asc" | "desc";

// ============ View Types ============

export interface ProjectWithTaskCount extends Project {
  taskCount: number;
  statusCounts: Record<string, number>; // statusId -> count
}

export interface TasksByStatus {
  [statusId: string]: Task[];
}

export interface TaskWithDetails extends Task {
  status?: ProjectStatus;
  priority?: ProjectPriority;
  labels?: ProjectLabel[];
  epic?: Epic;
  cycle?: Cycle;
}

export interface EpicWithTaskCount extends Epic {
  taskCount: number;
  completedTaskCount: number;
  progress: number; // 0-100
}

// ============ Helper Constants ============

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  [TaskType.TASK]: "Task",
  [TaskType.BUG]: "Bug",
  [TaskType.STORY]: "Story",
  [TaskType.EPIC]: "Epic",
};

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  [TaskType.TASK]: "#3b82f6", // blue
  [TaskType.BUG]: "#ef4444", // red
  [TaskType.STORY]: "#22c55e", // green
  [TaskType.EPIC]: "#a855f7", // purple
};

export const EPIC_STATUS_LABELS = {
  planning: "Planning",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;

export const EPIC_STATUS_COLORS = {
  planning: "#6b7280", // gray
  in_progress: "#3b82f6", // blue
  completed: "#22c55e", // green
  cancelled: "#ef4444", // red
} as const;

// ============ Default Values ============

export const DEFAULT_PROJECT_STATUSES: CreateProjectStatusDto[] = [
  { name: "To Do", color: "#6b7280", order: 1, isDefault: true, isFinal: false },
  { name: "In Progress", color: "#3b82f6", order: 2, isDefault: false, isFinal: false },
  { name: "In Review", color: "#f59e0b", order: 3, isDefault: false, isFinal: false },
  { name: "Ready for Testing", color: "#a855f7", order: 4, isDefault: false, isFinal: false },
  { name: "Done", color: "#22c55e", order: 5, isDefault: false, isFinal: true },
];

export const DEFAULT_PROJECT_PRIORITIES: CreateProjectPriorityDto[] = [
  { name: "Critical", color: "#ef4444", order: 1, isDefault: false },
  { name: "High", color: "#f59e0b", order: 2, isDefault: false },
  { name: "Medium", color: "#3b82f6", order: 3, isDefault: true },
  { name: "Low", color: "#6b7280", order: 4, isDefault: false },
];

// ============ Time Tracking ============

export interface TimeEntry {
  id: string;
  taskId: string;
  projectId: string;
  userId: string;
  hours: number;
  description?: string;
  date: any; // Firestore Timestamp or Date
  createdAt: any;
  updatedAt: any;
}

export interface CreateTimeEntryDto {
  taskId: string;
  projectId: string;
  hours: number;
  description?: string;
  date: Date;
}

export interface UpdateTimeEntryDto {
  hours?: number;
  description?: string;
  date?: Date;
}

export interface TaskTimeTracking {
  taskId: string;
  estimatedHours?: number;
  totalLoggedHours: number;
  timeEntries: TimeEntry[];
  variance: number; // difference between estimated and actual
  percentComplete: number; // based on time logged vs estimated
}

export interface ProjectTimeTracking {
  projectId: string;
  totalEstimatedHours: number;
  totalLoggedHours: number;
  totalTasks: number;
  tasksWithTime: number;
  variance: number;
}

// ============ Pages/Wiki ============

export const PageType = {
  PAGE: "page",
  DIRECTORY: "directory",
} as const;

export type PageType = (typeof PageType)[keyof typeof PageType];

export interface Page {
  id: string;
  title: string;
  type: PageType; // "page" or "directory"
  content?: string; // Markdown content (only for pages, not directories)
  projectId: string;
  userId: string; // Creator
  parentId?: string; // For nested structure
  order: number; // Order within parent
  icon?: string; // Optional emoji icon
  createdAt: any;
  updatedAt: any;
}

export interface CreatePageDto {
  title: string;
  type: PageType;
  content?: string; // Only required for pages
  parentId?: string;
  order?: number;
  icon?: string;
}

export interface UpdatePageDto {
  title?: string;
  type?: PageType;
  content?: string;
  parentId?: string;
  order?: number;
  icon?: string;
}

export interface PageTreeNode extends Page {
  children: PageTreeNode[];
  depth: number;
  isExpanded?: boolean; // For UI state
}

// ============ Documents/Files ============

export interface Document {
  id: string;
  name: string;
  description?: string;
  fileName: string;
  fileType: string; // MIME type
  fileSize: number; // bytes
  downloadUrl: string; // Firebase Storage download URL
  storagePath: string; // Path in Firebase Storage
  projectId: string;
  userId: string; // Uploader
  taskId?: string; // Optional link to task
  folderId?: string; // For folder organization
  createdAt: any;
  updatedAt: any;
}

export interface CreateDocumentDto {
  name: string;
  description?: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  downloadUrl: string;
  storagePath: string;
  taskId?: string;
  folderId?: string;
}

export interface UpdateDocumentDto {
  name?: string;
  description?: string;
  taskId?: string;
  folderId?: string;
}

export interface DocumentFolder {
  id: string;
  name: string;
  color?: string;
  projectId: string;
  userId: string;
  createdAt: any;
  updatedAt: any;
}

export interface CreateDocumentFolderDto {
  name: string;
  color?: string;
}

export interface UpdateDocumentFolderDto {
  name?: string;
  color?: string;
}

// ============ Links ============

export const LinkType = {
  LINK: "link",
  FOLDER: "folder",
} as const;

export type LinkType = (typeof LinkType)[keyof typeof LinkType];

export const LinkCategory = {
  DESIGN: "design",
  REPOSITORY: "repository",
  DEPLOYMENT: "deployment",
  DOCUMENTATION: "documentation",
  API: "api",
  MEETING: "meeting",
  OTHER: "other",
} as const;

export type LinkCategory = (typeof LinkCategory)[keyof typeof LinkCategory];

export interface Link {
  id: string;
  title: string;
  type: LinkType;
  url?: string; // Optional for folders
  description?: string;
  category?: LinkCategory; // Optional for folders
  icon?: string; // Optional emoji
  projectId: string;
  userId: string;
  parentId?: string; // For tree structure
  order: number; // For sorting
  createdAt: any;
  updatedAt: any;
}

export interface CreateLinkDto {
  title: string;
  type: LinkType;
  url?: string; // Only required for links
  description?: string;
  category?: LinkCategory; // Only required for links
  parentId?: string;
  order?: number;
  icon?: string;
}

export interface UpdateLinkDto {
  title?: string;
  type?: LinkType;
  url?: string;
  description?: string;
  category?: LinkCategory;
  parentId?: string;
  order?: number;
  icon?: string;
}

export interface LinkTreeNode extends Link {
  children: LinkTreeNode[];
  depth: number;
  isExpanded?: boolean; // For UI state
}

export const LINK_CATEGORY_LABELS: Record<LinkCategory, string> = {
  [LinkCategory.DESIGN]: "Design",
  [LinkCategory.REPOSITORY]: "Repository",
  [LinkCategory.DEPLOYMENT]: "Deployment",
  [LinkCategory.DOCUMENTATION]: "Documentation",
  [LinkCategory.API]: "API",
  [LinkCategory.MEETING]: "Meeting",
  [LinkCategory.OTHER]: "Other",
};

export const LINK_CATEGORY_ICONS: Record<LinkCategory, string> = {
  [LinkCategory.DESIGN]: "🎨",
  [LinkCategory.REPOSITORY]: "📦",
  [LinkCategory.DEPLOYMENT]: "🚀",
  [LinkCategory.DOCUMENTATION]: "📚",
  [LinkCategory.API]: "🔌",
  [LinkCategory.MEETING]: "📅",
  [LinkCategory.OTHER]: "🔗",
};

export const LINK_CATEGORY_COLORS: Record<LinkCategory, string> = {
  [LinkCategory.DESIGN]: "#a855f7", // purple
  [LinkCategory.REPOSITORY]: "#3b82f6", // blue
  [LinkCategory.DEPLOYMENT]: "#22c55e", // green
  [LinkCategory.DOCUMENTATION]: "#f59e0b", // orange
  [LinkCategory.API]: "#06b6d4", // cyan
  [LinkCategory.MEETING]: "#ec4899", // pink
  [LinkCategory.OTHER]: "#6b7280", // gray
};

export const DEFAULT_PROJECT_LABELS: CreateProjectLabelDto[] = [
  { name: "Frontend", color: "#3b82f6" },
  { name: "Backend", color: "#22c55e" },
  { name: "Design", color: "#a855f7" },
  { name: "Documentation", color: "#f59e0b" },
];

// ============ Test Cases ============

export const TestCaseType = {
  TEST_CASE: "test_case",
  FOLDER: "folder",
} as const;

export type TestCaseType = (typeof TestCaseType)[keyof typeof TestCaseType];

export const TestCaseStatus = {
  DRAFT: "draft",
  ACTIVE: "active",
  DEPRECATED: "deprecated",
} as const;

export type TestCaseStatus = (typeof TestCaseStatus)[keyof typeof TestCaseStatus];

export const TestExecutionStatus = {
  NOT_RUN: "not_run",
  PASSED: "passed",
  FAILED: "failed",
  SKIPPED: "skipped",
  BLOCKED: "blocked",
} as const;

export type TestExecutionStatus = (typeof TestExecutionStatus)[keyof typeof TestExecutionStatus];

export const TestCasePriority = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type TestCasePriority = (typeof TestCasePriority)[keyof typeof TestCasePriority];

export interface TestStep {
  step: string;
  expectedResult: string;
}

export interface TestCase {
  id: string;
  title: string;
  type: TestCaseType; // NEW: "test_case" or "folder"
  description?: string;
  preconditions?: string;
  steps: TestStep[];
  priority: TestCasePriority;
  status: TestCaseStatus;
  projectId: string;
  suiteId?: string; // Reference to TestSuite
  taskId?: string; // Optional link to task
  parentId?: string; // NEW: For nested structure
  order: number; // NEW: For sorting
  icon?: string; // NEW: Emoji icon
  userId: string; // Creator
  createdAt: any;
  updatedAt: any;
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  userId: string;
  createdAt: any;
  updatedAt: any;
}

export interface TestExecution {
  id: string;
  testCaseId: string;
  executionStatus: TestExecutionStatus;
  executedBy: string; // userId
  executedAt: any;
  notes?: string;
  projectId: string;
  createdAt: any;
}

export interface CreateTestCaseDto {
  title: string;
  type: TestCaseType; // NEW
  description?: string;
  preconditions?: string;
  steps?: TestStep[]; // Made optional (only for test_case type)
  priority?: TestCasePriority; // Made optional (only for test_case type)
  status?: TestCaseStatus; // Made optional (only for test_case type)
  suiteId?: string;
  taskId?: string;
  parentId?: string; // NEW
  order?: number; // NEW
  icon?: string; // NEW
}

export interface UpdateTestCaseDto {
  title?: string;
  description?: string;
  preconditions?: string;
  steps?: TestStep[];
  priority?: TestCasePriority;
  status?: TestCaseStatus;
  suiteId?: string;
  taskId?: string;
  icon?: string; // NEW
}

export interface CreateTestSuiteDto {
  name: string;
  description?: string;
}

export interface UpdateTestSuiteDto {
  name?: string;
  description?: string;
}

export interface CreateTestExecutionDto {
  testCaseId: string;
  executionStatus: TestExecutionStatus;
  notes?: string;
}

export interface TestCaseTreeNode extends TestCase {
  children: TestCaseTreeNode[];
  depth: number;
  isExpanded?: boolean;
}

export interface TestCaseWithDetails extends TestCase {
  suite?: TestSuite;
  task?: Task;
  lastExecution?: TestExecution;
}

export interface TestSuiteWithStats extends TestSuite {
  testCaseCount: number;
  passedCount: number;
  failedCount: number;
  notRunCount: number;
  passRate: number; // 0-100
}

export const TEST_CASE_STATUS_LABELS: Record<TestCaseStatus, string> = {
  [TestCaseStatus.DRAFT]: "Draft",
  [TestCaseStatus.ACTIVE]: "Active",
  [TestCaseStatus.DEPRECATED]: "Deprecated",
};

export const TEST_CASE_STATUS_COLORS: Record<TestCaseStatus, string> = {
  [TestCaseStatus.DRAFT]: "#6b7280",
  [TestCaseStatus.ACTIVE]: "#22c55e",
  [TestCaseStatus.DEPRECATED]: "#ef4444",
};

export const TEST_EXECUTION_STATUS_LABELS: Record<TestExecutionStatus, string> = {
  [TestExecutionStatus.NOT_RUN]: "Not Run",
  [TestExecutionStatus.PASSED]: "Passed",
  [TestExecutionStatus.FAILED]: "Failed",
  [TestExecutionStatus.SKIPPED]: "Skipped",
  [TestExecutionStatus.BLOCKED]: "Blocked",
};

export const TEST_EXECUTION_STATUS_COLORS: Record<TestExecutionStatus, string> = {
  [TestExecutionStatus.NOT_RUN]: "#6b7280",
  [TestExecutionStatus.PASSED]: "#22c55e",
  [TestExecutionStatus.FAILED]: "#ef4444",
  [TestExecutionStatus.SKIPPED]: "#f59e0b",
  [TestExecutionStatus.BLOCKED]: "#a855f7",
};

export const TEST_CASE_PRIORITY_LABELS: Record<TestCasePriority, string> = {
  [TestCasePriority.CRITICAL]: "Critical",
  [TestCasePriority.HIGH]: "High",
  [TestCasePriority.MEDIUM]: "Medium",
  [TestCasePriority.LOW]: "Low",
};

export const TEST_CASE_PRIORITY_COLORS: Record<TestCasePriority, string> = {
  [TestCasePriority.CRITICAL]: "#ef4444",
  [TestCasePriority.HIGH]: "#f59e0b",
  [TestCasePriority.MEDIUM]: "#3b82f6",
  [TestCasePriority.LOW]: "#6b7280",
};

// ============ Cycles (Sprints/Releases) ============

export const CycleType = {
  SPRINT: "sprint",
  RELEASE: "release",
} as const;

export type CycleType = (typeof CycleType)[keyof typeof CycleType];

export const CycleStatus = {
  PLANNED: "planned",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type CycleStatus = (typeof CycleStatus)[keyof typeof CycleStatus];

export interface Cycle {
  id: string;
  name: string;
  description?: string;
  type: CycleType;
  status: CycleStatus;
  projectId: string;
  userId: string; // Creator
  startDate: any;
  endDate: any;
  goals?: string; // Sprint/release goals
  plannedPoints?: number; // Story points planned
  completedPoints?: number; // Story points completed
  createdAt: any;
  updatedAt: any;
}

export interface CreateCycleDto {
  name: string;
  description?: string;
  type: CycleType;
  status: CycleStatus;
  startDate: Date;
  endDate: Date;
  goals?: string;
  plannedPoints?: number;
}

export interface UpdateCycleDto {
  name?: string;
  description?: string;
  type?: CycleType;
  status?: CycleStatus;
  startDate?: Date;
  endDate?: Date;
  goals?: string;
  plannedPoints?: number;
  completedPoints?: number;
}

export interface CycleWithStats extends Cycle {
  taskCount: number;
  completedTaskCount: number;
  progress: number; // 0-100
  daysRemaining: number;
  daysTotal: number;
  velocity?: number; // Points completed per day
}

export const CYCLE_TYPE_LABELS: Record<CycleType, string> = {
  [CycleType.SPRINT]: "Sprint",
  [CycleType.RELEASE]: "Release",
};

export const CYCLE_TYPE_ICONS: Record<CycleType, string> = {
  [CycleType.SPRINT]: "🔁",
  [CycleType.RELEASE]: "🚀",
};

export const CYCLE_STATUS_LABELS: Record<CycleStatus, string> = {
  [CycleStatus.PLANNED]: "Planned",
  [CycleStatus.ACTIVE]: "Active",
  [CycleStatus.COMPLETED]: "Completed",
  [CycleStatus.CANCELLED]: "Cancelled",
};

export const CYCLE_STATUS_COLORS: Record<CycleStatus, string> = {
  [CycleStatus.PLANNED]: "#6b7280",
  [CycleStatus.ACTIVE]: "#3b82f6",
  [CycleStatus.COMPLETED]: "#22c55e",
  [CycleStatus.CANCELLED]: "#ef4444",
};

// ============ Custom Views ============

export const ViewType = {
  BOARD: "board",
  LIST: "list",
  TIMELINE: "timeline",
  CALENDAR: "calendar",
} as const;

export type ViewType = (typeof ViewType)[keyof typeof ViewType];

export const GroupBy = {
  NONE: "none",
  STATUS: "status",
  PRIORITY: "priority",
  ASSIGNEE: "assignee",
  EPIC: "epic",
  CYCLE: "cycle",
  LABEL: "label",
} as const;

export type GroupBy = (typeof GroupBy)[keyof typeof GroupBy];

export interface ViewFilters {
  statusIds?: string[];
  priorityIds?: string[];
  types?: TaskType[];
  epicId?: string;
  cycleId?: string;
  assigneeId?: string;
  labelIds?: string[];
}

export interface View {
  id: string;
  name: string;
  description?: string;
  viewType: ViewType;
  projectId: string;
  userId: string; // Creator
  isDefault?: boolean; // Default view for user
  groupBy: GroupBy;
  sortBy: TaskSortBy;
  sortDirection: SortDirection;
  filters?: ViewFilters;
  createdAt: any;
  updatedAt: any;
}

export interface CreateViewDto {
  name: string;
  description?: string;
  viewType: ViewType;
  isDefault?: boolean;
  groupBy: GroupBy;
  sortBy: TaskSortBy;
  sortDirection: SortDirection;
  filters?: ViewFilters;
}

export interface UpdateViewDto {
  name?: string;
  description?: string;
  viewType?: ViewType;
  isDefault?: boolean;
  groupBy?: GroupBy;
  sortBy?: TaskSortBy;
  sortDirection?: SortDirection;
  filters?: ViewFilters;
}

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  [ViewType.BOARD]: "Board",
  [ViewType.LIST]: "List",
  [ViewType.TIMELINE]: "Timeline",
  [ViewType.CALENDAR]: "Calendar",
};

export const VIEW_TYPE_ICONS: Record<ViewType, string> = {
  [ViewType.BOARD]: "📊",
  [ViewType.LIST]: "📋",
  [ViewType.TIMELINE]: "📈",
  [ViewType.CALENDAR]: "📅",
};

export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  [GroupBy.NONE]: "None",
  [GroupBy.STATUS]: "Status",
  [GroupBy.PRIORITY]: "Priority",
  [GroupBy.ASSIGNEE]: "Assignee",
  [GroupBy.EPIC]: "Epic",
  [GroupBy.CYCLE]: "Cycle",
  [GroupBy.LABEL]: "Label",
};
