import type { Timestamp } from "firebase/firestore";

// ============ Workspace Entity ============

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  slug: string; // Unique URL-friendly identifier
  logo?: string;
  adminIds: string[]; // Array of user IDs who are admins
  memberIds: string[]; // Array of user IDs who are members
  settings?: WorkspaceSettings;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface WorkspaceSettings {
  allowMemberInvite?: boolean; // Allow members to invite others
  defaultRoleId?: string; // Default role for new members
  features?: {
    projects?: boolean;
    tasks?: boolean;
    epics?: boolean;
    pages?: boolean;
    documents?: boolean;
    links?: boolean;
    testCases?: boolean;
  };
}

// ============ Workspace Member ============

export type WorkspaceMemberRole = "admin" | "member";

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceMemberRole; // Workspace-level role (different from permission roles)
  joinedAt: Timestamp;
}

// ============ DTOs ============

export interface CreateWorkspaceDto {
  name: string;
  description?: string;
  slug: string;
  logo?: string;
  settings?: WorkspaceSettings;
}

export interface UpdateWorkspaceDto {
  name?: string;
  description?: string;
  slug?: string;
  logo?: string;
  settings?: WorkspaceSettings;
}

export interface AddWorkspaceMemberDto {
  userId: string;
  role: WorkspaceMemberRole;
}

// ============ Extended Types ============

export interface WorkspaceWithMembers extends Workspace {
  admins: Array<{ id: string; displayName: string; email: string }>;
  members: Array<{ id: string; displayName: string; email: string }>;
}
