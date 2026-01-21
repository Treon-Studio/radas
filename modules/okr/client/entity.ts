import type { Timestamp } from "firebase/firestore";

// Objective
export interface Objective {
  id: string;
  workspaceId: string;
  parentId?: string; // For cascading OKRs
  title: string;
  description?: string;
  owner: string;
  contributors?: string[];
  team?: string;
  department?: string;
  period: OKRPeriod;
  startDate: Timestamp;
  endDate: Timestamp;
  status: OKRStatus;
  progress: number; // 0-100
  priority: OKRPriority;
  tags?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum OKRPeriod {
  QUARTERLY = "quarterly",
  HALF_YEARLY = "half_yearly",
  YEARLY = "yearly",
  CUSTOM = "custom",
}

export enum OKRStatus {
  NOT_STARTED = "not_started",
  ON_TRACK = "on_track",
  AT_RISK = "at_risk",
  BEHIND = "behind",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export enum OKRPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

// Key Result
export interface KeyResult {
  id: string;
  objectiveId: string;
  workspaceId: string;
  title: string;
  description?: string;
  owner: string;
  type: KeyResultType;
  targetValue: number;
  currentValue: number;
  unit: string;
  startValue?: number;
  progress: number; // 0-100
  status: OKRStatus;
  dueDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum KeyResultType {
  NUMBER = "number",
  PERCENTAGE = "percentage",
  CURRENCY = "currency",
  BOOLEAN = "boolean",
}

// OKR Check-in
export interface OKRCheckIn {
  id: string;
  objectiveId?: string;
  keyResultId?: string;
  workspaceId: string;
  userId: string;
  currentValue?: number;
  progress: number;
  confidence: ConfidenceLevel;
  notes?: string;
  challenges?: string;
  nextActions?: string;
  createdAt: Timestamp;
}

export enum ConfidenceLevel {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

// OKR Alignment
export interface OKRAlignment {
  id: string;
  childObjectiveId: string;
  parentObjectiveId: string;
  workspaceId: string;
  alignmentType: AlignmentType;
  createdAt: Timestamp;
}

export enum AlignmentType {
  SUPPORTS = "supports",
  CONTRIBUTES_TO = "contributes_to",
  DEPENDS_ON = "depends_on",
}

// DTOs
export interface CreateObjectiveDto {
  workspaceId: string;
  parentId?: string;
  title: string;
  description?: string;
  owner: string;
  contributors?: string[];
  team?: string;
  department?: string;
  period: OKRPeriod;
  startDate: Timestamp;
  endDate: Timestamp;
  priority?: OKRPriority;
  tags?: string[];
}

export interface UpdateObjectiveDto {
  title?: string;
  description?: string;
  owner?: string;
  contributors?: string[];
  team?: string;
  department?: string;
  period?: OKRPeriod;
  startDate?: Timestamp;
  endDate?: Timestamp;
  status?: OKRStatus;
  priority?: OKRPriority;
  tags?: string[];
}

export interface CreateKeyResultDto {
  objectiveId: string;
  workspaceId: string;
  title: string;
  description?: string;
  owner: string;
  type: KeyResultType;
  targetValue: number;
  currentValue: number;
  unit: string;
  startValue?: number;
  dueDate?: Timestamp;
}

export interface UpdateKeyResultDto {
  title?: string;
  description?: string;
  owner?: string;
  type?: KeyResultType;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  startValue?: number;
  status?: OKRStatus;
  dueDate?: Timestamp;
}

export interface CreateOKRCheckInDto {
  objectiveId?: string;
  keyResultId?: string;
  workspaceId: string;
  userId: string;
  currentValue?: number;
  progress: number;
  confidence: ConfidenceLevel;
  notes?: string;
  challenges?: string;
  nextActions?: string;
}

export interface CreateOKRAlignmentDto {
  childObjectiveId: string;
  parentObjectiveId: string;
  workspaceId: string;
  alignmentType: AlignmentType;
}
