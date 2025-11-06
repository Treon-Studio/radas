import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { db, auth } from "@/shared/lib/firebase";
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
  UserStatus,
} from "./entity";

// ============ Collections ============

const USERS_COLLECTION = "users";
const ROLES_COLLECTION = "roles";
const PERMISSIONS_COLLECTION = "permissions";

// ============ User Services ============

export const createUser = async (
  creatorId: string,
  data: CreateUserDto
): Promise<{ success: boolean; id?: string; error?: Error }> => {
  try {
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      data.email,
      data.password
    );

    const uid = userCredential.user.uid;

    // Create user document in Firestore
    const userDoc: any = {
      email: data.email,
      displayName: data.displayName,
      roleIds: data.roleIds, // Multiple roles
      workspaceIds: [data.workspaceId], // Add to workspace
      currentWorkspaceId: data.workspaceId, // Set as current workspace
      status: "active" as UserStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: creatorId,
    };

    // Only add photoURL if it exists
    if (data.photoURL) {
      userDoc.photoURL = data.photoURL;
    }

    await setDoc(doc(db, USERS_COLLECTION, uid), userDoc);

    return { success: true, id: uid };
  } catch (error) {
    console.error("[createUser] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const updateUser = async (
  userId: string,
  data: UpdateUserDto
): Promise<{ success: boolean; error?: Error }> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);

    const updates: any = {
      updatedAt: serverTimestamp(),
    };

    // Only add fields that are defined
    if (data.displayName !== undefined) updates.displayName = data.displayName;
    if (data.photoURL !== undefined) updates.photoURL = data.photoURL;
    if (data.roleIds !== undefined) updates.roleIds = data.roleIds;
    if (data.workspaceIds !== undefined) updates.workspaceIds = data.workspaceIds;
    if (data.currentWorkspaceId !== undefined) updates.currentWorkspaceId = data.currentWorkspaceId;
    if (data.status !== undefined) updates.status = data.status;

    await updateDoc(userRef, updates);

    return { success: true };
  } catch (error) {
    console.error("[updateUser] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const deleteUser = async (
  userId: string
): Promise<{ success: boolean; error?: Error }> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await deleteDoc(userRef);

    return { success: true };
  } catch (error) {
    console.error("[deleteUser] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const getUser = async (userId: string): Promise<User | null> => {
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return null;

    return {
      id: userSnap.id,
      ...userSnap.data(),
    } as User;
  } catch (error) {
    console.error("[getUser] Error:", error);
    return null;
  }
};

