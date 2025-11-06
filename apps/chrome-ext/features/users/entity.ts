import type { Timestamp } from "firebase/firestore";

// ============ Permission Entity ============

export enum PermissionAction {
  CREATE = "create",
  READ = "read",
  UPDATE = "update",
  DELETE = "delete",
  MANAGE = "manage",
}

export enum PermissionResource {
  PROJECT = "project",
  TASK = "task",
  EPIC = "epic",
  PAGE = "page",
  DOCUMENT = "document",
  LINK = "link",
  TEST_CASE = "test_case",
  USER = "user",
  ROLE = "role",
  ALL = "all",
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  action: PermissionAction;
  resource: PermissionResource;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreatePermissionDto {
  name: string;
  description: string;
  action: PermissionAction;
  resource: PermissionResource;
}

export interface UpdatePermissionDto {
  name?: string;
  description?: string;
  action?: PermissionAction;
  resource?: PermissionResource;
}

// ============ Role Entity ============

export interface Role {
  id: string;
  name: string;
  description: string;
  permissionIds: string[];
  isSystem: boolean; // System roles cannot be deleted (Admin, Member, Viewer)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface CreateRoleDto {
  name: string;
  description: string;
  permissionIds: string[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  permissionIds?: string[];
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

// ============ User Entity ============

export enum UserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  PENDING = "pending",
}

export interface User {
  id: string; // Same as Firebase Auth UID
  email: string;
  displayName: string;
  photoURL?: string;
  roleIds: string[]; // Multiple roles support
  workspaceIds: string[]; // Workspaces user belongs to
  currentWorkspaceId?: string; // Currently active workspace
  status: UserStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
  createdBy?: string;
}

export interface CreateUserDto {
  email: string;
  displayName: string;
  photoURL?: string;
  roleIds: string[]; // Multiple roles
  workspaceId: string; // Workspace to add user to
  password: string;
}

export interface UpdateUserDto {
  displayName?: string;
  photoURL?: string;
  roleIds?: string[]; // Multiple roles
  workspaceIds?: string[];
  currentWorkspaceId?: string;
  status?: UserStatus;
}

export interface UserWithRole extends User {
  role: Role; // Primary role (first in roleIds array)
  roles: Role[]; // All roles
}

export interface UserWithWorkspaces extends User {
  roles: Role[];
  workspaces: Array<{ id: string; name: string }>;
  currentWorkspace?: { id: string; name: string };
}

// ============ System Roles ============

export const SYSTEM_ROLES = {
  ADMIN: {
    name: "Admin",
    description: "Full access to all features and settings",
  },
  MEMBER: {
    name: "Member",
    description: "Can create and manage projects and tasks",
  },
  VIEWER: {
    name: "Viewer",
    description: "Read-only access to projects",
  },
} as const;

// ============ Permission Helpers ============

export const createPermissionKey = (action: PermissionAction, resource: PermissionResource): string => {
  return `${action}:${resource}`;
};

export const parsePermissionKey = (key: string): { action: PermissionAction; resource: PermissionResource } | null => {
  const [action, resource] = key.split(":");
  if (!action || !resource) return null;
  return {
    action: action as PermissionAction,
    resource: resource as PermissionResource,
  };
};
