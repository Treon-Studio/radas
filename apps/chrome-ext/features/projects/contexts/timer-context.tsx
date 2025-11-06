import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/shared/contexts/auth-context";
import { useCurrentUser } from "@/features/users/hooks";
import { useTimeEntryMutations, useTaskMutations } from "../hooks";
import { logTimeEntry } from "../services/task-history.service";
import type { CreateTimeEntryDto } from "../entity";
import { toast } from "sonner";
import { startTimerBadge, stopTimerBadge, pauseTimerBadge, resumeTimerBadge } from "@/shared/utils/extension-badge";

interface ActiveTimer {
  taskId: string;
  taskTitle: string;
  projectId: string;
  startTime: number; // timestamp
  pausedTime?: number; // total paused time in ms
  isPaused: boolean;
  description?: string;
}

interface TimerContextValue {
  activeTimers: Map<string, ActiveTimer>;
  startTimer: (taskId: string, taskTitle: string, projectId: string, description?: string) => void;
  pauseTimer: (taskId: string) => void;
  resumeTimer: (taskId: string) => void;
  stopTimer: (taskId: string, description?: string, newStatusId?: string) => Promise<void>;
  getElapsedTime: (taskId: string) => number; // in seconds
  isTimerActive: (taskId: string) => boolean;
  isTimerPaused: (taskId: string) => boolean;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export const useTimer = () => {
  const context = useContext(TimerContext);
  if (!context) {
    // During hot reload or if provider is not mounted, return a safe fallback
    if (import.meta.env.DEV) {
      console.warn("useTimer called outside TimerProvider, returning fallback");
    }
    return {
      activeTimers: new Map(),
      startTimer: () => {},
      pauseTimer: () => {},
      resumeTimer: () => {},
      stopTimer: async (_taskId: string, _description?: string, _newStatusId?: string) => {},
      getElapsedTime: () => 0,
      isTimerActive: () => false,
      isTimerPaused: () => false,
    } as TimerContextValue;
  }
  return context;
};

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { currentUser } = useCurrentUser();
  const [activeTimers, setActiveTimers] = useState<Map<string, ActiveTimer>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeEntryMutations = useTimeEntryMutations();
  const taskMutations = useTaskMutations();

  // Force re-render every second to update UI
  const [, setTick] = useState(0);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Load active timers from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("activeTimers");
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const timersMap = new Map<string, ActiveTimer>(Object.entries(data));
        setActiveTimers(timersMap);

