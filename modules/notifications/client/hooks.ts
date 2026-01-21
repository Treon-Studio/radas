import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@radas/config/contexts/auth-context";
import * as notificationServices from "./services";
import {
  NotificationStatus,
  type Notification,
  type CreateNotificationDto,
  type UpdateNotificationDto,
  type NotificationFilter,
  type NotificationSettings,
  type UpdateNotificationSettingsDto,
} from "./entity";

// Export provider hooks
export * from "./hooks/use-provider-hooks";

// ============ useNotifications Hook ============

export function useNotifications(
  projectId?: string,
  filter?: NotificationFilter,
  options?: { enabled?: boolean; pollInterval?: number }
) {
  const { enabled = true, pollInterval } = options || {};
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track if component is mounted and subscription is active
  const isMounted = useRef(true);
  const unsubscribeRef = useRef<(() => void) | undefined>();

  // Build filter with user and project context - memoized to prevent re-subscriptions
  const effectiveFilter: NotificationFilter = useMemo(() => ({
    ...filter,
    userId: user?.uid,
    ...(projectId && { projectId }),
  }), [
    user?.uid,
    projectId,
    filter?.status,
    filter?.limit,
    filter?.read,
    filter?.type,
  ]);

  useEffect(() => {
    isMounted.current = true;

    // Don't subscribe if disabled or no user
    if (!enabled || !user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Use polling instead of real-time if pollInterval is set
    if (pollInterval) {
      const fetchData = async () => {
        if (!isMounted.current) return;

        try {
          const result = await notificationServices.getNotifications(effectiveFilter);
          if (isMounted.current && result.success && result.data) {
            setNotifications(result.data);
            setError(null);
          }
        } catch (err) {
          if (isMounted.current) {
            console.error("Error fetching notifications:", err);
            setError((err as Error).message);
          }
        } finally {
          if (isMounted.current) {
            setLoading(false);
          }
        }
      };

      // Initial fetch
      fetchData();

      // Poll at interval
      const intervalId = setInterval(fetchData, pollInterval);

      return () => {
        isMounted.current = false;
        clearInterval(intervalId);
      };
    }

    // Real-time subscription (default)
    try {
      unsubscribeRef.current = notificationServices.subscribeToNotifications(
        effectiveFilter,
        (data) => {
          if (isMounted.current) {
            setNotifications(data);
            setLoading(false);
            setError(null);
          }
        }
      );
    } catch (err) {
      console.error("Error subscribing to notifications:", err);
      if (isMounted.current) {
        setError((err as Error).message);
        setLoading(false);
      }
    }

    return () => {
      isMounted.current = false;
      if (unsubscribeRef.current) {
        try {
          unsubscribeRef.current();
          unsubscribeRef.current = undefined;
        } catch (err) {
          console.error("Error unsubscribing from notifications:", err);
        }
      }
    };
  }, [user?.uid, effectiveFilter, enabled, pollInterval]);

  return { notifications, loading, error };
}

// ============ useUnreadCount Hook ============

export function useUnreadCount(
  projectId?: string,
  options?: { enabled?: boolean; pollInterval?: number }
) {
  const { enabled = true, pollInterval = 30000 } = options || {}; // Default 30s polling
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);
  const unsubscribeRef = useRef<(() => void) | undefined>();

  // Memoize the filter to prevent unnecessary re-subscriptions
  const unreadFilter = useMemo(() => ({
    userId: user?.uid,
    ...(projectId && { projectId }),
    status: NotificationStatus.UNREAD,
  }), [user?.uid, projectId]);

  useEffect(() => {
    isMounted.current = true;

    if (!enabled || !user?.uid) {
      setLoading(false);
      return;
    }

    const fetchCount = async () => {
      if (!isMounted.current) return;

      setLoading(true);
      try {
        const result = projectId
          ? await notificationServices.getUnreadCount(user.uid, projectId)
          : await notificationServices.getUnreadCount(user.uid);
        if (isMounted.current && result.success && result.count !== undefined) {
          setCount(result.count);
        }
      } catch (err) {
        console.error("Error fetching unread count:", err);
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchCount();

    // Use polling instead of real-time subscription to reduce reads
    const intervalId = setInterval(fetchCount, pollInterval);

    return () => {
      isMounted.current = false;
      clearInterval(intervalId);
      if (unsubscribeRef.current) {
        try {
          unsubscribeRef.current();
          unsubscribeRef.current = undefined;
        } catch (err) {
          console.error("Error unsubscribing from unread count:", err);
        }
      }
    };
  }, [user?.uid, unreadFilter, enabled, pollInterval, projectId]);

  return { count, loading };
}

// ============ useNotificationMutations Hook ============

export function useNotificationMutations() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const create = useCallback(
    async (data: Omit<CreateNotificationDto, "userId">) => {
      if (!user?.uid) {
        return { success: false, error: "User not authenticated" };
      }

      setLoading(true);
      const result = await notificationServices.createNotification({
        ...data,
        userId: user.uid,
      });
      setLoading(false);
      return result;
    },
    [user?.uid]
  );

  const update = useCallback(
    async (id: string, data: UpdateNotificationDto) => {
      setLoading(true);
      const result = await notificationServices.updateNotification(id, data);
      setLoading(false);
      return result;
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    setLoading(true);
    const result = await notificationServices.deleteNotification(id);
    setLoading(false);
    return result;
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    setLoading(true);
    const result = await notificationServices.updateNotification(id, {
      status: NotificationStatus.READ,
      readAt: new Date(),
    });
    setLoading(false);
    return result;
  }, []);

  const markAsUnread = useCallback(async (id: string) => {
    setLoading(true);
    const result = await notificationServices.updateNotification(id, {
      status: NotificationStatus.UNREAD,
    });
    setLoading(false);
    return result;
  }, []);

  const archive = useCallback(async (id: string) => {
    setLoading(true);
    const result = await notificationServices.updateNotification(id, {
      status: NotificationStatus.ARCHIVED,
      archivedAt: new Date(),
    });
    setLoading(false);
    return result;
  }, []);

  const markAllAsRead = useCallback(async (projectId?: string) => {
    if (!user?.uid) {
      return { success: false, error: "User not authenticated" };
    }

    setLoading(true);
    const result = await notificationServices.markAllAsRead(
      user.uid,
      projectId
    );
    setLoading(false);
    return result;
  }, [user?.uid]);

  const deleteAllRead = useCallback(async (projectId?: string) => {
    if (!user?.uid) {
      return { success: false, error: "User not authenticated" };
    }

    setLoading(true);
    const result = await notificationServices.deleteAllRead(
      user.uid,
      projectId
    );
    setLoading(false);
    return result;
  }, [user?.uid]);

  return {
    create,
    update,
    remove,
    markAsRead,
    markAsUnread,
    archive,
    markAllAsRead,
    deleteAllRead,
    loading,
  };
}

// ============ useNotificationSettings Hook ============

export function useNotificationSettings(projectId: string | undefined) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid || !projectId) {
      setLoading(false);
      return;
    }

    const fetchSettings = async () => {
      setLoading(true);
      const result = await notificationServices.getNotificationSettings(
        user.uid,
        projectId
      );

      if (result.success && result.data) {
        setSettings(result.data);
        setError(null);
      } else {
        setError(result.error || "Failed to load settings");
      }

      setLoading(false);
    };

    fetchSettings();
  }, [user?.uid, projectId]);

  const updateSettings = useCallback(
    async (data: UpdateNotificationSettingsDto) => {
      if (!user?.uid || !projectId) {
        return { success: false, error: "User not authenticated" };
      }

      setLoading(true);
      const result = await notificationServices.updateNotificationSettings(
        user.uid,
        projectId,
        data
      );

      if (result.success) {
        // Refetch settings
        const updatedResult =
          await notificationServices.getNotificationSettings(
            user.uid,
            projectId
          );
        if (updatedResult.success && updatedResult.data) {
          setSettings(updatedResult.data);
        }
      }

      setLoading(false);
      return result;
    },
    [user?.uid, projectId]
  );

  return { settings, updateSettings, loading, error };
}

// ============ useNotification Hook (single) ============

export function useNotification(id: string | null) {
  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const fetchNotification = async () => {
      setLoading(true);
      const result = await notificationServices.getNotification(id);

      if (result.success && result.data) {
        setNotification(result.data);
        setError(null);
      } else {
        setError(result.error || "Notification not found");
      }

      setLoading(false);
    };

    fetchNotification();
  }, [id]);

  return { notification, loading, error };
}
