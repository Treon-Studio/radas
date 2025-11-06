import type { Timestamp } from "firebase/firestore";

// Wiki Article
export interface WikiArticle {
  id: string;
  workspaceId: string;
  categoryId?: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  coverImage?: string;
  tags?: string[];
  author: string;
  contributors?: string[];
  viewCount: number;
  upvotes: number;
  downvotes: number;
  status: WikiArticleStatus;
  visibility: WikiVisibility;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
}

export enum WikiArticleStatus {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived",
}

export enum WikiVisibility {
  PUBLIC = "public",
  WORKSPACE = "workspace",
  PRIVATE = "private",
}

// Wiki Category
export interface WikiCategory {
  id: string;
  workspaceId: string;
  parentId?: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// FAQ
export interface FAQ {
  id: string;
  workspaceId: string;
  categoryId?: string;
  question: string;
  answer: string;
  tags?: string[];
  viewCount: number;
  helpful: number;
  notHelpful: number;
  order: number;
  status: FAQStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum FAQStatus {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived",
}

// Help Request
export interface HelpRequest {
  id: string;
  workspaceId: string;
  userId: string;
  categoryId?: string;
  subject: string;
  description: string;
  priority: HelpPriority;
  status: HelpStatus;
  assignedTo?: string;
  attachments?: string[];
  responses?: HelpResponse[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  resolvedAt?: Timestamp;
}

export interface HelpResponse {
  id: string;
  userId: string;
  message: string;
  attachments?: string[];
  createdAt: Timestamp;
}

export enum HelpPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent",
}

export enum HelpStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  WAITING_RESPONSE = "waiting_response",
  RESOLVED = "resolved",
  CLOSED = "closed",
}

// DTOs
export interface CreateWikiArticleDto {
  workspaceId: string;
  categoryId?: string;
  title: string;
  content: string;
  excerpt?: string;
  coverImage?: string;
  tags?: string[];
  visibility?: WikiVisibility;
}

export interface UpdateWikiArticleDto {
  categoryId?: string;
  title?: string;
  content?: string;
  excerpt?: string;
  coverImage?: string;
  tags?: string[];
  status?: WikiArticleStatus;
  visibility?: WikiVisibility;
  order?: number;
}

export interface CreateWikiCategoryDto {
  workspaceId: string;
  parentId?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  order?: number;
}

export interface UpdateWikiCategoryDto {
  parentId?: string;
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  order?: number;
}

export interface CreateFAQDto {
  workspaceId: string;
  categoryId?: string;
  question: string;
  answer: string;
  tags?: string[];
  order?: number;
}

export interface UpdateFAQDto {
  categoryId?: string;
  question?: string;
  answer?: string;
  tags?: string[];
  status?: FAQStatus;
  order?: number;
}

export interface CreateHelpRequestDto {
  workspaceId: string;
  userId: string;
  categoryId?: string;
  subject: string;
  description: string;
  priority: HelpPriority;
  attachments?: string[];
}

export interface UpdateHelpRequestDto {
  status?: HelpStatus;
  assignedTo?: string;
}