        // Restore badge for the first active timer after state update
        setTimeout(() => {
          const timers = Array.from(timersMap.entries());
          if (timers.length > 0) {
            const [taskId, timer] = timers[0];

            // Create a function that calculates elapsed time from the timer data directly
            const getElapsed = () => {
              if (timer.isPaused) {
                return Math.floor((timer.pausedTime || 0) / 1000);
              }
              const elapsed = Date.now() - timer.startTime;
              return Math.floor(elapsed / 1000);
            };

            if (timer.isPaused) {
              pauseTimerBadge(getElapsed);
            } else {
              startTimerBadge(getElapsed);
            }
          }
        }, 100); // Increased delay to ensure state is fully updated
      } catch (e) {
        console.error("Failed to load active timers:", e);
      }
    }
  }, []);

  // Save active timers to localStorage
  useEffect(() => {
    const timersObj = Object.fromEntries(activeTimers);
    localStorage.setItem("activeTimers", JSON.stringify(timersObj));
  }, [activeTimers]);

  const startTimer = useCallback((taskId: string, taskTitle: string, projectId: string, description?: string) => {
    const startTime = Date.now();

    setActiveTimers((prev) => {
      const newMap = new Map(prev);
      newMap.set(taskId, {
        taskId,
        taskTitle,
        projectId,
        startTime,
        pausedTime: 0,
        isPaused: false,
        description,
      });
      return newMap;
    });

    // Start badge timer after state update completes
    setTimeout(() => {
      startTimerBadge(() => {
        const elapsed = Date.now() - startTime;
        return Math.floor(elapsed / 1000);
      });
    }, 100);

    toast.success("Timer started");
  }, []);

  const pauseTimer = useCallback((taskId: string) => {
    let pausedElapsedMs = 0;

    setActiveTimers((prev) => {
      const timer = prev.get(taskId);
      if (!timer || timer.isPaused) return prev;

      // Calculate elapsed time at pause moment
      pausedElapsedMs = Date.now() - timer.startTime;

      const newMap = new Map(prev);
      newMap.set(taskId, {
        ...timer,
        isPaused: true,
        pausedTime: pausedElapsedMs,
      });
      return newMap;
    });

    // Pause badge timer with frozen time
    setTimeout(() => {
      pauseTimerBadge(() => Math.floor(pausedElapsedMs / 1000));
    }, 100);

    toast.info("Timer paused");
  }, []);

  const resumeTimer = useCallback((taskId: string) => {
    let adjustedStartTime = Date.now();

    setActiveTimers((prev) => {
      const timer = prev.get(taskId);
      if (!timer || !timer.isPaused) return prev;

      // Adjust start time to account for paused duration
      adjustedStartTime = Date.now() - (timer.pausedTime || 0);

      const newMap = new Map(prev);
      newMap.set(taskId, {
        ...timer,
        isPaused: false,
        startTime: adjustedStartTime,
        pausedTime: 0,
      });
      return newMap;
    });

    // Resume badge timer with adjusted start time
    setTimeout(() => {
      resumeTimerBadge(() => {
        const elapsed = Date.now() - adjustedStartTime;
        return Math.floor(elapsed / 1000);
      });
    }, 100);

    toast.info("Timer resumed");
  }, []);

  const stopTimer = useCallback(async (taskId: string, description?: string, newStatusId?: string) => {
    const timer = activeTimers.get(taskId);
    if (!timer) return;

    const elapsedMs = timer.isPaused
      ? (timer.pausedTime || 0)
      : Date.now() - timer.startTime;

    // Convert total time to decimal hours (includes seconds)
    const totalHours = elapsedMs / (1000 * 60 * 60);

    // Calculate display values for toast message
    const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
    const minutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsedMs % (1000 * 60)) / 1000);

    // Save time entry with decimal hours (includes seconds precision)
    const timeEntryData: CreateTimeEntryDto = {
      taskId,
      projectId: timer.projectId,
      hours: totalHours,
      description: description || timer.description || "Time tracked",
      date: new Date(),
    };

    const result = await timeEntryMutations.create(timeEntryData);

    if (result.success) {
      // Update task status if provided
      if (newStatusId) {
        await taskMutations.update(taskId, { statusId: newStatusId });
      }

      setActiveTimers((prev) => {
        const newMap = new Map(prev);
        newMap.delete(taskId);
        return newMap;
      });

      // Stop badge timer
      stopTimerBadge();

      // Log time entry to task history
      if (user && currentUser) {
        const durationInSeconds = Math.floor(elapsedMs / 1000);
        await logTimeEntry(
          taskId,
          timer.projectId,
          user.uid,
          currentUser.displayName,
          durationInSeconds,
          currentUser.photoURL
        );
      }

      toast.success(`Time entry saved: ${hours}h ${minutes}m ${seconds}s`);
    } else {
      toast.error("Failed to save time entry");
    }
  }, [activeTimers, timeEntryMutations, taskMutations, user, currentUser]);

  const getElapsedTime = useCallback((taskId: string): number => {
    const timer = activeTimers.get(taskId);
    if (!timer) return 0;

    if (timer.isPaused) {
      return Math.floor((timer.pausedTime || 0) / 1000);
    }

    const elapsed = Date.now() - timer.startTime;
    return Math.floor(elapsed / 1000);
  }, [activeTimers]);

  const isTimerActive = useCallback((taskId: string): boolean => {
    return activeTimers.has(taskId);
  }, [activeTimers]);

  const isTimerPaused = useCallback((taskId: string): boolean => {
    const timer = activeTimers.get(taskId);
    return timer?.isPaused || false;
  }, [activeTimers]);

  const value: TimerContextValue = {
    activeTimers,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    getElapsedTime,
    isTimerActive,
    isTimerPaused,
  };

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}
