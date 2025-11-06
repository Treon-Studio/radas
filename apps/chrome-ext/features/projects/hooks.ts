import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/shared/contexts/auth-context";
import { useCachedSubscription } from "@/shared/hooks/use-cached-subscription";
import { STORES } from "@/shared/services/indexed-db";
import {
  createProject,
  updateProject,
  deleteProject,
  subscribeToUserProjects,
  createEpic,
  updateEpic,
  deleteEpic,
  subscribeToProjectEpics,
  createTask,
  updateTask,
  deleteTask,
  subscribeToUserTasks,
  subscribeToProjectTasks,
  subscribeToProjectStatuses,
  subscribeToProjectLabels,
  subscribeToProjectPriorities,
  createProjectStatus,
  updateProjectStatus,
  deleteProjectStatus,
  createProjectLabel,
  updateProjectLabel,
  deleteProjectLabel,
  createProjectPriority,
  updateProjectPriority,
  deleteProjectPriority,
  getProjectsWithTaskCount,
  groupTasksByStatus,
  enrichTasksWithDetails,
  getEpicsWithTaskCount,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  subscribeToTaskTimeEntries,
  subscribeToProjectTimeEntries,
  getTaskTimeTracking,
  getProjectTimeTracking,
  createPage,
  updatePage,
  deletePage,
  subscribeToProjectPages,
  buildPageTree,
  createProjectDocument,
  updateProjectDocument,
  deleteProjectDocument,
  subscribeToProjectDocuments,
  createDocumentFolder,
  updateDocumentFolder,
  deleteDocumentFolder,
  subscribeToProjectDocumentFolders,
  createLink,
  updateLink,
  deleteLink,
  subscribeToProjectLinks,
  buildLinkTree,
  createTestSuite,
  updateTestSuite,
  deleteTestSuite,
  subscribeToProjectTestSuites,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  subscribeToProjectTestCases,
  buildTestCaseTree,
  createTestExecution,
  subscribeToTestCaseExecutions,
  enrichTestCasesWithDetails,
  getTestSuitesWithStats,
  createCycle,
  updateCycle,
  deleteCycle,
  subscribeToProjectCycles,
  getCyclesWithStats,
  enrichTasksWithDetailsIncludingCycle,
  createView,
  updateView,
  deleteView,
  subscribeToProjectViews,
} from "./services";
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
  CreateTaskDto,
  UpdateTaskDto,
  CreateProjectStatusDto,
  UpdateProjectStatusDto,
  CreateProjectLabelDto,
  UpdateProjectLabelDto,
  CreateProjectPriorityDto,
  UpdateProjectPriorityDto,
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
  PageType,
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
  TestCaseTreeNode,
  TestSuite,
  TestExecution,
  CreateTestCaseDto,
  UpdateTestCaseDto,
  CreateTestSuiteDto,
  UpdateTestSuiteDto,
  CreateTestExecutionDto,
  TestCaseWithDetails,
  TestSuiteWithStats,
  Cycle,
  CreateCycleDto,
  UpdateCycleDto,
  CycleWithStats,
  View,
  CreateViewDto,
  UpdateViewDto,
} from "./entity";

// ============ Projects Hooks ============

export const useProjects = (realtime = true) => {
  const { user } = useAuth();

  const { data, loading, error, fromCache } = useCachedSubscription<Project[]>({
    storeName: STORES.PROJECTS,
    cacheKey: user?.uid || "",
    userId: user?.uid || "",
    subscribe: (callback) => subscribeToUserProjects(user!.uid, callback),
    realtime,
    enableCache: true,
  });

  return {
    projects: data || [],
    loading,
    error,
    fromCache,
  };
};

