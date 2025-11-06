import { useState, useEffect } from "react";
import {
  getTaskHistory,
  subscribeToTaskHistory,
} from "../services/task-history.service";
import type { TaskHistoryEvent } from "../entities/task-history.entity";

export function useTaskHistory(taskId: string | null, realtime = true) {
  const [history, setHistory] = useState<TaskHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!taskId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      // Subscribe to real-time updates
      const unsubscribe = subscribeToTaskHistory(taskId, (data, err) => {
        if (err) {
          setError(err);
        } else {
          setHistory(data);
        }
        setLoading(false);
      });

      return () => unsubscribe();
    } else {
      // One-time fetch
      const fetchHistory = async () => {
        try {
          const data = await getTaskHistory(taskId);
          setHistory(data);
        } catch (err) {
          setError(err as Error);
        } finally {
          setLoading(false);
        }
      };

      fetchHistory();
    }
  }, [taskId, realtime]);

  return { history, loading, error };
}
