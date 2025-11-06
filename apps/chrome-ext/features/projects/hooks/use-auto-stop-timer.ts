import { useEffect, useRef } from "react";
import { useAuth } from "@/shared/contexts/auth-context";
import { useTimer } from "../contexts/timer-context";
import type { Task } from "../entity";
import { toast } from "sonner";

/**
 * Hook to automatically stop timer when task assignee changes
 */
export function useAutoStopTimer(tasks: Task[]) {
  const { user } = useAuth();
  const { stopTimer, isTimerActive } = useTimer();
  const previousAssignees = useRef<Map<string, string | undefined>>(new Map());

  useEffect(() => {
    if (!user) return;

    tasks.forEach((task) => {
      const currentAssignee = task.assigneeId;
      const previousAssignee = previousAssignees.current.get(task.id);

      // Check if assignee changed and timer is running
      if (
        previousAssignee !== undefined &&
        previousAssignee !== currentAssignee &&
        isTimerActive(task.id)
      ) {
        // If task was assigned to current user but now reassigned to someone else
        if (previousAssignee === user.uid && currentAssignee !== user.uid) {
          stopTimer(task.id, "Task reassigned - timer auto-stopped");
          toast.warning("Timer stopped: Task was reassigned to someone else", {
            duration: 5000,
          });
        }
      }

      // Update tracking
      previousAssignees.current.set(task.id, currentAssignee);
    });
  }, [tasks, user, stopTimer, isTimerActive]);
}