// Hook with access control - only returns projects where user is owner or assignee
export const useUserProjects = (realtime = true) => {
  const { user } = useAuth();
  const { data, loading, error, fromCache } = useCachedSubscription<Project[]>({
    storeName: STORES.PROJECTS,
    cacheKey: user?.uid || "",
    userId: user?.uid || "",
    subscribe: (callback) => subscribeToUserProjects(user!.uid, callback),
    realtime,
    enableCache: true,
  });

  // Filter projects based on access control:
  // User can see project if they are the owner OR in the assigneeIds array
  const accessibleProjects = useMemo(() => {
    if (!data || !user) return [];

    return data.filter((project) => {
      // Project owner always has access
      if (project.userId === user.uid) return true;

      // Check if user is in assignees list
      if (project.assigneeIds && project.assigneeIds.includes(user.uid)) return true;

      // If no assigneeIds specified, allow access for backward compatibility
      if (!project.assigneeIds || project.assigneeIds.length === 0) return true;

      return false;
    });
  }, [data, user]);

  return {
    projects: accessibleProjects,
    loading,
    error,
    fromCache,
  };
};

export const useProjectMutations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(
    async (data: CreateProjectDto) => {
      if (!user) throw new Error("User not authenticated");

      setLoading(true);
      setError(null);

      const result = await createProject(user.uid, data);
      setLoading(false);

      if (!result.success) {
        setError(result.error as Error);
      }

      return result;
    },
    [user]
  );

  const update = useCallback(async (projectId: string, data: UpdateProjectDto) => {
    setLoading(true);
    setError(null);

    const result = await updateProject(projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteProject(projectId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return {
    create,
    update,
    remove,
    loading,
    error,
  };
};

// ============ Epics Hooks ============

export const useProjectEpics = (projectId: string | undefined, realtime = true) => {
  const { user } = useAuth();

  const { data, loading, error, fromCache } = useCachedSubscription<Epic[]>({
    storeName: STORES.EPICS,
    cacheKey: `project_${projectId || ""}`,
    userId: user?.uid || "",
    subscribe: (callback) => subscribeToProjectEpics(projectId!, callback),
    realtime,
    enableCache: true,
  });

  return {
    epics: data || [],
    loading,
    error,
    fromCache,
  };
};

export const useEpicMutations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(
    async (projectId: string, data: CreateEpicDto) => {
      if (!user) throw new Error("User not authenticated");

      setLoading(true);
      setError(null);

      const result = await createEpic(user.uid, projectId, data);
      setLoading(false);

      if (!result.success) {
        setError(result.error as Error);
      }

      return result;
    },
    [user]
  );

  const update = useCallback(async (epicId: string, data: UpdateEpicDto) => {
    setLoading(true);
    setError(null);

    const result = await updateEpic(epicId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (epicId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteEpic(epicId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return {
    create,
    update,
    remove,
    loading,
    error,
  };
};

// ============ Tasks Hooks ============

export const useTasks = (
  filters?: TaskFilters,
  sortBy: TaskSortBy = "createdAt",
  sortDirection: SortDirection = "desc",
  realtime = true
) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      const unsubscribe = subscribeToUserTasks(user.uid, (data, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          console.error("[useTasks] Error:", err);
          setError(err);
          setTasks([]);
        } else {
          // Apply filters in-memory
          let filtered = data;

          if (filters?.projectId) {
            filtered = filtered.filter((task) => task.projectId === filters.projectId);
          }
          if (filters?.statusId) {
            filtered = filtered.filter((task) => task.statusId === filters.statusId);
          }
          if (filters?.priorityId) {
            filtered = filtered.filter((task) => task.priorityId === filters.priorityId);
          }
          if (filters?.type) {
            filtered = filtered.filter((task) => task.type === filters.type);
          }
          if (filters?.assigneeId) {
            filtered = filtered.filter((task) => task.assigneeId === filters.assigneeId);
          }
          if (filters?.labelIds && filters.labelIds.length > 0) {
            filtered = filtered.filter((task) =>
              filters.labelIds!.some((labelId) => task.labelIds?.includes(labelId))
            );
          }

          setTasks(filtered);
          setError(null);
        }
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        isMountedRef.current = false;
        if (unsubscribeRef.current) {
          try {
            unsubscribeRef.current();
          } catch (e) {
            // Silently catch cleanup errors
          }
          unsubscribeRef.current = null;
        }
      };
    }
  }, [user, JSON.stringify(filters), sortBy, sortDirection, realtime]);

  return { tasks, loading, error };
};

export const useProjectTasks = (projectId: string | undefined, realtime = true) => {
  const { user } = useAuth();

  const { data, loading, error, fromCache } = useCachedSubscription<Task[]>({
    storeName: STORES.TASKS,
    cacheKey: `project_${projectId || ""}`,
    userId: user?.uid || "",
    subscribe: (callback) => subscribeToProjectTasks(projectId!, callback),
    realtime,
    enableCache: true,
  });

  return {
    tasks: data || [],
    loading,
    error,
    fromCache,
  };
};

export const useTaskMutations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(
    async (data: CreateTaskDto) => {
      if (!user) throw new Error("User not authenticated");

      setLoading(true);
      setError(null);

      const result = await createTask(user.uid, data);
      setLoading(false);

      if (!result.success) {
        setError(result.error as Error);
      }

      return result;
    },
    [user]
  );

  const update = useCallback(async (taskId: string, data: UpdateTaskDto) => {
    setLoading(true);
    setError(null);

    const result = await updateTask(taskId, data, user?.uid);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, [user]);

  const remove = useCallback(async (taskId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteTask(taskId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return {
    create,
    update,
    remove,
    loading,
    error,
  };
};

// ============ Project Config Hooks ============

export const useProjectStatuses = (projectId: string | undefined, realtime = true) => {
  const { user } = useAuth();

  const { data, loading, error, fromCache } = useCachedSubscription<ProjectStatus[]>({
    storeName: STORES.STATUSES,
    cacheKey: `project_${projectId || ""}`,
    userId: user?.uid || "",
    subscribe: (callback) => subscribeToProjectStatuses(projectId!, callback),
    realtime,
    enableCache: true,
  });

  return {
    statuses: data || [],
    loading,
    error,
    fromCache,
  };
};

export const useProjectLabels = (projectId: string | undefined, realtime = true) => {
  const { user } = useAuth();

  const { data, loading, error, fromCache } = useCachedSubscription<ProjectLabel[]>({
    storeName: STORES.LABELS,
    cacheKey: `project_${projectId || ""}`,
    userId: user?.uid || "",
    subscribe: (callback) => subscribeToProjectLabels(projectId!, callback),
    realtime,
    enableCache: true,
  });

  return {
    labels: data || [],
    loading,
    error,
    fromCache,
  };
};

export const useProjectPriorities = (projectId: string | undefined, realtime = true) => {
  const { user } = useAuth();

  const { data, loading, error, fromCache } = useCachedSubscription<ProjectPriority[]>({
    storeName: STORES.PRIORITIES,
    cacheKey: `project_${projectId || ""}`,
    userId: user?.uid || "",
    subscribe: (callback) => subscribeToProjectPriorities(projectId!, callback),
    realtime,
    enableCache: true,
  });

  return {
    priorities: data || [],
    loading,
    error,
    fromCache,
  };
};

// ============ Combined Data Hooks ============

export const useProjectWithData = (projectId: string | undefined) => {
  const { tasks, loading: tasksLoading } = useProjectTasks(projectId);
  const { epics, loading: epicsLoading } = useProjectEpics(projectId);
  const { statuses, loading: statusesLoading } = useProjectStatuses(projectId);
  const { labels, loading: labelsLoading } = useProjectLabels(projectId);
  const { priorities, loading: prioritiesLoading } = useProjectPriorities(projectId);

  const loading = tasksLoading || epicsLoading || statusesLoading || labelsLoading || prioritiesLoading;

  const tasksByStatus = useMemo(() => {
    if (!tasks.length || !statuses.length) return {};
    return groupTasksByStatus(tasks, statuses);
  }, [tasks, statuses]);

  const tasksWithDetails = useMemo(() => {
    if (!tasks.length) return [];
    return enrichTasksWithDetails(tasks, statuses, priorities, labels, epics);
  }, [tasks, statuses, priorities, labels, epics]);

  const epicsWithTaskCount = useMemo(() => {
    if (!epics.length) return [];
    return getEpicsWithTaskCount(epics, tasks, statuses);
  }, [epics, tasks, statuses]);

  return {
    tasks,
    epics,
    statuses,
    labels,
    priorities,
    tasksByStatus,
    tasksWithDetails,
    epicsWithTaskCount,
    loading,
  };
};

export const useProjectsWithTaskCount = () => {
  const { projects, loading: projectsLoading } = useUserProjects(); // Use access-controlled hook
  const { tasks, loading: tasksLoading } = useTasks();
  const [allStatuses, setAllStatuses] = useState<ProjectStatus[]>([]);
  const unsubscribesRef = useRef<Array<() => void>>([]);
  const isMountedRef = useRef(true);

  // Subscribe to statuses for all projects
  useEffect(() => {
    isMountedRef.current = true;

    if (projects.length === 0) {
      setAllStatuses([]);
      return;
    }

    const unsubscribes = projects.map((project) =>
      subscribeToProjectStatuses(project.id, (statuses) => {
        if (!isMountedRef.current) return;

        setAllStatuses((prev) => {
          // Remove old statuses for this project and add new ones
          const filtered = prev.filter((s) => s.projectId !== project.id);
          return [...filtered, ...statuses];
        });
      })
    );

    unsubscribesRef.current = unsubscribes;

    return () => {
      isMountedRef.current = false;
      unsubscribesRef.current.forEach((unsub) => {
        try {
          unsub();
        } catch (e) {
          // Silently catch cleanup errors
        }
      });
      unsubscribesRef.current = [];
    };
  }, [projects]);

  const projectsWithCount = useMemo<ProjectWithTaskCount[]>(() => {
    if (!projects.length) return [];
    return getProjectsWithTaskCount(projects, tasks, allStatuses);
  }, [projects, tasks, allStatuses]);

  return {
    projects: projectsWithCount,
    loading: projectsLoading || tasksLoading,
  };
};

// ============ Config Mutation Hooks ============

export const useStatusMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (projectId: string, data: CreateProjectStatusDto) => {
    setLoading(true);
    setError(null);

    const result = await createProjectStatus(projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const update = useCallback(async (statusId: string, data: UpdateProjectStatusDto) => {
    setLoading(true);
    setError(null);

    const result = await updateProjectStatus(statusId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (statusId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteProjectStatus(statusId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

export const useLabelMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (projectId: string, data: CreateProjectLabelDto) => {
    setLoading(true);
    setError(null);

    const result = await createProjectLabel(projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const update = useCallback(async (labelId: string, data: UpdateProjectLabelDto) => {
    setLoading(true);
    setError(null);

    const result = await updateProjectLabel(labelId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (labelId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteProjectLabel(labelId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

export const usePriorityMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (projectId: string, data: CreateProjectPriorityDto) => {
    setLoading(true);
    setError(null);

    const result = await createProjectPriority(projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const update = useCallback(async (priorityId: string, data: UpdateProjectPriorityDto) => {
    setLoading(true);
    setError(null);

    const result = await updateProjectPriority(priorityId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (priorityId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteProjectPriority(priorityId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Time Tracking Hooks ============

export const useTaskTimeEntries = (taskId: string | undefined, realtime = true) => {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!taskId) {
      setTimeEntries([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      const unsubscribe = subscribeToTaskTimeEntries(taskId, (data, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          console.error("[useTaskTimeEntries] Error:", err);
          setError(err);
          setTimeEntries([]);
        } else {
          setTimeEntries(data);
          setError(null);
        }
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        isMountedRef.current = false;
        if (unsubscribeRef.current) {
          try {
            unsubscribeRef.current();
          } catch (e) {
            // Silently catch cleanup errors
          }
          unsubscribeRef.current = null;
        }
      };
    }
  }, [taskId, realtime]);

  return { timeEntries, loading, error };
};

export const useProjectTimeEntries = (projectId: string | undefined, realtime = true) => {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!projectId) {
      setTimeEntries([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      const unsubscribe = subscribeToProjectTimeEntries(projectId, (data, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          console.error("[useProjectTimeEntries] Error:", err);
          setError(err);
          setTimeEntries([]);
        } else {
          setTimeEntries(data);
          setError(null);
        }
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        isMountedRef.current = false;
        if (unsubscribeRef.current) {
          try {
            unsubscribeRef.current();
          } catch (e) {
            // Silently catch cleanup errors
          }
          unsubscribeRef.current = null;
        }
      };
    }
  }, [projectId, realtime]);

  return { timeEntries, loading, error };
};

export const useTimeEntryMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  const create = useCallback(async (data: CreateTimeEntryDto) => {
    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    setLoading(true);
    setError(null);

    const result = await createTimeEntry(user.uid, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, [user]);

  const update = useCallback(async (entryId: string, data: UpdateTimeEntryDto) => {
    setLoading(true);
    setError(null);

    const result = await updateTimeEntry(entryId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (entryId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteTimeEntry(entryId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Pages Hooks ============

export const useProjectPages = (projectId: string | undefined, realtime = true) => {
  const { user } = useAuth();

  const { data, loading, error, fromCache } = useCachedSubscription<Page[]>({
    storeName: STORES.PAGES,
    cacheKey: `project_${projectId || ""}`,
    userId: user?.uid || "",
    subscribe: (callback) => subscribeToProjectPages(projectId!, callback),
    realtime,
    enableCache: true,
  });

  const pageTree = useMemo(() => {
    if (!data || data.length === 0) return [];
    return buildPageTree(data);
  }, [data]);

  return {
    pages: data || [],
    pageTree,
    loading,
    error,
    fromCache,
  };
};

export const usePageMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  const create = useCallback(async (projectId: string, data: CreatePageDto) => {
    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    setLoading(true);
    setError(null);

    const result = await createPage(user.uid, projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, [user]);

  const update = useCallback(async (pageId: string, data: UpdatePageDto) => {
    setLoading(true);
    setError(null);

    const result = await updatePage(pageId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (pageId: string) => {
    setLoading(true);
    setError(null);

    const result = await deletePage(pageId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Documents Hooks ============

export const useProjectDocuments = (projectId: string | undefined, realtime = true) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!projectId) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      const unsubscribe = subscribeToProjectDocuments(projectId, (data, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          console.error("[useProjectDocuments] Error:", err);
          setError(err);
          setDocuments([]);
        } else {
          setDocuments(data);
          setError(null);
        }
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        isMountedRef.current = false;
        if (unsubscribeRef.current) {
          try {
            unsubscribeRef.current();
          } catch (e) {
            // Silently catch cleanup errors
          }
          unsubscribeRef.current = null;
        }
      };
    }
  }, [projectId, realtime]);

  return { documents, loading, error };
};

export const useDocumentMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  const create = useCallback(async (projectId: string, data: CreateDocumentDto) => {
    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    setLoading(true);
    setError(null);

    const result = await createProjectDocument(user.uid, projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, [user]);

  const update = useCallback(async (documentId: string, data: UpdateDocumentDto) => {
    setLoading(true);
    setError(null);

    const result = await updateProjectDocument(documentId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (documentId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteProjectDocument(documentId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Links Hooks ============

export const useProjectLinks = (projectId: string | undefined, realtime = true) => {
  const { user } = useAuth();

  const { data, loading, error, fromCache } = useCachedSubscription<Link[]>({
    storeName: STORES.LINKS,
    cacheKey: `project_${projectId || ""}`,
    userId: user?.uid || "",
    subscribe: (callback) => subscribeToProjectLinks(projectId!, callback),
    realtime,
    enableCache: true,
  });

  const linkTree = useMemo(() => {
    if (!data || data.length === 0) return [];
    return buildLinkTree(data);
  }, [data]);

  return {
    links: data || [],
    linkTree,
    loading,
    error,
    fromCache,
  };
};

export const useLinkMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  const create = useCallback(async (projectId: string, data: CreateLinkDto) => {
    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    setLoading(true);
    setError(null);

    const result = await createLink(user.uid, projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, [user]);

  const update = useCallback(async (linkId: string, data: UpdateLinkDto) => {
    setLoading(true);
    setError(null);

    const result = await updateLink(linkId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (linkId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteLink(linkId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Tasks with Details Hook ============

export const useTasksWithDetails = (projectId: string | undefined) => {
  const { tasks, loading: tasksLoading } = useProjectTasks(projectId);
  const { epics, loading: epicsLoading } = useProjectEpics(projectId);
  const { cycles, loading: cyclesLoading } = useProjectCycles(projectId);
  const { statuses, loading: statusesLoading } = useProjectStatuses(projectId);
  const { labels, loading: labelsLoading } = useProjectLabels(projectId);
  const { priorities, loading: prioritiesLoading } = useProjectPriorities(projectId);

  const tasksWithDetails = useMemo<TaskWithDetails[]>(() => {
    if (!tasks.length) return [];
    return enrichTasksWithDetailsIncludingCycle(tasks, statuses, priorities, labels, epics, cycles);
  }, [tasks, statuses, priorities, labels, epics, cycles]);

  return {
    tasksWithDetails,
    loading: tasksLoading || epicsLoading || cyclesLoading || statusesLoading || labelsLoading || prioritiesLoading,
  };
};

// ============ Test Suites Hooks ============

export const useProjectTestSuites = (projectId: string | undefined, realtime = true) => {
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!projectId) {
      setTestSuites([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      const unsubscribe = subscribeToProjectTestSuites(projectId, (data, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          console.error("[useProjectTestSuites] Error:", err);
          setError(err);
          setTestSuites([]);
        } else {
          setTestSuites(data);
          setError(null);
        }
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        isMountedRef.current = false;
        if (unsubscribeRef.current) {
          try {
            unsubscribeRef.current();
          } catch (e) {
            // Silently catch cleanup errors
          }
          unsubscribeRef.current = null;
        }
      };
    }
  }, [projectId, realtime]);

  return { testSuites, loading, error };
};

export const useTestSuiteMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  const create = useCallback(async (projectId: string, data: CreateTestSuiteDto) => {
    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    setLoading(true);
    setError(null);

    const result = await createTestSuite(user.uid, projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, [user]);

  const update = useCallback(async (suiteId: string, data: UpdateTestSuiteDto) => {
    setLoading(true);
    setError(null);

    const result = await updateTestSuite(suiteId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (suiteId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteTestSuite(suiteId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Test Cases Hooks ============

export const useProjectTestCases = (projectId: string | undefined, realtime = true) => {
  const { user } = useAuth();

  const { data, loading, error, fromCache } = useCachedSubscription<TestCase[]>({
    storeName: STORES.TEST_CASES,
    cacheKey: `project_${projectId || ""}`,
    userId: user?.uid || "",
    subscribe: (callback) => subscribeToProjectTestCases(projectId!, callback),
    realtime,
    enableCache: true,
  });

  const testCaseTree = useMemo(() => {
    if (!data || data.length === 0) return [];
    return buildTestCaseTree(data);
  }, [data]);

  return {
    testCases: data || [],
    testCaseTree,
    loading,
    error,
    fromCache,
  };
};

export const useTestCaseMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  const create = useCallback(async (projectId: string, data: CreateTestCaseDto) => {
    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    setLoading(true);
    setError(null);

    const result = await createTestCase(user.uid, projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, [user]);

  const update = useCallback(async (testCaseId: string, data: UpdateTestCaseDto) => {
    setLoading(true);
    setError(null);

    const result = await updateTestCase(testCaseId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (testCaseId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteTestCase(testCaseId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Test Executions Hooks ============

export const useTestCaseExecutions = (testCaseId: string | undefined) => {
  const [executions, setExecutions] = useState<TestExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!testCaseId) {
      setExecutions([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToTestCaseExecutions(testCaseId, (data, err) => {
      if (!isMountedRef.current) return;

      if (err) {
        console.error("[useTestCaseExecutions] Error:", err);
        setError(err);
        setExecutions([]);
      } else {
        setExecutions(data);
        setError(null);
      }
      setLoading(false);
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        try {
          unsubscribeRef.current();
        } catch (e) {
          // Silently catch cleanup errors
        }
        unsubscribeRef.current = null;
      }
    };
  }, [testCaseId]);

  return { executions, loading, error };
};

export const useTestExecutionMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  const execute = useCallback(async (projectId: string, data: CreateTestExecutionDto) => {
    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    setLoading(true);
    setError(null);

    const result = await createTestExecution(user.uid, projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, [user]);

  return { execute, loading, error };
};

// ============ Test Cases with Details ============

export const useTestCasesWithDetails = (projectId: string | undefined) => {
  const { testCases, loading: testCasesLoading } = useProjectTestCases(projectId);
  const { testSuites, loading: suitesLoading } = useProjectTestSuites(projectId);
  const { tasks, loading: tasksLoading } = useProjectTasks(projectId);
  const [executions, setExecutions] = useState<TestExecution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(true);
  const unsubscribesRef = useRef<Array<() => void>>([]);
  const isMountedRef = useRef(true);

  // Subscribe to all test case executions for this project
  useEffect(() => {
    isMountedRef.current = true;

    if (!testCases.length) {
      setExecutions([]);
      setExecutionsLoading(false);
      return;
    }

    const unsubscribes = testCases.map((testCase) =>
      subscribeToTestCaseExecutions(testCase.id, (data, err) => {
        if (!isMountedRef.current) return;

        if (!err) {
          setExecutions((prev) => {
            const filtered = prev.filter((e) => e.testCaseId !== testCase.id);
            return [...filtered, ...data];
          });
        }
      })
    );

    unsubscribesRef.current = unsubscribes;
    setExecutionsLoading(false);

    return () => {
      isMountedRef.current = false;
      unsubscribesRef.current.forEach((unsub) => {
        try {
          unsub();
        } catch (e) {
          // Silently catch cleanup errors
        }
      });
      unsubscribesRef.current = [];
    };
  }, [testCases]);

  const testCasesWithDetails = useMemo<TestCaseWithDetails[]>(() => {
    if (!testCases.length) return [];
    return enrichTestCasesWithDetails(testCases, testSuites, tasks, executions);
  }, [testCases, testSuites, tasks, executions]);

  return {
    testCasesWithDetails,
    loading: testCasesLoading || suitesLoading || tasksLoading || executionsLoading,
  };
};

export const useTestSuitesWithStats = (projectId: string | undefined) => {
  const { testSuites, loading: suitesLoading } = useProjectTestSuites(projectId);
  const { testCases, loading: testCasesLoading } = useProjectTestCases(projectId);
  const [executions, setExecutions] = useState<TestExecution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(true);
  const unsubscribesRef = useRef<Array<() => void>>([]);
  const isMountedRef = useRef(true);

  // Subscribe to all executions
  useEffect(() => {
    isMountedRef.current = true;

    if (!testCases.length) {
      setExecutions([]);
      setExecutionsLoading(false);
      return;
    }

    const unsubscribes = testCases.map((testCase) =>
      subscribeToTestCaseExecutions(testCase.id, (data, err) => {
        if (!isMountedRef.current) return;

        if (!err) {
          setExecutions((prev) => {
            const filtered = prev.filter((e) => e.testCaseId !== testCase.id);
            return [...filtered, ...data];
          });
        }
      })
    );

    unsubscribesRef.current = unsubscribes;
    setExecutionsLoading(false);

    return () => {
      isMountedRef.current = false;
      unsubscribesRef.current.forEach((unsub) => {
        try {
          unsub();
        } catch (e) {
          // Silently catch cleanup errors
        }
      });
      unsubscribesRef.current = [];
    };
  }, [testCases]);

  const testSuitesWithStats = useMemo<TestSuiteWithStats[]>(() => {
    if (!testSuites.length) return [];
    return getTestSuitesWithStats(testSuites, testCases, executions);
  }, [testSuites, testCases, executions]);

  return {
    testSuitesWithStats,
    loading: suitesLoading || testCasesLoading || executionsLoading,
  };
};

// ============ Cycles Hooks ============

export const useProjectCycles = (projectId: string | undefined, realtime = true) => {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!projectId) {
      setCycles([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      const unsubscribe = subscribeToProjectCycles(projectId, (data, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          console.error("[useProjectCycles] Error:", err);
          setError(err);
          setCycles([]);
        } else {
          setCycles(data);
          setError(null);
        }
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        isMountedRef.current = false;
        if (unsubscribeRef.current) {
          try {
            unsubscribeRef.current();
          } catch (e) {
            // Silently catch cleanup errors
          }
          unsubscribeRef.current = null;
        }
      };
    }
  }, [projectId, realtime]);

  return { cycles, loading, error };
};

export const useCycleMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  const create = useCallback(async (projectId: string, data: CreateCycleDto) => {
    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    setLoading(true);
    setError(null);

    const result = await createCycle(user.uid, projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, [user]);

  const update = useCallback(async (cycleId: string, data: UpdateCycleDto) => {
    setLoading(true);
    setError(null);

    const result = await updateCycle(cycleId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (cycleId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteCycle(cycleId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Cycles with Stats ============

export const useCyclesWithStats = (projectId: string | undefined) => {
  const { cycles, loading: cyclesLoading } = useProjectCycles(projectId);
  const { tasks, loading: tasksLoading } = useProjectTasks(projectId);
  const { statuses, loading: statusesLoading } = useProjectStatuses(projectId);

  const cyclesWithStats = useMemo<CycleWithStats[]>(() => {
    if (!cycles.length) return [];
    return getCyclesWithStats(cycles, tasks, statuses);
  }, [cycles, tasks, statuses]);

  return {
    cyclesWithStats,
    loading: cyclesLoading || tasksLoading || statusesLoading,
  };
};

// ============ Views Hooks ============

export const useProjectViews = (projectId: string | undefined, realtime = true) => {
  const [views, setViews] = useState<View[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!projectId) {
      setViews([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      const unsubscribe = subscribeToProjectViews(projectId, (data, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          console.error("[useProjectViews] Error:", err);
          setError(err);
          setViews([]);
        } else {
          setViews(data);
          setError(null);
        }
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        isMountedRef.current = false;
        if (unsubscribeRef.current) {
          try {
            unsubscribeRef.current();
          } catch (e) {
            // Silently catch cleanup errors
          }
          unsubscribeRef.current = null;
        }
      };
    }
  }, [projectId, realtime]);

  return { views, loading, error };
};

export const useViewMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();

  const create = useCallback(async (projectId: string, data: CreateViewDto) => {
    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    setLoading(true);
    setError(null);

    const result = await createView(user.uid, projectId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, [user]);

  const update = useCallback(async (viewId: string, data: UpdateViewDto) => {
    setLoading(true);
    setError(null);

    const result = await updateView(viewId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (viewId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteView(viewId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};
