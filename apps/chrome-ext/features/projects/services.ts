import {
  createDocument,
  updateDocument,
  deleteDocument,
  getDocument,
  queryDocuments,
  subscribeToCollection,
  type Unsubscribe,
} from "@/shared/lib/firebase/firestore";
import type {
  Project,
  Task,
  Epic,
  ProjectStatus,
  ProjectLabel,
  ProjectPriority,
  CreateProjectDto,
  UpdateProjectDto,
  CreateEpicDto,
  UpdateEpicDto,
  CreateProjectStatusDto,
  UpdateProjectStatusDto,
  CreateProjectLabelDto,
  UpdateProjectLabelDto,
  CreateProjectPriorityDto,
  UpdateProjectPriorityDto,
  CreateTaskDto,
  UpdateTaskDto,
  TaskFilters,
  TaskSortBy,
  SortDirection,
  ProjectWithTaskCount,
  TasksByStatus,
  TaskWithDetails,
  EpicWithTaskCount,
  TimeEntry,
  CreateTimeEntryDto,
  UpdateTimeEntryDto,
  TaskTimeTracking,
  ProjectTimeTracking,
  Page,
  CreatePageDto,
  UpdatePageDto,
  PageTreeNode,
  Document,
  CreateDocumentDto,
  UpdateDocumentDto,
  DocumentFolder,
  CreateDocumentFolderDto,
  UpdateDocumentFolderDto,
  Link,
  CreateLinkDto,
  UpdateLinkDto,
  LinkTreeNode,
  TestCase,
  TestSuite,
  TestExecution,
  CreateTestCaseDto,
  UpdateTestCaseDto,
  CreateTestSuiteDto,
  UpdateTestSuiteDto,
  CreateTestExecutionDto,
  TestCaseWithDetails,
  TestCaseTreeNode,
  TestSuiteWithStats,
  Cycle,
  CreateCycleDto,
  UpdateCycleDto,
  CycleWithStats,
  View,
  CreateViewDto,
  UpdateViewDto,
} from "./entity";
import {
  DEFAULT_PROJECT_STATUSES,
  DEFAULT_PROJECT_PRIORITIES,
  DEFAULT_PROJECT_LABELS,
  TestExecutionStatus,
  PageType,
  LinkType,
  TestCaseType,
  TestCasePriority,
  TestCaseStatus,
} from "./entity";

// ============ Collections ============

const PROJECTS_COLLECTION = "projects";
const TASKS_COLLECTION = "tasks";
const EPICS_COLLECTION = "epics";
const PROJECT_STATUSES_COLLECTION = "project_statuses";
const PROJECT_LABELS_COLLECTION = "project_labels";
const PROJECT_PRIORITIES_COLLECTION = "project_priorities";
const TIME_ENTRIES_COLLECTION = "time_entries";
const PAGES_COLLECTION = "pages";
const DOCUMENTS_COLLECTION = "documents";
const DOCUMENT_FOLDERS_COLLECTION = "document_folders";
const LINKS_COLLECTION = "links";
const TEST_CASES_COLLECTION = "test_cases";
const TEST_SUITES_COLLECTION = "test_suites";
const TEST_EXECUTIONS_COLLECTION = "test_executions";
const CYCLES_COLLECTION = "cycles";
const VIEWS_COLLECTION = "views";

// ============ Projects CRUD ============

export const createProject = async (
  userId: string,
  data: CreateProjectDto
): Promise<{ success: boolean; id: string | null; error?: any }> => {
  // Ensure project owner is always in assigneeIds
  let assigneeIds = data.assigneeIds || [];
  if (!assigneeIds.includes(userId)) {
    assigneeIds = [userId, ...assigneeIds];
  }

  // Create project
  const projectResult = await createDocument<Project>(PROJECTS_COLLECTION, {
    ...data,
    userId,
    assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
  } as any);

  if (!projectResult.success || !projectResult.id) {
    return projectResult;
  }

  const projectId = projectResult.id;

  try {
    // Create default statuses
    const statusPromises = DEFAULT_PROJECT_STATUSES.map((status) =>
      createProjectStatus(projectId, status)
    );
    const statusResults = await Promise.all(statusPromises);

    // Find default status ID
    const defaultStatusIndex = DEFAULT_PROJECT_STATUSES.findIndex((s) => s.isDefault);
    const defaultStatusId = statusResults[defaultStatusIndex]?.id || null;

    // Create default priorities
    const priorityPromises = DEFAULT_PROJECT_PRIORITIES.map((priority) =>
      createProjectPriority(projectId, priority)
    );
    const priorityResults = await Promise.all(priorityPromises);

    // Find default priority ID
    const defaultPriorityIndex = DEFAULT_PROJECT_PRIORITIES.findIndex((p) => p.isDefault);
    const defaultPriorityId = priorityResults[defaultPriorityIndex]?.id || null;

    // Create default labels
    const labelPromises = DEFAULT_PROJECT_LABELS.map((label) =>
      createProjectLabel(projectId, label)
    );
    await Promise.all(labelPromises);

    // Create default "General" directory for pages
    await createPage(userId, projectId, {
      title: "General",
      type: PageType.DIRECTORY,
      order: 0,
      icon: "🏠",
    });

    // Create default "Test Cases" folder for test cases
    await createTestCase(userId, projectId, {
      title: "Test Cases",
      type: TestCaseType.FOLDER,
      order: 0,
      icon: "📋",
    });

    // Create default "Links" folder for links
    await createLink(userId, projectId, {
      title: "Links",
      type: LinkType.FOLDER,
      order: 0,
      icon: "🔗",
    });

    // Update project with default IDs
    if (defaultStatusId || defaultPriorityId) {
      await updateProject(projectId, {
        defaultStatusId: defaultStatusId || undefined,
        defaultPriorityId: defaultPriorityId || undefined,
      });
    }

    return { success: true, id: projectId, error: null };
  } catch (error) {
    console.error("Error creating project defaults:", error);
    // Project is created, but defaults failed
    return { success: true, id: projectId, error };
  }
};

