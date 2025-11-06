import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/shared/contexts/auth-context";
import {
  createUser,
  updateUser,
  deleteUser,
  getUser,
  getUserWithRole,
  subscribeToUsers,
  createRole,
  updateRole,
  deleteRole,
  getRole,
  getRoleWithPermissions,
  subscribeToRoles,
  createPermission,
  updatePermission,
  deletePermission,
  subscribeToPermissions,
  checkUserPermission,
  enrichUsersWithRoles,
  enrichRolesWithPermissions,
} from "./services";
import type {
  User,
  Role,
  Permission,
  CreateUserDto,
  UpdateUserDto,
  CreateRoleDto,
  UpdateRoleDto,
  CreatePermissionDto,
  UpdatePermissionDto,
  UserWithRole,
  RoleWithPermissions,
  PermissionAction,
  PermissionResource,
} from "./entity";

// ============ Users Hooks ============

export const useUsers = (realtime = true, workspaceId?: string, enabled = true) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // Don't fetch if disabled
    if (!enabled) {
      setLoading(false);
      setUsers([]);
      setError(null);
      return;
    }

    if (!realtime) {
      return;
    }

    setLoading(true);

    const unsubscribe = subscribeToUsers((data, err) => {
      if (!isMountedRef.current) return;

      if (err) {
        console.error("[useUsers] Error:", err);
        setError(err);
        setUsers([]);
      } else {
        setUsers(data);
        setError(null);
      }
      setLoading(false);
    }, workspaceId);

    unsubscribeRef.current = unsubscribe;

    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        try {
          unsubscribeRef.current();
        } catch (e) {
          console.error("Error unsubscribing:", e);
        }
        unsubscribeRef.current = null;
      }
    };
  }, [realtime, workspaceId, enabled]);

  return { users, loading, error };
};

