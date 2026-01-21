import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@radas/config/contexts/auth-context";
import * as notificationServices from "../services";
import type {
  NotificationProviderConfig,
  CreateProviderConfigDto,
  UpdateProviderConfigDto,
} from "../entity";

// ============ useProviderConfigs Hook ============

export function useProviderConfigs(projectId?: string) {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<NotificationProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const fetchConfigs = async () => {
      setLoading(true);
      const result = await notificationServices.getProviderConfigs(
        user.uid,
        projectId
      );

      if (result.success && result.data) {
        setConfigs(result.data);
        setError(null);
      } else {
        setError(result.error || "Failed to load provider configs");
      }

      setLoading(false);
    };

    fetchConfigs();

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchConfigs, 30000);

    return () => clearInterval(interval);
  }, [user?.uid, projectId]);

  return { configs, loading, error };
}

// ============ useProviderMutations Hook ============

export function useProviderMutations() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const create = useCallback(
    async (data: Omit<CreateProviderConfigDto, "userId">) => {
      if (!user?.uid) {
        return { success: false, error: "User not authenticated" };
      }

      setLoading(true);
      const result = await notificationServices.createProviderConfig({
        ...data,
        userId: user.uid,
      });
      setLoading(false);
      return result;
    },
    [user?.uid]
  );

  const update = useCallback(
    async (id: string, data: UpdateProviderConfigDto) => {
      setLoading(true);
      const result = await notificationServices.updateProviderConfig(id, data);
      setLoading(false);
      return result;
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    const result = await notificationServices.deleteProviderConfig(id);
    setLoading(false);
    return result;
  }, []);

  return { create, update, remove, loading };
}
