import type { Timestamp } from "firebase/firestore";

// Link entity
export interface Link {
  id: string;
  title: string;
  url: string;
  description?: string;
  categoryId?: string; // Reference to category
  tags?: string[];
  favicon?: string;
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isFavorite?: boolean;
  visitCount?: number;
  lastVisited?: Timestamp;
}

// Category entity with nested support
export interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null; // null for root categories
  userId: string;
  color?: string;
  icon?: string;
  order?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Helper type for category with children
export interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
  linkCount?: number;
}

// DTOs for forms
export interface CreateLinkDto {
  title: string;
  url: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  isFavorite?: boolean;
}

export interface UpdateLinkDto {
  title?: string;
  url?: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  isFavorite?: boolean;
}

export interface CreateCategoryDto {
  name: string;
  description?: string;
  parentId?: string | null;
  color?: string;
  icon?: string;
  order?: number;
}

export interface UpdateCategoryDto {
  name?: string;
  description?: string;
  parentId?: string | null;
  color?: string;
  icon?: string;
  order?: number;
}

// Filter and sort options
export interface LinkFilters {
  categoryId?: string;
  isFavorite?: boolean;
  tags?: string[];
  searchQuery?: string;
}

export type LinkSortBy = "createdAt" | "updatedAt" | "title" | "visitCount";
export type SortDirection = "asc" | "desc";