export const useUserMutations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(
    async (data: CreateUserDto) => {
      if (!user) throw new Error("User not authenticated");

      setLoading(true);
      setError(null);

      const result = await createUser(user.uid, data);
      setLoading(false);

      if (!result.success) {
        setError(result.error as Error);
      }

      return result;
    },
    [user]
  );

  const update = useCallback(async (userId: string, data: UpdateUserDto) => {
    setLoading(true);
    setError(null);

    const result = await updateUser(userId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteUser(userId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

export const useCurrentUser = () => {
  const { user } = useAuth();
  const [currentUser, setCurrentUser] = useState<UserWithRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }

    const fetchUser = async () => {
      try {
        const userData = await getUserWithRole(user.uid);
        setCurrentUser(userData);
        setError(null);
      } catch (err) {
        console.error("[useCurrentUser] Error:", err);
        setError(err as Error);
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [user]);

  return { currentUser, loading, error };
};

// ============ Roles Hooks ============

export const useRoles = (realtime = true) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    console.log('[useRoles] Starting subscription...');

    if (realtime) {
      const unsubscribe = subscribeToRoles((data, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          console.error("[useRoles] Error:", err);
          setError(err);
          setRoles([]);
        } else {
          console.log(`[useRoles] Received ${data.length} roles:`, data);
          setRoles(data);
          setError(null);
        }
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        isMountedRef.current = false;
        console.log('[useRoles] Cleaning up subscription...');
        if (unsubscribeRef.current) {
          try {
            unsubscribeRef.current();
          } catch (e) {
            console.error("Error unsubscribing:", e);
          }
          unsubscribeRef.current = null;
        }
      };
    }
  }, [realtime]);

  return { roles, loading, error };
};

export const useRoleMutations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(
    async (data: CreateRoleDto) => {
      if (!user) throw new Error("User not authenticated");

      setLoading(true);
      setError(null);

      const result = await createRole(user.uid, data);
      setLoading(false);

      if (!result.success) {
        setError(result.error as Error);
      }

      return result;
    },
    [user]
  );

  const update = useCallback(async (roleId: string, data: UpdateRoleDto) => {
    setLoading(true);
    setError(null);

    const result = await updateRole(roleId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (roleId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteRole(roleId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Permissions Hooks ============

export const usePermissions = (realtime = true) => {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    console.log('[usePermissions] Starting subscription...');

    if (realtime) {
      const unsubscribe = subscribeToPermissions((data, err) => {
        if (!isMountedRef.current) return;

        if (err) {
          console.error("[usePermissions] Error:", err);
          setError(err);
          setPermissions([]);
        } else {
          console.log(`[usePermissions] Received ${data.length} permissions`);
          setPermissions(data);
          setError(null);
        }
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        isMountedRef.current = false;
        console.log('[usePermissions] Cleaning up subscription...');
        if (unsubscribeRef.current) {
          try {
            unsubscribeRef.current();
          } catch (e) {
            console.error("Error unsubscribing:", e);
          }
          unsubscribeRef.current = null;
        }
      };
    }
  }, [realtime]);

  return { permissions, loading, error };
};

export const usePermissionMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (data: CreatePermissionDto) => {
    setLoading(true);
    setError(null);

    const result = await createPermission(data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const update = useCallback(
    async (permissionId: string, data: UpdatePermissionDto) => {
      setLoading(true);
      setError(null);

      const result = await updatePermission(permissionId, data);
      setLoading(false);

      if (!result.success) {
        setError(result.error as Error);
      }

      return result;
    },
    []
  );

  const remove = useCallback(async (permissionId: string) => {
    setLoading(true);
    setError(null);

    const result = await deletePermission(permissionId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Combined Hooks ============

export const useUsersWithRoles = () => {
  const { currentUser, loading: currentUserLoading } = useCurrentUser();

  // Get workspace ID - memoized to prevent unnecessary re-renders
  const workspaceId = useMemo(() => {
    if (!currentUser) return undefined;
    return currentUser.currentWorkspaceId || currentUser.workspaceIds?.[0];
  }, [currentUser?.currentWorkspaceId, currentUser?.workspaceIds?.[0]]);

  // Only fetch users when currentUser is loaded
  const { users, loading: usersLoading } = useUsers(
    true,
    workspaceId,
    !!currentUser && !currentUserLoading // Only enable when currentUser exists and is loaded
  );
  const { roles, loading: rolesLoading } = useRoles();

  const usersWithRoles = useMemo<UserWithRole[]>(() => {
    if (!users.length || !roles.length) return [];
    return enrichUsersWithRoles(users, roles);
  }, [users, roles]);

  return {
    usersWithRoles,
    loading: currentUserLoading || usersLoading || rolesLoading,
  };
};

export const useRolesWithPermissions = () => {
  const { roles, loading: rolesLoading } = useRoles();
  const { permissions, loading: permissionsLoading } = usePermissions();

  const rolesWithPermissions = useMemo<RoleWithPermissions[]>(() => {
    if (!roles.length || !permissions.length) return [];
    return enrichRolesWithPermissions(roles, permissions);
  }, [roles, permissions]);

  return {
    rolesWithPermissions,
    loading: rolesLoading || permissionsLoading,
  };
};

// ============ Permission Checking Hook ============

export const usePermissionCheck = () => {
  const { user } = useAuth();

  const hasPermission = useCallback(
    async (action: PermissionAction, resource: PermissionResource): Promise<boolean> => {
      if (!user) return false;
      return await checkUserPermission(user.uid, action, resource);
    },
    [user]
  );

  const canCreate = useCallback(
    (resource: PermissionResource) => hasPermission("create" as PermissionAction, resource),
    [hasPermission]
  );

  const canRead = useCallback(
    (resource: PermissionResource) => hasPermission("read" as PermissionAction, resource),
    [hasPermission]
  );

  const canUpdate = useCallback(
    (resource: PermissionResource) => hasPermission("update" as PermissionAction, resource),
    [hasPermission]
  );

  const canDelete = useCallback(
    (resource: PermissionResource) => hasPermission("delete" as PermissionAction, resource),
    [hasPermission]
  );

  const canManage = useCallback(
    (resource: PermissionResource) => hasPermission("manage" as PermissionAction, resource),
    [hasPermission]
  );

  return {
    hasPermission,
    canCreate,
    canRead,
    canUpdate,
    canDelete,
    canManage,
  };
};
