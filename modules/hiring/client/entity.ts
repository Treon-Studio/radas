import type { Timestamp } from "firebase/firestore";

// Job Position
export interface JobPosition {
  id: string;
  workspaceId: string;
  title: string;
  department: string;
  location: string;
  type: JobType;
  description?: string;
  requirements?: string[];
  responsibilities?: string[];
  salaryRange?: {
    min: number;
    max: number;
    currency: string;
  };
  status: JobStatus;
  openings: number;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum JobType {
  FULL_TIME = "full_time",
  PART_TIME = "part_time",
  CONTRACT = "contract",
  INTERNSHIP = "internship",
  FREELANCE = "freelance",
}

export enum JobStatus {
  DRAFT = "draft",
  OPEN = "open",
  CLOSED = "closed",
  ON_HOLD = "on_hold",
}

// Job Application
export interface JobApplication {
  id: string;
  jobPositionId: string;
  workspaceId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  resumeUrl?: string;
  coverLetter?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  status: ApplicationStatus;
  stage: ApplicationStage;
  rating?: number;
  notes?: string;
  appliedAt: Timestamp;
  updatedAt: Timestamp;
}

export enum ApplicationStatus {
  NEW = "new",
  REVIEWING = "reviewing",
  SHORTLISTED = "shortlisted",
  REJECTED = "rejected",
  HIRED = "hired",
  WITHDRAWN = "withdrawn",
}

export enum ApplicationStage {
  APPLICATION = "application",
  SCREENING = "screening",
  INTERVIEW = "interview",
  TECHNICAL_TEST = "technical_test",
  FINAL_INTERVIEW = "final_interview",
  OFFER = "offer",
  ONBOARDING = "onboarding",
}

// Interview
export interface Interview {
  id: string;
  applicationId: string;
  jobPositionId: string;
  workspaceId: string;
  title: string;
  interviewers: string[]; // user IDs
  scheduledAt: Timestamp;
  duration: number; // in minutes
  location?: string;
  meetingLink?: string;
  type: InterviewType;
  status: InterviewStatus;
  feedback?: string;
  rating?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum InterviewType {
  PHONE_SCREENING = "phone_screening",
  VIDEO = "video",
  IN_PERSON = "in_person",
  TECHNICAL = "technical",
  BEHAVIORAL = "behavioral",
  FINAL = "final",
}

export enum InterviewStatus {
  SCHEDULED = "scheduled",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  RESCHEDULED = "rescheduled",
  NO_SHOW = "no_show",
}

// DTOs
export interface CreateJobPositionDto {
  workspaceId: string;
  title: string;
  department: string;
  location: string;
  type: JobType;
  description?: string;
  requirements?: string[];
  responsibilities?: string[];
  salaryRange?: {
    min: number;
    max: number;
    currency: string;
  };
  openings: number;
}

export interface UpdateJobPositionDto {
  title?: string;
  department?: string;
  location?: string;
  type?: JobType;
  description?: string;
  requirements?: string[];
  responsibilities?: string[];
  salaryRange?: {
    min: number;
    max: number;
    currency: string;
  };
  status?: JobStatus;
  openings?: number;
}

export interface CreateJobApplicationDto {
  jobPositionId: string;
  workspaceId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  resumeUrl?: string;
  coverLetter?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
}

export interface UpdateJobApplicationDto {
  status?: ApplicationStatus;
  stage?: ApplicationStage;
  rating?: number;
  notes?: string;
}

export interface CreateInterviewDto {
  applicationId: string;
  jobPositionId: string;
  workspaceId: string;
  title: string;
  interviewers: string[];
  scheduledAt: Timestamp;
  duration: number;
  location?: string;
  meetingLink?: string;
  type: InterviewType;
}

export interface UpdateInterviewDto {
  title?: string;
  interviewers?: string[];
  scheduledAt?: Timestamp;
  duration?: number;
  location?: string;
  meetingLink?: string;
  type?: InterviewType;
  status?: InterviewStatus;
  feedback?: string;
  rating?: number;
}
