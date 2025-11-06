import type { Timestamp } from "firebase/firestore";

// Drive File
export interface DriveFile {
  id: string;
  workspaceId: string;
  folderId?: string;
  name: string;
  type: FileType;
  mimeType: string;
  size: number; // in bytes
  url: string;
  thumbnailUrl?: string;
  description?: string;
  tags?: string[];
  owner: string;
  sharedWith?: FilePermission[];
  visibility: FileVisibility;
  status: FileStatus;
  version: number;
  downloadCount: number;
  viewCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt?: Timestamp;
}

export enum FileType {
  DOCUMENT = "document",
  SPREADSHEET = "spreadsheet",
  PRESENTATION = "presentation",
  PDF = "pdf",
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  ARCHIVE = "archive",
  CODE = "code",
  OTHER = "other",
}

export enum FileVisibility {
  PRIVATE = "private",
  WORKSPACE = "workspace",
  PUBLIC = "public",
}

export enum FileStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
  DELETED = "deleted",
}

// Drive Folder
export interface DriveFolder {
  id: string;
  workspaceId: string;
  parentId?: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  owner: string;
  sharedWith?: FilePermission[];
  visibility: FileVisibility;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// File Permission
export interface FilePermission {
  userId: string;
  permission: PermissionLevel;
  grantedBy: string;
  grantedAt: Timestamp;
}

export enum PermissionLevel {
  VIEWER = "viewer",
  COMMENTER = "commenter",
  EDITOR = "editor",
  OWNER = "owner",
}

// File Version
export interface FileVersion {
  id: string;
  fileId: string;
  version: number;
  url: string;
  size: number;
  uploadedBy: string;
  changes?: string;
  createdAt: Timestamp;
}

// File Comment
export interface FileComment {
  id: string;
  fileId: string;
  userId: string;
  content: string;
  mentions?: string[];
  resolved: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// DTOs
export interface CreateDriveFileDto {
  workspaceId: string;
  folderId?: string;
  name: string;
  type: FileType;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  description?: string;
  tags?: string[];
  visibility?: FileVisibility;
}

export interface UpdateDriveFileDto {
  folderId?: string;
  name?: string;
  description?: string;
  tags?: string[];
  visibility?: FileVisibility;
  status?: FileStatus;
}

export interface CreateDriveFolderDto {
  workspaceId: string;
  parentId?: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  visibility?: FileVisibility;
  order?: number;
}

export interface UpdateDriveFolderDto {
  parentId?: string;
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  visibility?: FileVisibility;
  order?: number;
}

export interface ShareFileDto {
  fileId: string;
  userId: string;
  permission: PermissionLevel;
}

export interface CreateFileCommentDto {
  fileId: string;
  userId: string;
  content: string;
  mentions?: string[];
}

export interface UpdateFileCommentDto {
  content?: string;
  resolved?: boolean;
}
