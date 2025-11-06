import type { Timestamp } from "firebase/firestore";

// Company Information
export interface CompanyInfo {
  id: string;
  workspaceId: string;
  name: string;
  legalName?: string;
  logo?: string;
  website?: string;
  email?: string;
  phone?: string;
  industry?: string;
  size?: CompanySize;
  founded?: Timestamp;
  description?: string;
  mission?: string;
  vision?: string;
  values?: string[];
  address?: Address;
  socialMedia?: SocialMedia;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum CompanySize {
  STARTUP = "startup",
  SMALL = "small",
  MEDIUM = "medium",
  LARGE = "large",
  ENTERPRISE = "enterprise",
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface SocialMedia {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
}

// Department
export interface Department {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  headId?: string; // User ID of department head
  parentDepartmentId?: string;
  email?: string;
  phone?: string;
  location?: string;
  budget?: number;
  employeeCount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Office Location
export interface OfficeLocation {
  id: string;
  workspaceId: string;
  name: string;
  type: OfficeType;
  address: Address;
  phone?: string;
  email?: string;
  capacity?: number;
  amenities?: string[];
  workingHours?: WorkingHours;
  isHeadquarters?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum OfficeType {
  HEADQUARTERS = "headquarters",
  BRANCH = "branch",
  REMOTE = "remote",
  CO_WORKING = "co_working",
}

export interface WorkingHours {
  monday?: TimeRange;
  tuesday?: TimeRange;
  wednesday?: TimeRange;
  thursday?: TimeRange;
  friday?: TimeRange;
  saturday?: TimeRange;
  sunday?: TimeRange;
}

export interface TimeRange {
  start: string; // HH:mm format
  end: string; // HH:mm format
}

// Company Policy
export interface CompanyPolicy {
  id: string;
  workspaceId: string;
  title: string;
  category: PolicyCategory;
  content: string;
  version: string;
  effectiveDate: Timestamp;
  expiryDate?: Timestamp;
  approvedBy?: string;
  approvedAt?: Timestamp;
  status: PolicyStatus;
  attachments?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum PolicyCategory {
  HR = "hr",
  IT = "it",
  SECURITY = "security",
  FINANCE = "finance",
  COMPLIANCE = "compliance",
  OPERATIONS = "operations",
  OTHER = "other",
}

export enum PolicyStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  EXPIRED = "expired",
  ARCHIVED = "archived",
}

// Company Announcement
export interface CompanyAnnouncement {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  author: string;
  targetAudience?: string[]; // department IDs or "all"
  publishedAt?: Timestamp;
  expiresAt?: Timestamp;
  isPinned: boolean;
  attachments?: string[];
  viewCount: number;
  status: AnnouncementStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum AnnouncementCategory {
  GENERAL = "general",
  EVENT = "event",
  POLICY = "policy",
  CELEBRATION = "celebration",
  EMERGENCY = "emergency",
  MAINTENANCE = "maintenance",
}

export enum AnnouncementPriority {
  LOW = "low",
  NORMAL = "normal",
  HIGH = "high",
  URGENT = "urgent",
}

export enum AnnouncementStatus {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived",
}

// DTOs
export interface UpdateCompanyInfoDto {
  name?: string;
  legalName?: string;
  logo?: string;
  website?: string;
  email?: string;
  phone?: string;
  industry?: string;
  size?: CompanySize;
  founded?: Timestamp;
  description?: string;
  mission?: string;
  vision?: string;
  values?: string[];
  address?: Address;
  socialMedia?: SocialMedia;
}

export interface CreateDepartmentDto {
  workspaceId: string;
  name: string;
  description?: string;
  headId?: string;
  parentDepartmentId?: string;
  email?: string;
  phone?: string;
  location?: string;
}

export interface UpdateDepartmentDto {
  name?: string;
  description?: string;
  headId?: string;
  parentDepartmentId?: string;
  email?: string;
  phone?: string;
  location?: string;
  budget?: number;
}

export interface CreateOfficeLocationDto {
  workspaceId: string;
  name: string;
  type: OfficeType;
  address: Address;
  phone?: string;
  email?: string;
  capacity?: number;
  amenities?: string[];
  workingHours?: WorkingHours;
  isHeadquarters?: boolean;
}

export interface UpdateOfficeLocationDto {
  name?: string;
  type?: OfficeType;
  address?: Address;
  phone?: string;
  email?: string;
  capacity?: number;
  amenities?: string[];
  workingHours?: WorkingHours;
  isHeadquarters?: boolean;
}

export interface CreateCompanyPolicyDto {
  workspaceId: string;
  title: string;
  category: PolicyCategory;
  content: string;
  version: string;
  effectiveDate: Timestamp;
  expiryDate?: Timestamp;
  attachments?: string[];
}

export interface UpdateCompanyPolicyDto {
  title?: string;
  category?: PolicyCategory;
  content?: string;
  version?: string;
  effectiveDate?: Timestamp;
  expiryDate?: Timestamp;
  status?: PolicyStatus;
  attachments?: string[];
}

export interface CreateCompanyAnnouncementDto {
  workspaceId: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  priority?: AnnouncementPriority;
  author: string;
  targetAudience?: string[];
  publishedAt?: Timestamp;
  expiresAt?: Timestamp;
  isPinned?: boolean;
  attachments?: string[];
}

export interface UpdateCompanyAnnouncementDto {
  title?: string;
  content?: string;
  category?: AnnouncementCategory;
  priority?: AnnouncementPriority;
  targetAudience?: string[];
  publishedAt?: Timestamp;
  expiresAt?: Timestamp;
  isPinned?: boolean;
  status?: AnnouncementStatus;
  attachments?: string[];
}
