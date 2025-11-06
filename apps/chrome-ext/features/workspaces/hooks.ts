import { useState, useEffect } from "react";
import { useAuth } from "@/shared/contexts/auth-context";
import type {
  Workspace,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  AddWorkspaceMemberDto,
  WorkspaceMemberRole,
  WorkspaceWithMembers,
} from "./entity";
import {
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getWorkspace,
  subscribeToWorkspaces,
  addWorkspaceMember,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  getWorkspaceWithMembers,
  isWorkspaceAdmin,
  getUserWorkspaces,
} from "./services";

// ============ Query Hooks ============

export const useWorkspaces = (realtime = true) => {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      // Subscribe to real-time updates
      const unsubscribe = subscribeToWorkspaces(
        user.uid,
        (data, err) => {
          if (err) {
            setError(err);
          } else {
            setWorkspaces(data);
          }
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } else {
      // One-time fetch
      const fetchWorkspaces = async () => {
        try {
          const data = await getUserWorkspaces(user.uid);
          setWorkspaces(data);
        } catch (err) {
          setError(err as Error);
        } finally {
          setLoading(false);
        }
      };

      fetchWorkspaces();
    }
  }, [user, realtime]);

  return { workspaces, loading, error };
};

export const useCurrentWorkspace = () => {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setWorkspace(null);
      setLoading(false);
      return;
    }

    const fetchCurrentWorkspace = async () => {
      try {
        // Get user's current workspace
        const workspaces = await getUserWorkspaces(user.uid);

        // For now, use the first workspace
        // TODO: Get from user.currentWorkspaceId when that field is populated
        if (workspaces.length > 0) {
          setWorkspace(workspaces[0]);
        }
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentWorkspace();
  }, [user]);

  return { workspace, loading, error };
};

export const useWorkspace = (workspaceId: string | null) => {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setWorkspace(null);
      setLoading(false);
      return;
    }

    const fetchWorkspace = async () => {
      try {
        const data = await getWorkspace(workspaceId);
        setWorkspace(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspace();
  }, [workspaceId]);

  return { workspace, loading, error };
};

export const useWorkspaceWithMembers = (workspaceId: string | null) => {
  const [workspace, setWorkspace] = useState<WorkspaceWithMembers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setWorkspace(null);
      setLoading(false);
      return;
    }

    const fetchWorkspace = async () => {
      try {
        const data = await getWorkspaceWithMembers(workspaceId);
        setWorkspace(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspace();
  }, [workspaceId]);

  return { workspace, loading, error };
};

export const useIsWorkspaceAdmin = (workspaceId: string | null) => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !workspaceId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const checkAdmin = async () => {
      const result = await isWorkspaceAdmin(workspaceId, user.uid);
      setIsAdmin(result);
      setLoading(false);
    };

    checkAdmin();
  }, [user, workspaceId]);

  return { isAdmin, loading };
};

// ============ Mutation Hooks ============

export const useWorkspaceMutations = () => {
  const { user } = useAuth();

  const create = async (data: CreateWorkspaceDto) => {
    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    return await createWorkspace(user.uid, data);
  };

  const update = async (workspaceId: string, data: UpdateWorkspaceDto) => {
    return await updateWorkspace(workspaceId, data);
  };

  const remove = async (workspaceId: string) => {
    return await deleteWorkspace(workspaceId);
  };

  const addMember = async (workspaceId: string, data: AddWorkspaceMemberDto) => {
    return await addWorkspaceMember(workspaceId, data);
  };

  const removeMember = async (workspaceId: string, userId: string) => {
    return await removeWorkspaceMember(workspaceId, userId);
  };

  const updateMemberRole = async (
    workspaceId: string,
    userId: string,
    role: WorkspaceMemberRole
  ) => {
    return await updateWorkspaceMemberRole(workspaceId, userId, role);
  };

  return {
    create,
    update,
    remove,
    addMember,
    removeMember,
    updateMemberRole,
  };
};
