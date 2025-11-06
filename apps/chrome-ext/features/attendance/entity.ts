import type { Timestamp } from "firebase/firestore";

// Attendance Record
export interface AttendanceRecord {
  id: string;
  userId: string;
  workspaceId: string;
  date: Timestamp;
  checkIn?: Timestamp;
  checkOut?: Timestamp;
  status: AttendanceStatus;
  type: AttendanceType;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  notes?: string;
  approvedBy?: string;
  approvedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum AttendanceStatus {
  PRESENT = "present",
  ABSENT = "absent",
  LATE = "late",
  HALF_DAY = "half_day",
  LEAVE = "leave",
  HOLIDAY = "holiday",
  WEEKEND = "weekend",
}

export enum AttendanceType {
  WORK_FROM_OFFICE = "work_from_office",
  WORK_FROM_HOME = "work_from_home",
  FIELD_WORK = "field_work",
  BUSINESS_TRIP = "business_trip",
}

// Leave Request
export interface LeaveRequest {
  id: string;
  userId: string;
  workspaceId: string;
  leaveType: LeaveType;
  startDate: Timestamp;
  endDate: Timestamp;
  days: number;
  reason: string;
  status: LeaveStatus;
  approvedBy?: string;
  approvedAt?: Timestamp;
  rejectionReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum LeaveType {
  ANNUAL = "annual",
  SICK = "sick",
  EMERGENCY = "emergency",
  UNPAID = "unpaid",
  MATERNITY = "maternity",
  PATERNITY = "paternity",
  BEREAVEMENT = "bereavement",
  OTHER = "other",
}

export enum LeaveStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}

// Leave Balance
export interface LeaveBalance {
  id: string;
  userId: string;
  workspaceId: string;
  year: number;
  leaveType: LeaveType;
  total: number;
  used: number;
  remaining: number;
  updatedAt: Timestamp;
}

// Work Schedule
export interface WorkSchedule {
  id: string;
  userId: string;
  workspaceId: string;
  dayOfWeek: number; // 0-6 (Sunday to Saturday)
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  isWorkingDay: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// DTOs
export interface CreateAttendanceDto {
  userId: string;
  workspaceId: string;
  date: Timestamp;
  checkIn?: Timestamp;
  type: AttendanceType;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  notes?: string;
}

export interface UpdateAttendanceDto {
  checkOut?: Timestamp;
  status?: AttendanceStatus;
  notes?: string;
  approvedBy?: string;
}

export interface CreateLeaveRequestDto {
  userId: string;
  workspaceId: string;
  leaveType: LeaveType;
  startDate: Timestamp;
  endDate: Timestamp;
  days: number;
  reason: string;
}

export interface UpdateLeaveRequestDto {
  status?: LeaveStatus;
  approvedBy?: string;
  rejectionReason?: string;
}

export interface CreateWorkScheduleDto {
  userId: string;
  workspaceId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isWorkingDay: boolean;
}

export interface UpdateWorkScheduleDto {
  startTime?: string;
  endTime?: string;
  isWorkingDay?: boolean;
}
