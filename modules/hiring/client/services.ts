import {
  createDocument,
  updateDocument,
  deleteDocument,
  subscribeToCollection,
  type Unsubscribe,
} from "@radas/config/lib/firebase/firestore";
import type {
  JobPosition,
  JobApplication,
  Interview,
  CreateJobPositionDto,
  UpdateJobPositionDto,
  CreateJobApplicationDto,
  UpdateJobApplicationDto,
  CreateInterviewDto,
  UpdateInterviewDto,
} from "./entity";
import { JobStatus, ApplicationStatus, ApplicationStage, InterviewStatus } from "./entity";

interface JobPositionCreate extends JobPosition {
  createdBy: string;
}

interface JobApplicationCreate extends JobApplication {
  status: string;
  stage: string;
}

interface InterviewCreate extends Interview {
  status: string;
}

// Collections
const JOB_POSITIONS_COLLECTION = "job_positions";
const JOB_APPLICATIONS_COLLECTION = "job_applications";
const INTERVIEWS_COLLECTION = "interviews";

// ============ Job Positions CRUD ============

export const createJobPosition = async (userId: string, data: CreateJobPositionDto) => {
  return await createDocument<JobPositionCreate>(JOB_POSITIONS_COLLECTION, {
    ...data,
    status: JobStatus.DRAFT,
    createdBy: userId,
  });
};

export const updateJobPosition = async (positionId: string, data: UpdateJobPositionDto) => {
  return await updateDocument(JOB_POSITIONS_COLLECTION, positionId, data);
};

export const deleteJobPosition = async (positionId: string) => {
  return await deleteDocument(JOB_POSITIONS_COLLECTION, positionId);
};

export const subscribeToWorkspaceJobPositions = (
  workspaceId: string,
  callback: (positions: JobPosition[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<JobPosition>(
    JOB_POSITIONS_COLLECTION,
    [
      {
        field: "workspaceId",
        operator: "==",
        value: workspaceId,
      },
    ],
    callback,
    [{ field: "createdAt", direction: "desc" }]
  );
};

// ============ Job Applications CRUD ============

export const createJobApplication = async (data: CreateJobApplicationDto) => {
  return await createDocument<JobApplicationCreate>(JOB_APPLICATIONS_COLLECTION, {
    ...data,
    status: ApplicationStatus.NEW,
    stage: ApplicationStage.APPLICATION,
  });
};

export const updateJobApplication = async (applicationId: string, data: UpdateJobApplicationDto) => {
  return await updateDocument(JOB_APPLICATIONS_COLLECTION, applicationId, data);
};

export const deleteJobApplication = async (applicationId: string) => {
  return await deleteDocument(JOB_APPLICATIONS_COLLECTION, applicationId);
};

export const subscribeToJobApplications = (
  jobPositionId: string,
  callback: (applications: JobApplication[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<JobApplication>(
    JOB_APPLICATIONS_COLLECTION,
    [
      {
        field: "jobPositionId",
        operator: "==",
        value: jobPositionId,
      },
    ],
    callback,
    [{ field: "appliedAt", direction: "desc" }]
  );
};

export const subscribeToWorkspaceApplications = (
  workspaceId: string,
  callback: (applications: JobApplication[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<JobApplication>(
    JOB_APPLICATIONS_COLLECTION,
    [
      {
        field: "workspaceId",
        operator: "==",
        value: workspaceId,
      },
    ],
    callback,
    [{ field: "appliedAt", direction: "desc" }]
  );
};

// ============ Interviews CRUD ============

export const createInterview = async (data: CreateInterviewDto) => {
  return await createDocument<InterviewCreate>(INTERVIEWS_COLLECTION, {
    ...data,
    status: InterviewStatus.SCHEDULED,
  });
};

export const updateInterview = async (interviewId: string, data: UpdateInterviewDto) => {
  return await updateDocument(INTERVIEWS_COLLECTION, interviewId, data);
};

export const deleteInterview = async (interviewId: string) => {
  return await deleteDocument(INTERVIEWS_COLLECTION, interviewId);
};

export const subscribeToApplicationInterviews = (
  applicationId: string,
  callback: (interviews: Interview[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Interview>(
    INTERVIEWS_COLLECTION,
    [
      {
        field: "applicationId",
        operator: "==",
        value: applicationId,
      },
    ],
    callback,
    [{ field: "scheduledAt", direction: "asc" }]
  );
};

export const subscribeToWorkspaceInterviews = (
  workspaceId: string,
  callback: (interviews: Interview[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Interview>(
    INTERVIEWS_COLLECTION,
    [
      {
        field: "workspaceId",
        operator: "==",
        value: workspaceId,
      },
    ],
    callback,
    [{ field: "scheduledAt", direction: "asc" }]
  );
};
