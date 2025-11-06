import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/shared/contexts/auth-context";
import { useCurrentWorkspace } from "@/features/workspaces/hooks";
import {
  createJobPosition,
  updateJobPosition,
  deleteJobPosition,
  subscribeToWorkspaceJobPositions,
  createJobApplication,
  updateJobApplication,
  deleteJobApplication,
  subscribeToJobApplications,
  subscribeToWorkspaceApplications,
  createInterview,
  updateInterview,
  deleteInterview,
  subscribeToApplicationInterviews,
  subscribeToWorkspaceInterviews,
} from "./services";
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

// ============ Job Positions Hooks ============

export const useJobPositions = (realtime = true) => {
  const { workspace } = useCurrentWorkspace();
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!workspace?.id) {
      setPositions([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      const unsubscribe = subscribeToWorkspaceJobPositions(workspace.id, (data, err) => {
        if (err) {
          setError(err);
          setPositions([]);
        } else {
          setPositions(data);
          setError(null);
        }
        setLoading(false);
      });

      unsubscribeRef.current = unsubscribe;

      return () => {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }
      };
    }
  }, [workspace?.id, realtime]);

  return { positions, loading, error };
};

export const useJobPositionMutations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(
    async (data: CreateJobPositionDto) => {
      if (!user) throw new Error("User not authenticated");

      setLoading(true);
      setError(null);

      const result = await createJobPosition(user.uid, data);
      setLoading(false);

      if (!result.success) {
        setError(result.error as Error);
      }

      return result;
    },
    [user]
  );

  const update = useCallback(async (positionId: string, data: UpdateJobPositionDto) => {
    setLoading(true);
    setError(null);

    const result = await updateJobPosition(positionId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (positionId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteJobPosition(positionId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Job Applications Hooks ============

export const useJobApplications = (jobPositionId?: string, realtime = true) => {
  const { workspace } = useCurrentWorkspace();
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (realtime) {
      let unsubscribe: (() => void) | null = null;

      if (jobPositionId) {
        unsubscribe = subscribeToJobApplications(jobPositionId, (data, err) => {
          if (err) {
            setError(err);
            setApplications([]);
          } else {
            setApplications(data);
            setError(null);
          }
          setLoading(false);
        });
      } else if (workspace?.id) {
        unsubscribe = subscribeToWorkspaceApplications(workspace.id, (data, err) => {
          if (err) {
            setError(err);
            setApplications([]);
          } else {
            setApplications(data);
            setError(null);
          }
          setLoading(false);
        });
      } else {
        setApplications([]);
        setLoading(false);
      }

      unsubscribeRef.current = unsubscribe;

      return () => {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }
      };
    }
  }, [jobPositionId, workspace?.id, realtime]);

  return { applications, loading, error };
};

export const useJobApplicationMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (data: CreateJobApplicationDto) => {
    setLoading(true);
    setError(null);

    const result = await createJobApplication(data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const update = useCallback(async (applicationId: string, data: UpdateJobApplicationDto) => {
    setLoading(true);
    setError(null);

    const result = await updateJobApplication(applicationId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (applicationId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteJobApplication(applicationId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};

// ============ Interviews Hooks ============

export const useInterviews = (applicationId?: string, realtime = true) => {
  const { workspace } = useCurrentWorkspace();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (realtime) {
      let unsubscribe: (() => void) | null = null;

      if (applicationId) {
        unsubscribe = subscribeToApplicationInterviews(applicationId, (data, err) => {
          if (err) {
            setError(err);
            setInterviews([]);
          } else {
            setInterviews(data);
            setError(null);
          }
          setLoading(false);
        });
      } else if (workspace?.id) {
        unsubscribe = subscribeToWorkspaceInterviews(workspace.id, (data, err) => {
          if (err) {
            setError(err);
            setInterviews([]);
          } else {
            setInterviews(data);
            setError(null);
          }
          setLoading(false);
        });
      } else {
        setInterviews([]);
        setLoading(false);
      }

      unsubscribeRef.current = unsubscribe;

      return () => {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }
      };
    }
  }, [applicationId, workspace?.id, realtime]);

  return { interviews, loading, error };
};

export const useInterviewMutations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (data: CreateInterviewDto) => {
    setLoading(true);
    setError(null);

    const result = await createInterview(data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const update = useCallback(async (interviewId: string, data: UpdateInterviewDto) => {
    setLoading(true);
    setError(null);

    const result = await updateInterview(interviewId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (interviewId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteInterview(interviewId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return { create, update, remove, loading, error };
};