export const subscribeToUsers = (
  callback: (users: User[], error?: Error) => void,
  workspaceId?: string
): (() => void) => {
  // If workspaceId is provided, filter users by workspace
  const q = workspaceId
    ? query(
        collection(db, USERS_COLLECTION),
        where("workspaceIds", "array-contains", workspaceId),
        orderBy("createdAt", "desc")
      )
    : query(
        collection(db, USERS_COLLECTION),
        orderBy("createdAt", "desc")
      );

  return onSnapshot(
    q,
    (snapshot) => {
      const users: User[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as User[];

      callback(users);
    },
    (error) => {
      console.error("[subscribeToUsers] Error:", error);
      callback([], error as Error);
    }
  );
};

export const getUserWithRole = async (userId: string): Promise<UserWithRole | null> => {
  try {
    const user = await getUser(userId);
    if (!user) return null;

    // Get all roles for the user
    const roles = await Promise.all(
      user.roleIds.map((roleId) => getRole(roleId))
    );

    const validRoles = roles.filter((r) => r !== null) as Role[];

    if (validRoles.length === 0) return null;

    return {
      ...user,
      role: validRoles[0], // Primary role (first one)
      roles: validRoles, // All roles
    };
  } catch (error) {
    console.error("[getUserWithRole] Error:", error);
    return null;
  }
};

// ============ Role Services ============

export const createRole = async (
  creatorId: string,
  data: CreateRoleDto
): Promise<{ success: boolean; id?: string; error?: Error }> => {
  try {
    const roleDoc = {
      name: data.name,
      description: data.description,
      permissionIds: data.permissionIds,
      isSystem: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: creatorId,
    };

    const docRef = await addDoc(collection(db, ROLES_COLLECTION), roleDoc);

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("[createRole] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const updateRole = async (
  roleId: string,
  data: UpdateRoleDto
): Promise<{ success: boolean; error?: Error }> => {
  try {
    const roleRef = doc(db, ROLES_COLLECTION, roleId);

    // Check if role is system role
    const roleSnap = await getDoc(roleRef);
    if (roleSnap.exists() && roleSnap.data().isSystem) {
      // Only allow updating permissionIds for system roles
      if (data.name || data.description) {
        return {
          success: false,
          error: new Error("Cannot modify system role name or description"),
        };
      }
    }

    const updates: any = {
      ...data,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(roleRef, updates);

    return { success: true };
  } catch (error) {
    console.error("[updateRole] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const deleteRole = async (
  roleId: string
): Promise<{ success: boolean; error?: Error }> => {
  try {
    const roleRef = doc(db, ROLES_COLLECTION, roleId);

    // Check if role is system role
    const roleSnap = await getDoc(roleRef);
    if (roleSnap.exists() && roleSnap.data().isSystem) {
      return {
        success: false,
        error: new Error("Cannot delete system role"),
      };
    }

    // Check if role is being used by any users
    const usersQuery = query(
      collection(db, USERS_COLLECTION),
      where("roleId", "==", roleId)
    );
    const usersSnap = await getDocs(usersQuery);

    if (!usersSnap.empty) {
      return {
        success: false,
        error: new Error("Cannot delete role that is assigned to users"),
      };
    }

    await deleteDoc(roleRef);

    return { success: true };
  } catch (error) {
    console.error("[deleteRole] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const getRole = async (roleId: string): Promise<Role | null> => {
  try {
    const roleRef = doc(db, ROLES_COLLECTION, roleId);
    const roleSnap = await getDoc(roleRef);

    if (!roleSnap.exists()) return null;

    return {
      id: roleSnap.id,
      ...roleSnap.data(),
    } as Role;
  } catch (error) {
    console.error("[getRole] Error:", error);
    return null;
  }
};

export const subscribeToRoles = (
  callback: (roles: Role[], error?: Error) => void
): (() => void) => {
  // Temporarily removed orderBy to support manually created data
  // TODO: Re-add orderBy("createdAt", "desc") after running setup script
  const q = query(
    collection(db, ROLES_COLLECTION)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const roles: Role[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Role[];

      // Sort in memory as fallback
      roles.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });

      callback(roles);
    },
    (error) => {
      console.error("[subscribeToRoles] Error:", error);
      callback([], error as Error);
    }
  );
};

export const getRoleWithPermissions = async (roleId: string): Promise<RoleWithPermissions | null> => {
  try {
    const role = await getRole(roleId);
    if (!role) return null;

    const permissions = await Promise.all(
      role.permissionIds.map((permId) => getPermission(permId))
    );

    return {
      ...role,
      permissions: permissions.filter((p) => p !== null) as Permission[],
    };
  } catch (error) {
    console.error("[getRoleWithPermissions] Error:", error);
    return null;
  }
};

// ============ Permission Services ============

export const createPermission = async (
  data: CreatePermissionDto
): Promise<{ success: boolean; id?: string; error?: Error }> => {
  try {
    const permissionDoc = {
      name: data.name,
      description: data.description,
      action: data.action,
      resource: data.resource,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, PERMISSIONS_COLLECTION), permissionDoc);

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("[createPermission] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const updatePermission = async (
  permissionId: string,
  data: UpdatePermissionDto
): Promise<{ success: boolean; error?: Error }> => {
  try {
    const permissionRef = doc(db, PERMISSIONS_COLLECTION, permissionId);

    const updates: any = {
      ...data,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(permissionRef, updates);

    return { success: true };
  } catch (error) {
    console.error("[updatePermission] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const deletePermission = async (
  permissionId: string
): Promise<{ success: boolean; error?: Error }> => {
  try {
    // Check if permission is being used by any roles
    const rolesQuery = query(
      collection(db, ROLES_COLLECTION),
      where("permissionIds", "array-contains", permissionId)
    );
    const rolesSnap = await getDocs(rolesQuery);

    if (!rolesSnap.empty) {
      return {
        success: false,
        error: new Error("Cannot delete permission that is assigned to roles"),
      };
    }

    const permissionRef = doc(db, PERMISSIONS_COLLECTION, permissionId);
    await deleteDoc(permissionRef);

    return { success: true };
  } catch (error) {
    console.error("[deletePermission] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const getPermission = async (permissionId: string): Promise<Permission | null> => {
  try {
    const permissionRef = doc(db, PERMISSIONS_COLLECTION, permissionId);
    const permissionSnap = await getDoc(permissionRef);

    if (!permissionSnap.exists()) return null;

    return {
      id: permissionSnap.id,
      ...permissionSnap.data(),
    } as Permission;
  } catch (error) {
    console.error("[getPermission] Error:", error);
    return null;
  }
};

export const subscribeToPermissions = (
  callback: (permissions: Permission[], error?: Error) => void
): (() => void) => {
  // Temporarily removed orderBy to support manually created data
  // TODO: Re-add orderBy after running setup script
  const q = query(
    collection(db, PERMISSIONS_COLLECTION)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const permissions: Permission[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Permission[];

      // Sort in memory as fallback
      permissions.sort((a, b) => {
        if (!a.resource || !b.resource) return 0;
        if (a.resource !== b.resource) {
          return a.resource.localeCompare(b.resource);
        }
        if (!a.action || !b.action) return 0;
        return a.action.localeCompare(b.action);
      });

      callback(permissions);
    },
    (error) => {
      console.error("[subscribeToPermissions] Error:", error);
      callback([], error as Error);
    }
  );
};

// ============ Permission Checking ============

export const checkUserPermission = async (
  userId: string,
  action: string,
  resource: string
): Promise<boolean> => {
  try {
    const user = await getUser(userId);
    if (!user) return false;

    // Check permissions across all user's roles
    for (const roleId of user.roleIds) {
      const roleWithPermissions = await getRoleWithPermissions(roleId);
      if (!roleWithPermissions) continue;

      // Check if user has the specific permission or manage:all permission
      const hasPermission = roleWithPermissions.permissions.some(
        (p) =>
          (p.action === action && p.resource === resource) ||
          (p.action === "manage" && p.resource === "all")
      );

      if (hasPermission) return true;
    }

    return false;
  } catch (error) {
    console.error("[checkUserPermission] Error:", error);
    return false;
  }
};

// ============ Helper Functions ============

export const enrichUsersWithRoles = (users: User[], roles: Role[]): UserWithRole[] => {
  return users.map((user) => {
    const userRoles = roles.filter((r) => user.roleIds.includes(r.id));
    return {
      ...user,
      role: userRoles[0] || roles[0], // Primary role (first one) with fallback
      roles: userRoles, // All roles
    };
  });
};

export const enrichRolesWithPermissions = (
  roles: Role[],
  permissions: Permission[]
): RoleWithPermissions[] => {
  return roles.map((role) => {
    const rolePermissions = permissions.filter((p) =>
      role.permissionIds.includes(p.id)
    );
    return {
      ...role,
      permissions: rolePermissions,
    };
  });
};