export const updateProject = async (projectId: string, data: UpdateProjectDto) => {
  return await updateDocument(PROJECTS_COLLECTION, projectId, data);
};

export const deleteProject = async (projectId: string) => {
  // TODO: Also delete all related tasks, statuses, labels, priorities
  return await deleteDocument(PROJECTS_COLLECTION, projectId);
};

export const getUserProjects = async (userId: string) => {
  return await queryDocuments<Project>(PROJECTS_COLLECTION, {
    field: "userId",
    operator: "==",
    value: userId,
    orderByField: "createdAt",
    orderByDirection: "desc",
  });
};

export const subscribeToUserProjects = (
  userId: string,
  callback: (projects: Project[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Project>(
    PROJECTS_COLLECTION,
    (data, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(data);
      }
    },
    {
      field: "userId",
      operator: "==",
      value: userId,
      orderByField: "createdAt",
      orderByDirection: "desc",
    }
  );
};

// Get all projects in a workspace
export const getWorkspaceProjects = async (workspaceId: string) => {
  return await queryDocuments<Project>(PROJECTS_COLLECTION, {
    field: "workspaceId",
    operator: "==",
    value: workspaceId,
    orderByField: "createdAt",
    orderByDirection: "desc",
  });
};

// Subscribe to workspace projects
export const subscribeToWorkspaceProjects = (
  workspaceId: string,
  callback: (projects: Project[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Project>(
    PROJECTS_COLLECTION,
    (data, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(data);
      }
    },
    {
      field: "workspaceId",
      operator: "==",
      value: workspaceId,
      orderByField: "createdAt",
      orderByDirection: "desc",
    }
  );
};

// ============ Project Statuses CRUD ============

export const createProjectStatus = async (
  projectId: string,
  data: CreateProjectStatusDto
) => {
  return await createDocument<ProjectStatus>(PROJECT_STATUSES_COLLECTION, {
    ...data,
    projectId,
  } as any);
};

export const updateProjectStatus = async (statusId: string, data: UpdateProjectStatusDto) => {
  return await updateDocument(PROJECT_STATUSES_COLLECTION, statusId, data);
};

export const deleteProjectStatus = async (statusId: string) => {
  return await deleteDocument(PROJECT_STATUSES_COLLECTION, statusId);
};

export const getProjectStatuses = async (projectId: string) => {
  return await queryDocuments<ProjectStatus>(PROJECT_STATUSES_COLLECTION, {
    field: "projectId",
    operator: "==",
    value: projectId,
    orderByField: "order",
    orderByDirection: "asc",
  });
};

export const subscribeToProjectStatuses = (
  projectId: string,
  callback: (statuses: ProjectStatus[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<ProjectStatus>(
    PROJECT_STATUSES_COLLECTION,
    (data, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(data);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "order",
      orderByDirection: "asc",
    }
  );
};

// ============ Project Labels CRUD ============

export const createProjectLabel = async (projectId: string, data: CreateProjectLabelDto) => {
  return await createDocument<ProjectLabel>(PROJECT_LABELS_COLLECTION, {
    ...data,
    projectId,
  } as any);
};

export const updateProjectLabel = async (labelId: string, data: UpdateProjectLabelDto) => {
  return await updateDocument(PROJECT_LABELS_COLLECTION, labelId, data);
};

export const deleteProjectLabel = async (labelId: string) => {
  return await deleteDocument(PROJECT_LABELS_COLLECTION, labelId);
};

export const getProjectLabels = async (projectId: string) => {
  return await queryDocuments<ProjectLabel>(PROJECT_LABELS_COLLECTION, {
    field: "projectId",
    operator: "==",
    value: projectId,
  });
};

export const subscribeToProjectLabels = (
  projectId: string,
  callback: (labels: ProjectLabel[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<ProjectLabel>(
    PROJECT_LABELS_COLLECTION,
    (data, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(data);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
    }
  );
};

// ============ Project Priorities CRUD ============

export const createProjectPriority = async (
  projectId: string,
  data: CreateProjectPriorityDto
) => {
  return await createDocument<ProjectPriority>(PROJECT_PRIORITIES_COLLECTION, {
    ...data,
    projectId,
  } as any);
};

export const updateProjectPriority = async (
  priorityId: string,
  data: UpdateProjectPriorityDto
) => {
  return await updateDocument(PROJECT_PRIORITIES_COLLECTION, priorityId, data);
};

export const deleteProjectPriority = async (priorityId: string) => {
  return await deleteDocument(PROJECT_PRIORITIES_COLLECTION, priorityId);
};

export const getProjectPriorities = async (projectId: string) => {
  return await queryDocuments<ProjectPriority>(PROJECT_PRIORITIES_COLLECTION, {
    field: "projectId",
    operator: "==",
    value: projectId,
    orderByField: "order",
    orderByDirection: "asc",
  });
};

export const subscribeToProjectPriorities = (
  projectId: string,
  callback: (priorities: ProjectPriority[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<ProjectPriority>(
    PROJECT_PRIORITIES_COLLECTION,
    (data, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(data);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "order",
      orderByDirection: "asc",
    }
  );
};

// ============ Epics CRUD ============

export const createEpic = async (userId: string, projectId: string, data: CreateEpicDto) => {
  return await createDocument<Epic>(EPICS_COLLECTION, {
    ...data,
    userId,
    projectId,
  } as any);
};

export const updateEpic = async (epicId: string, data: UpdateEpicDto) => {
  return await updateDocument(EPICS_COLLECTION, epicId, data);
};

export const deleteEpic = async (epicId: string) => {
  return await deleteDocument(EPICS_COLLECTION, epicId);
};

export const getProjectEpics = async (projectId: string) => {
  return await queryDocuments<Epic>(EPICS_COLLECTION, {
    field: "projectId",
    operator: "==",
    value: projectId,
    orderByField: "createdAt",
    orderByDirection: "desc",
  });
};

export const subscribeToProjectEpics = (
  projectId: string,
  callback: (epics: Epic[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Epic>(
    EPICS_COLLECTION,
    (data, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(data);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "createdAt",
      orderByDirection: "desc",
    }
  );
};

// ============ Tasks CRUD ============

export const createTask = async (userId: string, data: CreateTaskDto) => {
  const result = await createDocument<Task>(TASKS_COLLECTION, {
    ...data,
    userId,
    completedAt: null,
  } as any);

  // Log task creation to history
  if (result.success && result.id) {
    try {
      const { logTaskCreated } = await import("./services/task-history.service");
      const { getUser } = await import("../users/services");

      const user = await getUser(userId);
      if (user) {
        await logTaskCreated(
          result.id,
          data.projectId,
          userId,
          user.displayName,
          user.photoURL,
          data.title
        );
      }
    } catch (error) {
      console.error("Failed to log task creation:", error);
    }
  }

  return result;
};

export const updateTask = async (taskId: string, data: UpdateTaskDto, userId?: string) => {
  // Get current task data before updating
  let oldTask: Task | null = null;
  try {
    const taskResult = await getDocument(TASKS_COLLECTION, taskId);
    if (taskResult.success && taskResult.data) {
      oldTask = taskResult.data as Task;
    }
  } catch (error) {
    console.error("Failed to fetch task before update:", error);
  }

  // Perform the update
  const result = await updateDocument(TASKS_COLLECTION, taskId, data);

  // Log changes if update was successful and we have old data
  if (result.success && oldTask && userId) {
    try {
      const {
        logStatusChange,
        logAssigneeChange,
        logPriorityChange,
        logTitleChange,
        logDescriptionChange
      } = await import("./services/task-history.service");
      const { getUser } = await import("../users/services");

      const user = await getUser(userId);
      if (!user) return result;

      const projectId = oldTask.projectId;
      const userName = user.displayName;
      const userPhotoURL = user.photoURL;

      // Log status change
      if (data.statusId && data.statusId !== oldTask.statusId) {
        // Fetch status names
        let oldStatusName = "No Status";
        let newStatusName = "Unknown";

        try {
          if (oldTask.statusId) {
            const oldStatusResult = await getDocument("project_statuses", oldTask.statusId);
            if (oldStatusResult.success && oldStatusResult.data) {
              oldStatusName = (oldStatusResult.data as any).name;
            }
          }

          const newStatusResult = await getDocument("project_statuses", data.statusId);
          if (newStatusResult.success && newStatusResult.data) {
            newStatusName = (newStatusResult.data as any).name;
          }
        } catch (e) {
          console.error("Failed to fetch status names:", e);
        }

        await logStatusChange(
          taskId,
          projectId,
          userId,
          userName,
          oldStatusName,
          newStatusName,
          userPhotoURL
        );
      }

      // Log assignee change
      if (data.assigneeId !== undefined && data.assigneeId !== oldTask.assigneeId) {
        // Fetch assignee names
        let oldAssigneeName: string | undefined;
        let newAssigneeName: string | undefined;

        try {
          if (oldTask.assigneeId) {
            const oldAssignee = await getUser(oldTask.assigneeId);
            if (oldAssignee) oldAssigneeName = oldAssignee.displayName;
          }

          if (data.assigneeId) {
            const newAssignee = await getUser(data.assigneeId);
            if (newAssignee) newAssigneeName = newAssignee.displayName;
          }
        } catch (e) {
          console.error("Failed to fetch assignee names:", e);
        }

        await logAssigneeChange(
          taskId,
          projectId,
          userId,
          userName,
          oldAssigneeName,
          newAssigneeName,
          userPhotoURL
        );
      }

      // Log priority change
      if (data.priorityId !== undefined && data.priorityId !== oldTask.priorityId) {
        // Fetch priority names
        let oldPriorityName: string | undefined = oldTask.priorityId ? undefined : "No Priority";
        let newPriorityName: string | undefined = "Unknown";

        try {
          if (oldTask.priorityId) {
            const oldPriorityResult = await getDocument("project_priorities", oldTask.priorityId);
            if (oldPriorityResult.success && oldPriorityResult.data) {
              oldPriorityName = (oldPriorityResult.data as any).name;
            }
          }

          if (data.priorityId) {
            const newPriorityResult = await getDocument("project_priorities", data.priorityId);
            if (newPriorityResult.success && newPriorityResult.data) {
              newPriorityName = (newPriorityResult.data as any).name;
            }
          } else {
            // Priority being removed
            newPriorityName = "No Priority";
          }
        } catch (e) {
          console.error("Failed to fetch priority names:", e);
        }

        await logPriorityChange(
          taskId,
          projectId,
          userId,
          userName,
          oldPriorityName,
          newPriorityName,
          userPhotoURL
        );
      }

      // Log title change
      if (data.title && data.title !== oldTask.title) {
        await logTitleChange(
          taskId,
          projectId,
          userId,
          userName,
          oldTask.title,
          data.title,
          userPhotoURL
        );
      }

      // Log description change
      if (data.description !== undefined && data.description !== oldTask.description) {
        await logDescriptionChange(
          taskId,
          projectId,
          userId,
          userName,
          oldTask.description,
          data.description,
          userPhotoURL
        );
      }
    } catch (error) {
      console.error("Failed to log task changes:", error);
    }
  }

  return result;
};

export const deleteTask = async (taskId: string) => {
  return await deleteDocument(TASKS_COLLECTION, taskId);
};

export const getUserTasks = async (
  userId: string,
  filters?: TaskFilters,
  sortBy: TaskSortBy = "createdAt",
  sortDirection: SortDirection = "desc"
) => {
  const options: any = {
    field: "userId",
    operator: "==",
    value: userId,
    orderByField: sortBy,
    orderByDirection: sortDirection,
  };

  const result = await queryDocuments<Task>(TASKS_COLLECTION, options);

  if (!result.success) {
    return result;
  }

  // Apply additional filters in-memory
  let filteredTasks = result.data;

  if (filters?.projectId) {
    filteredTasks = filteredTasks.filter((task) => task.projectId === filters.projectId);
  }

  if (filters?.statusId) {
    filteredTasks = filteredTasks.filter((task) => task.statusId === filters.statusId);
  }

  if (filters?.priorityId) {
    filteredTasks = filteredTasks.filter((task) => task.priorityId === filters.priorityId);
  }

  if (filters?.type) {
    filteredTasks = filteredTasks.filter((task) => task.type === filters.type);
  }

  if (filters?.assigneeId) {
    filteredTasks = filteredTasks.filter((task) => task.assigneeId === filters.assigneeId);
  }

  if (filters?.labelIds && filters.labelIds.length > 0) {
    filteredTasks = filteredTasks.filter((task) =>
      filters.labelIds!.some((labelId) => task.labelIds?.includes(labelId))
    );
  }

  return { ...result, data: filteredTasks };
};

export const subscribeToUserTasks = (
  userId: string,
  callback: (tasks: Task[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Task>(
    TASKS_COLLECTION,
    (data, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(data);
      }
    },
    {
      field: "userId",
      operator: "==",
      value: userId,
      orderByField: "createdAt",
      orderByDirection: "desc",
    }
  );
};

export const subscribeToProjectTasks = (
  projectId: string,
  callback: (tasks: Task[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Task>(
    TASKS_COLLECTION,
    (data, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(data);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "createdAt",
      orderByDirection: "desc",
    }
  );
};

// ============ Helper Functions ============

export const getProjectsWithTaskCount = (
  projects: Project[],
  tasks: Task[],
  statuses: ProjectStatus[]
): ProjectWithTaskCount[] => {
  return projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const projectStatuses = statuses.filter((status) => status.projectId === project.id);

    const statusCounts: Record<string, number> = {};
    projectStatuses.forEach((status) => {
      statusCounts[status.id] = projectTasks.filter(
        (task) => task.statusId === status.id
      ).length;
    });

    return {
      ...project,
      taskCount: projectTasks.length,
      statusCounts,
    };
  });
};

export const groupTasksByStatus = (
  tasks: Task[],
  statuses: ProjectStatus[]
): TasksByStatus => {
  const grouped: TasksByStatus = {};

  // Initialize with all statuses
  statuses.forEach((status) => {
    grouped[status.id] = [];
  });

  // Group tasks
  tasks.forEach((task) => {
    if (grouped[task.statusId]) {
      grouped[task.statusId].push(task);
    }
  });

  return grouped;
};

export const enrichTasksWithDetails = (
  tasks: Task[],
  statuses: ProjectStatus[],
  priorities: ProjectPriority[],
  labels: ProjectLabel[],
  epics: Epic[] = []
): TaskWithDetails[] => {
  return tasks.map((task) => ({
    ...task,
    status: statuses.find((s) => s.id === task.statusId),
    priority: priorities.find((p) => p.id === task.priorityId),
    labels: labels.filter((l) => task.labelIds?.includes(l.id)),
    epic: epics.find((e) => e.id === task.epicId),
  }));
};

export const getTaskKey = (project: Project, taskNumber: number): string => {
  return `${project.key}-${taskNumber}`;
};

export const getEpicsWithTaskCount = (
  epics: Epic[],
  tasks: Task[],
  statuses: ProjectStatus[]
): EpicWithTaskCount[] => {
  return epics.map((epic) => {
    const epicTasks = tasks.filter((task) => task.epicId === epic.id);
    const completedTasks = epicTasks.filter((task) => {
      const status = statuses.find((s) => s.id === task.statusId);
      return status?.isFinal;
    });

    const progress = epicTasks.length > 0
      ? Math.round((completedTasks.length / epicTasks.length) * 100)
      : 0;

    return {
      ...epic,
      taskCount: epicTasks.length,
      completedTaskCount: completedTasks.length,
      progress,
    };
  });
};

// ============ Time Tracking Services ============

export const createTimeEntry = async (
  userId: string,
  data: CreateTimeEntryDto
) => {
  return await createDocument<TimeEntry>(TIME_ENTRIES_COLLECTION, {
    ...data,
    userId,
  } as any);
};

export const updateTimeEntry = async (id: string, data: UpdateTimeEntryDto) => {
  return await updateDocument(TIME_ENTRIES_COLLECTION, id, data as any);
};

export const deleteTimeEntry = async (id: string) => {
  return await deleteDocument(TIME_ENTRIES_COLLECTION, id);
};

export const subscribeToTaskTimeEntries = (
  taskId: string,
  callback: (entries: TimeEntry[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<TimeEntry>(
    TIME_ENTRIES_COLLECTION,
    (entries, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(entries);
      }
    },
    {
      field: "taskId",
      operator: "==",
      value: taskId,
      orderByField: "date",
      orderByDirection: "desc",
    }
  );
};

export const subscribeToProjectTimeEntries = (
  projectId: string,
  callback: (entries: TimeEntry[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<TimeEntry>(
    TIME_ENTRIES_COLLECTION,
    (entries, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(entries);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "date",
      orderByDirection: "desc",
    }
  );
};

export const getTaskTimeTracking = (
  task: Task,
  timeEntries: TimeEntry[]
): TaskTimeTracking => {
  const totalLoggedHours = timeEntries.reduce(
    (sum, entry) => sum + entry.hours,
    0
  );
  const variance = task.estimatedHours
    ? totalLoggedHours - task.estimatedHours
    : 0;
  const percentComplete = task.estimatedHours && task.estimatedHours > 0
    ? Math.min(100, Math.round((totalLoggedHours / task.estimatedHours) * 100))
    : 0;

  return {
    taskId: task.id,
    estimatedHours: task.estimatedHours,
    totalLoggedHours,
    timeEntries,
    variance,
    percentComplete,
  };
};

export const getProjectTimeTracking = (
  tasks: Task[],
  timeEntries: TimeEntry[]
): ProjectTimeTracking => {
  const totalEstimatedHours = tasks.reduce(
    (sum, task) => sum + (task.estimatedHours || 0),
    0
  );
  const totalLoggedHours = timeEntries.reduce(
    (sum, entry) => sum + entry.hours,
    0
  );
  const tasksWithTime = tasks.filter((t) => t.estimatedHours && t.estimatedHours > 0).length;

  return {
    projectId: tasks[0]?.projectId || "",
    totalEstimatedHours,
    totalLoggedHours,
    totalTasks: tasks.length,
    tasksWithTime,
    variance: totalLoggedHours - totalEstimatedHours,
  };
};

// ============ Pages Services ============

export const createPage = async (
  userId: string,
  projectId: string,
  data: CreatePageDto
) => {
  return await createDocument<Page>(PAGES_COLLECTION, {
    ...data,
    userId,
    projectId,
    order: data.order ?? 0,
  } as any);
};

export const updatePage = async (pageId: string, data: UpdatePageDto) => {
  return await updateDocument(PAGES_COLLECTION, pageId, data as any);
};

export const deletePage = async (pageId: string) => {
  return await deleteDocument(PAGES_COLLECTION, pageId);
};

export const subscribeToProjectPages = (
  projectId: string,
  callback: (pages: Page[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Page>(
    PAGES_COLLECTION,
    (pages, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(pages);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "order",
      orderByDirection: "asc",
    }
  );
};

// Build nested page tree
export const buildPageTree = (pages: Page[]): PageTreeNode[] => {
  const pageMap = new Map<string, PageTreeNode>();
  const rootPages: PageTreeNode[] = [];

  // First pass: create map with children array and default expanded state
  pages.forEach((page) => {
    pageMap.set(page.id, {
      ...page,
      children: [],
      depth: 0,
      isExpanded: page.type === PageType.DIRECTORY ? false : undefined,
    });
  });

  // Second pass: build tree
  pages.forEach((page) => {
    const pageNode = pageMap.get(page.id)!;

    if (page.parentId) {
      const parent = pageMap.get(page.parentId);
      if (parent) {
        pageNode.depth = parent.depth + 1;
        parent.children.push(pageNode);
      } else {
        // Parent not found, treat as root
        rootPages.push(pageNode);
      }
    } else {
      rootPages.push(pageNode);
    }
  });

  // Sort children by order recursively
  const sortChildren = (nodes: PageTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((node) => sortChildren(node.children));
  };

  sortChildren(rootPages);

  return rootPages;
};

// ============ Documents Services ============

export const createProjectDocument = async (
  userId: string,
  projectId: string,
  data: CreateDocumentDto
) => {
  return await createDocument<Document>(DOCUMENTS_COLLECTION, {
    ...data,
    userId,
    projectId,
  } as any);
};

export const updateProjectDocument = async (documentId: string, data: UpdateDocumentDto) => {
  return await updateDocument(DOCUMENTS_COLLECTION, documentId, data as any);
};

export const deleteProjectDocument = async (documentId: string) => {
  return await deleteDocument(DOCUMENTS_COLLECTION, documentId);
};

export const subscribeToProjectDocuments = (
  projectId: string,
  callback: (documents: Document[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Document>(
    DOCUMENTS_COLLECTION,
    (documents, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(documents);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "createdAt",
      orderByDirection: "desc",
    }
  );
};

// ============ Document Folders Services ============

export const createDocumentFolder = async (
  userId: string,
  projectId: string,
  data: CreateDocumentFolderDto
) => {
  return await createDocument<DocumentFolder>(DOCUMENT_FOLDERS_COLLECTION, {
    ...data,
    userId,
    projectId,
  } as any);
};

export const updateDocumentFolder = async (
  folderId: string,
  data: UpdateDocumentFolderDto
) => {
  return await updateDocument(DOCUMENT_FOLDERS_COLLECTION, folderId, data as any);
};

export const deleteDocumentFolder = async (folderId: string) => {
  return await deleteDocument(DOCUMENT_FOLDERS_COLLECTION, folderId);
};

export const subscribeToProjectDocumentFolders = (
  projectId: string,
  callback: (folders: DocumentFolder[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<DocumentFolder>(
    DOCUMENT_FOLDERS_COLLECTION,
    (folders, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(folders);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "createdAt",
      orderByDirection: "asc",
    }
  );
};

// ============ Links Services ============

export const createLink = async (
  userId: string,
  projectId: string,
  data: CreateLinkDto
) => {
  return await createDocument<Link>(LINKS_COLLECTION, {
    ...data,
    userId,
    projectId,
    order: data.order ?? 0,
  } as any);
};

export const updateLink = async (linkId: string, data: UpdateLinkDto) => {
  return await updateDocument(LINKS_COLLECTION, linkId, data as any);
};

export const deleteLink = async (linkId: string) => {
  return await deleteDocument(LINKS_COLLECTION, linkId);
};

export const subscribeToProjectLinks = (
  projectId: string,
  callback: (links: Link[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Link>(
    LINKS_COLLECTION,
    (links, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(links);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "createdAt",
      orderByDirection: "desc",
    }
  );
};

export const buildLinkTree = (links: Link[]): LinkTreeNode[] => {
  const linkMap = new Map<string, LinkTreeNode>();
  const rootLinks: LinkTreeNode[] = [];

  // First pass: create map with children array and default expanded state
  links.forEach((link) => {
    linkMap.set(link.id, {
      ...link,
      children: [],
      depth: 0,
      isExpanded: link.type === LinkType.FOLDER ? false : undefined,
    });
  });

  // Second pass: build tree
  links.forEach((link) => {
    const linkNode = linkMap.get(link.id)!;

    if (link.parentId) {
      const parent = linkMap.get(link.parentId);
      if (parent) {
        linkNode.depth = parent.depth + 1;
        parent.children.push(linkNode);
      } else {
        // Parent not found, treat as root
        rootLinks.push(linkNode);
      }
    } else {
      rootLinks.push(linkNode);
    }
  });

  // Sort children by order recursively
  const sortChildren = (nodes: LinkTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((node) => sortChildren(node.children));
  };

  sortChildren(rootLinks);
  return rootLinks;
};

// ============ Test Suites Services ============

export const createTestSuite = async (
  userId: string,
  projectId: string,
  data: CreateTestSuiteDto
) => {
  return await createDocument<TestSuite>(TEST_SUITES_COLLECTION, {
    ...data,
    userId,
    projectId,
  } as any);
};

export const updateTestSuite = async (suiteId: string, data: UpdateTestSuiteDto) => {
  return await updateDocument(TEST_SUITES_COLLECTION, suiteId, data as any);
};

export const deleteTestSuite = async (suiteId: string) => {
  return await deleteDocument(TEST_SUITES_COLLECTION, suiteId);
};

export const subscribeToProjectTestSuites = (
  projectId: string,
  callback: (suites: TestSuite[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<TestSuite>(
    TEST_SUITES_COLLECTION,
    (suites, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(suites);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "createdAt",
      orderByDirection: "asc",
    }
  );
};

// ============ Test Cases Services ============

export const createTestCase = async (
  userId: string,
  projectId: string,
  data: CreateTestCaseDto
) => {
  return await createDocument<TestCase>(TEST_CASES_COLLECTION, {
    ...data,
    userId,
    projectId,
    order: data.order ?? 0,
    steps: data.steps ?? [],
    priority: data.priority ?? TestCasePriority.MEDIUM,
    status: data.status ?? TestCaseStatus.DRAFT,
  } as any);
};

export const updateTestCase = async (testCaseId: string, data: UpdateTestCaseDto) => {
  return await updateDocument(TEST_CASES_COLLECTION, testCaseId, data as any);
};

export const deleteTestCase = async (testCaseId: string) => {
  return await deleteDocument(TEST_CASES_COLLECTION, testCaseId);
};

export const subscribeToProjectTestCases = (
  projectId: string,
  callback: (testCases: TestCase[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<TestCase>(
    TEST_CASES_COLLECTION,
    (testCases, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(testCases);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "createdAt",
      orderByDirection: "desc",
    }
  );
};

// Build nested test case tree
export const buildTestCaseTree = (testCases: TestCase[]): TestCaseTreeNode[] => {
  const testCaseMap = new Map<string, TestCaseTreeNode>();
  const rootTestCases: TestCaseTreeNode[] = [];

  // First pass: create map with children array and default expanded state
  testCases.forEach((testCase) => {
    testCaseMap.set(testCase.id, {
      ...testCase,
      children: [],
      depth: 0,
      isExpanded: testCase.type === TestCaseType.FOLDER ? false : undefined,
    });
  });

  // Second pass: build tree
  testCases.forEach((testCase) => {
    const testCaseNode = testCaseMap.get(testCase.id)!;

    if (testCase.parentId) {
      const parent = testCaseMap.get(testCase.parentId);
      if (parent) {
        testCaseNode.depth = parent.depth + 1;
        parent.children.push(testCaseNode);
      } else {
        // Parent not found, treat as root
        rootTestCases.push(testCaseNode);
      }
    } else {
      rootTestCases.push(testCaseNode);
    }
  });

  // Sort children by order recursively
  const sortChildren = (nodes: TestCaseTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((node) => sortChildren(node.children));
  };

  sortChildren(rootTestCases);
  return rootTestCases;
};

// ============ Test Executions Services ============

export const createTestExecution = async (
  userId: string,
  projectId: string,
  data: CreateTestExecutionDto
) => {
  return await createDocument<TestExecution>(TEST_EXECUTIONS_COLLECTION, {
    ...data,
    executedBy: userId,
    projectId,
    executedAt: new Date(),
  } as any);
};

export const subscribeToTestCaseExecutions = (
  testCaseId: string,
  callback: (executions: TestExecution[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<TestExecution>(
    TEST_EXECUTIONS_COLLECTION,
    (executions, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(executions);
      }
    },
    {
      field: "testCaseId",
      operator: "==",
      value: testCaseId,
      orderByField: "executedAt",
      orderByDirection: "desc",
    }
  );
};

// ============ Test Case Helper Functions ============

export const enrichTestCasesWithDetails = (
  testCases: TestCase[],
  suites: TestSuite[],
  tasks: Task[],
  executions: TestExecution[]
): TestCaseWithDetails[] => {
  return testCases.map((testCase) => {
    const lastExecution = executions
      .filter((e) => e.testCaseId === testCase.id)
      .sort((a, b) => {
        const dateA = a.executedAt?.toDate?.() || new Date(a.executedAt);
        const dateB = b.executedAt?.toDate?.() || new Date(b.executedAt);
        return dateB.getTime() - dateA.getTime();
      })[0];

    return {
      ...testCase,
      suite: suites.find((s) => s.id === testCase.suiteId),
      task: tasks.find((t) => t.id === testCase.taskId),
      lastExecution,
    };
  });
};

export const getTestSuitesWithStats = (
  suites: TestSuite[],
  testCases: TestCase[],
  executions: TestExecution[]
): TestSuiteWithStats[] => {
  return suites.map((suite) => {
    const suiteCases = testCases.filter((tc) => tc.suiteId === suite.id);
    const testCaseIds = new Set(suiteCases.map((tc) => tc.id));

    // Get latest execution for each test case in this suite
    const latestExecutions = new Map<string, TestExecution>();
    executions.forEach((execution) => {
      if (!testCaseIds.has(execution.testCaseId)) return;

      const current = latestExecutions.get(execution.testCaseId);
      if (!current) {
        latestExecutions.set(execution.testCaseId, execution);
      } else {
        const currentDate = current.executedAt?.toDate?.() || new Date(current.executedAt);
        const executionDate = execution.executedAt?.toDate?.() || new Date(execution.executedAt);
        if (executionDate > currentDate) {
          latestExecutions.set(execution.testCaseId, execution);
        }
      }
    });

    let passedCount = 0;
    let failedCount = 0;
    let notRunCount = 0;

    suiteCases.forEach((testCase) => {
      const lastExecution = latestExecutions.get(testCase.id);
      if (!lastExecution || lastExecution.executionStatus === TestExecutionStatus.NOT_RUN) {
        notRunCount++;
      } else if (lastExecution.executionStatus === TestExecutionStatus.PASSED) {
        passedCount++;
      } else if (lastExecution.executionStatus === TestExecutionStatus.FAILED) {
        failedCount++;
      }
    });

    const totalRun = passedCount + failedCount;
    const passRate = totalRun > 0 ? Math.round((passedCount / totalRun) * 100) : 0;

    return {
      ...suite,
      testCaseCount: suiteCases.length,
      passedCount,
      failedCount,
      notRunCount,
      passRate,
    };
  });
};

// ============ Cycles Services ============

export const createCycle = async (
  userId: string,
  projectId: string,
  data: CreateCycleDto
) => {
  return await createDocument<Cycle>(CYCLES_COLLECTION, {
    ...data,
    userId,
    projectId,
    completedPoints: 0,
  } as any);
};

export const updateCycle = async (cycleId: string, data: UpdateCycleDto) => {
  return await updateDocument(CYCLES_COLLECTION, cycleId, data as any);
};

export const deleteCycle = async (cycleId: string) => {
  return await deleteDocument(CYCLES_COLLECTION, cycleId);
};

export const subscribeToProjectCycles = (
  projectId: string,
  callback: (cycles: Cycle[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Cycle>(
    CYCLES_COLLECTION,
    (cycles, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(cycles);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "startDate",
      orderByDirection: "desc",
    }
  );
};

// ============ Cycle Helper Functions ============

export const getCyclesWithStats = (
  cycles: Cycle[],
  tasks: Task[],
  statuses: ProjectStatus[]
): CycleWithStats[] => {
  return cycles.map((cycle) => {
    const cycleTasks = tasks.filter((task) => task.cycleId === cycle.id);
    const completedTasks = cycleTasks.filter((task) => {
      const status = statuses.find((s) => s.id === task.statusId);
      return status?.isFinal;
    });

    const progress = cycleTasks.length > 0
      ? Math.round((completedTasks.length / cycleTasks.length) * 100)
      : 0;

    // Calculate days
    const startDate = cycle.startDate?.toDate?.() || new Date(cycle.startDate);
    const endDate = cycle.endDate?.toDate?.() || new Date(cycle.endDate);
    const now = new Date();

    const daysTotal = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate velocity (points per day)
    const daysPassed = daysTotal - daysRemaining;
    const velocity = daysPassed > 0 && cycle.completedPoints
      ? cycle.completedPoints / daysPassed
      : undefined;

    return {
      ...cycle,
      taskCount: cycleTasks.length,
      completedTaskCount: completedTasks.length,
      progress,
      daysRemaining: Math.max(0, daysRemaining),
      daysTotal: Math.max(1, daysTotal),
      velocity,
    };
  });
};

// Update enrichTasksWithDetails to include cycle
export const enrichTasksWithDetailsIncludingCycle = (
  tasks: Task[],
  statuses: ProjectStatus[],
  priorities: ProjectPriority[],
  labels: ProjectLabel[],
  epics: Epic[] = [],
  cycles: Cycle[] = []
): TaskWithDetails[] => {
  return tasks.map((task) => ({
    ...task,
    status: statuses.find((s) => s.id === task.statusId),
    priority: priorities.find((p) => p.id === task.priorityId),
    labels: labels.filter((l) => task.labelIds?.includes(l.id)),
    epic: epics.find((e) => e.id === task.epicId),
    cycle: cycles.find((c) => c.id === task.cycleId),
  }));
};

// ============ Views Services ============

export const createView = async (
  userId: string,
  projectId: string,
  data: CreateViewDto
) => {
  return await createDocument<View>(VIEWS_COLLECTION, {
    ...data,
    userId,
    projectId,
  } as any);
};

export const updateView = async (viewId: string, data: UpdateViewDto) => {
  return await updateDocument(VIEWS_COLLECTION, viewId, data as any);
};

export const deleteView = async (viewId: string) => {
  return await deleteDocument(VIEWS_COLLECTION, viewId);
};

export const subscribeToProjectViews = (
  projectId: string,
  callback: (views: View[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<View>(
    VIEWS_COLLECTION,
    (views, error) => {
      if (error) {
        callback([], error);
      } else {
        callback(views);
      }
    },
    {
      field: "projectId",
      operator: "==",
      value: projectId,
      orderByField: "createdAt",
      orderByDirection: "asc",
    }
  );
};
