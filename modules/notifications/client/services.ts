import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  Timestamp,
  type Unsubscribe,
  writeBatch,
} from "firebase/firestore";
import { db } from "@radas/config/lib/firebase/config";
import type {
  Notification,
  CreateNotificationDto,
  UpdateNotificationDto,
  NotificationFilter,
  NotificationSettings,
  UpdateNotificationSettingsDto,
  NotificationStatus,
} from "./entity";

const NOTIFICATIONS_COLLECTION = "notifications";
const NOTIFICATION_SETTINGS_COLLECTION = "notificationSettings";

// ============ Notification CRUD ============

export async function createNotification(
  data: CreateNotificationDto
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const now = Timestamp.now();

    const notificationData = {
      ...data,
      status: "unread" as NotificationStatus,
      priority: data.priority || "medium",
      channels: data.channels || ["app"],
      createdAt: now,
      updatedAt: now,
      ...(data.scheduledFor && {
        scheduledFor: Timestamp.fromDate(data.scheduledFor),
      }),
    };

    const docRef = await addDoc(
      collection(db, NOTIFICATIONS_COLLECTION),
      notificationData
    );

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error creating notification:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function updateNotification(
  id: string,
  data: UpdateNotificationDto
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, id);

    const updateData: any = {
      ...data,
      updatedAt: Timestamp.now(),
    };

    if (data.readAt) {
      updateData.readAt = Timestamp.fromDate(data.readAt);
    }

    if (data.archivedAt) {
      updateData.archivedAt = Timestamp.fromDate(data.archivedAt);
    }

    await updateDoc(docRef, updateData);

    return { success: true };
  } catch (error) {
    console.error("Error updating notification:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function deleteNotification(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, id);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error) {
    console.error("Error deleting notification:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getNotification(
  id: string
): Promise<{ success: boolean; data?: Notification; error?: string }> {
  try {
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return { success: false, error: "Notification not found" };
    }

    const data = { id: docSnap.id, ...docSnap.data() } as Notification;
    return { success: true, data };
  } catch (error) {
    console.error("Error getting notification:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getNotifications(
  filter: NotificationFilter = {}
): Promise<{ success: boolean; data?: Notification[]; error?: string }> {
  try {
    const constraints: any[] = [];

    if (filter.userId) {
      constraints.push(where("userId", "==", filter.userId));
    }

    if (filter.projectId) {
      constraints.push(where("projectId", "==", filter.projectId));
    }

    if (filter.type) {
      if (Array.isArray(filter.type)) {
        constraints.push(where("type", "in", filter.type));
      } else {
        constraints.push(where("type", "==", filter.type));
      }
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        constraints.push(where("status", "in", filter.status));
      } else {
        constraints.push(where("status", "==", filter.status));
      }
    }

    if (filter.priority) {
      if (Array.isArray(filter.priority)) {
        constraints.push(where("priority", "in", filter.priority));
      } else {
        constraints.push(where("priority", "==", filter.priority));
      }
    }

    if (filter.referenceType) {
      constraints.push(where("referenceType", "==", filter.referenceType));
    }

    if (filter.unreadOnly) {
      constraints.push(where("status", "==", "unread"));
    }

    // Order by createdAt descending (newest first)
    constraints.push(orderBy("createdAt", "desc"));

    if (filter.limit) {
      constraints.push(firestoreLimit(filter.limit));
    }

    const q = query(collection(db, NOTIFICATIONS_COLLECTION), ...constraints);
    const querySnapshot = await getDocs(q);

    const notifications: Notification[] = [];
    querySnapshot.forEach((doc) => {
      notifications.push({ id: doc.id, ...doc.data() } as Notification);
    });

    return { success: true, data: notifications };
  } catch (error) {
    console.error("Error getting notifications:", error);
    return { success: false, error: (error as Error).message };
  }
}

// ============ Bulk Operations ============

export async function markAllAsRead(
  userId: string,
  projectId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const batch = writeBatch(db);
    const constraints = [
      where("userId", "==", userId),
      where("status", "==", "unread"),
    ];

    if (projectId) {
      constraints.push(where("projectId", "==", projectId));
    }

    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      ...constraints
    );

    const querySnapshot = await getDocs(q);
    const now = Timestamp.now();

    querySnapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        status: "read",
        readAt: now,
        updatedAt: now,
      });
    });

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error("Error marking all as read:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function deleteAllRead(
  userId: string,
  projectId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const batch = writeBatch(db);
    const constraints = [
      where("userId", "==", userId),
      where("status", "==", "read"),
    ];

    if (projectId) {
      constraints.push(where("projectId", "==", projectId));
    }

    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      ...constraints
    );

    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error("Error deleting all read:", error);
    return { success: false, error: (error as Error).message };
  }
}

// ============ Real-time Subscriptions ============

export function subscribeToNotifications(
  filter: NotificationFilter,
  callback: (notifications: Notification[]) => void
): Unsubscribe {
  const constraints: any[] = [];

  if (filter.userId) {
    constraints.push(where("userId", "==", filter.userId));
  }

  if (filter.projectId) {
    constraints.push(where("projectId", "==", filter.projectId));
  }

  if (filter.status) {
    if (Array.isArray(filter.status)) {
      constraints.push(where("status", "in", filter.status));
    } else {
      constraints.push(where("status", "==", filter.status));
    }
  }

  constraints.push(orderBy("createdAt", "desc"));

  if (filter.limit) {
    constraints.push(firestoreLimit(filter.limit));
  }

  const q = query(collection(db, NOTIFICATIONS_COLLECTION), ...constraints);

  return onSnapshot(
    q,
    (snapshot) => {
      const notifications: Notification[] = [];
      snapshot.forEach((doc) => {
        notifications.push({ id: doc.id, ...doc.data() } as Notification);
      });
      callback(notifications);
    },
    (error) => {
      console.error("Error in notifications subscription:", error);
      // Call callback with empty array on error to prevent UI from hanging
      callback([]);
    }
  );
}

// ============ Notification Settings ============

export async function getNotificationSettings(
  userId: string,
  projectId: string
): Promise<{
  success: boolean;
  data?: NotificationSettings;
  error?: string;
}> {
  try {
    const q = query(
      collection(db, NOTIFICATION_SETTINGS_COLLECTION),
      where("userId", "==", userId),
      where("projectId", "==", projectId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      // Create default settings
      const defaultSettings = await createDefaultNotificationSettings(
        userId,
        projectId
      );
      return { success: true, data: defaultSettings };
    }

    const doc = querySnapshot.docs[0];
    const data = { id: doc.id, ...doc.data() } as NotificationSettings;

    return { success: true, data };
  } catch (error) {
    console.error("Error getting notification settings:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function updateNotificationSettings(
  userId: string,
  projectId: string,
  data: UpdateNotificationSettingsDto
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find existing settings
    const q = query(
      collection(db, NOTIFICATION_SETTINGS_COLLECTION),
      where("userId", "==", userId),
      where("projectId", "==", projectId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      // Create new settings if not exists
      await createDefaultNotificationSettings(userId, projectId);
      const newSnapshot = await getDocs(q);
      const docRef = newSnapshot.docs[0].ref;
      await updateDoc(docRef, {
        ...data,
        updatedAt: Timestamp.now(),
      });
    } else {
      const docRef = querySnapshot.docs[0].ref;
      await updateDoc(docRef, {
        ...data,
        updatedAt: Timestamp.now(),
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating notification settings:", error);
    return { success: false, error: (error as Error).message };
  }
}

async function createDefaultNotificationSettings(
  userId: string,
  projectId: string
): Promise<NotificationSettings> {
  const now = Timestamp.now();

  const defaultSettings = {
    userId,
    projectId,
    emailEnabled: true,
    pushEnabled: true,
    appEnabled: true,
    enabledTypes: Object.values([
      "info",
      "success",
      "warning",
      "error",
      "task_assigned",
      "task_updated",
      "task_completed",
      "project_invite",
      "comment_mention",
      "deadline_reminder",
      "system",
    ]),
    digestMode: false,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(
    collection(db, NOTIFICATION_SETTINGS_COLLECTION),
    defaultSettings
  );

  return { id: docRef.id, ...defaultSettings } as NotificationSettings;
}

// ============ Statistics ============

export async function getUnreadCount(
  userId: string,
  projectId?: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const constraints = [
      where("userId", "==", userId),
      where("status", "==", "unread"),
    ];

    // Only filter by projectId if provided
    if (projectId) {
      constraints.push(where("projectId", "==", projectId));
    }

    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      ...constraints
    );

    const querySnapshot = await getDocs(q);
    return { success: true, count: querySnapshot.size };
  } catch (error) {
    console.error("Error getting unread count:", error);
    return { success: false, error: (error as Error).message };
  }
}

// ============ Provider Configuration ============

const PROVIDER_CONFIG_COLLECTION = "notificationProviderConfigs";

export async function createProviderConfig(
  data: import("./entity").CreateProviderConfigDto
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const now = Timestamp.now();

    // Filter out undefined values - Firestore doesn't accept undefined
    const configData: any = {
      userId: data.userId,
      projectId: data.projectId,
      provider: data.provider,
      enabled: true,
      webhookUrl: data.webhookUrl,
      useGlobalUrl: data.useGlobalUrl,
      enabledEvents: data.enabledEvents,
      name: data.name,
      createdAt: now,
      updatedAt: now,
    };

    // Only add optional fields if they have values
    if (data.description) {
      configData.description = data.description;
    }
    if (data.webhookUrlPerEvent) {
      configData.webhookUrlPerEvent = data.webhookUrlPerEvent;
    }

    const docRef = await addDoc(
      collection(db, PROVIDER_CONFIG_COLLECTION),
      configData
    );

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error creating provider config:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function updateProviderConfig(
  id: string,
  data: import("./entity").UpdateProviderConfigDto
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, PROVIDER_CONFIG_COLLECTION, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: Timestamp.now(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error updating provider config:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function deleteProviderConfig(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, PROVIDER_CONFIG_COLLECTION, id);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error) {
    console.error("Error deleting provider config:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getProviderConfigs(
  userId: string,
  projectId?: string
): Promise<{
  success: boolean;
  data?: import("./entity").NotificationProviderConfig[];
  error?: string;
}> {
  try {
    const constraints = [
      where("userId", "==", userId),
    ];

    if (projectId) {
      constraints.push(where("projectId", "==", projectId));
    }

    const q = query(
      collection(db, PROVIDER_CONFIG_COLLECTION),
      ...constraints,
      orderBy("createdAt", "desc")
    );

    const querySnapshot = await getDocs(q);

    const configs: import("./entity").NotificationProviderConfig[] = [];
    querySnapshot.forEach((doc) => {
      configs.push({
        id: doc.id,
        ...doc.data(),
      } as import("./entity").NotificationProviderConfig);
    });

    return { success: true, data: configs };
  } catch (error) {
    console.error("Error getting provider configs:", error);
    return { success: false, error: (error as Error).message };
  }
}

// ============ Webhook Delivery ============

export async function sendToWebhook(
  notificationData: Notification,
  providerConfig: import("./entity").NotificationProviderConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    // Determine which webhook URL to use
    let webhookUrl = providerConfig.webhookUrl;

    if (
      !providerConfig.useGlobalUrl &&
      providerConfig.webhookUrlPerEvent &&
      providerConfig.webhookUrlPerEvent[notificationData.type]
    ) {
      webhookUrl = providerConfig.webhookUrlPerEvent[notificationData.type];
    }

    // Format message based on provider
    let payload: any;

    switch (providerConfig.provider) {
      case "discord":
        payload = {
          embeds: [
            {
              title: notificationData.title,
              description: notificationData.message,
              color: getColorForType(notificationData.type),
              timestamp: notificationData.createdAt.toDate().toISOString(),
              footer: {
                text: `Type: ${notificationData.type}`,
              },
            },
          ],
        };
        break;

      case "whatsapp":
        // WhatsApp webhook format (depends on provider like Twilio, etc.)
        payload = {
          to: webhookUrl, // This might be phone number
          body: `*${notificationData.title}*\n\n${notificationData.message}`,
        };
        break;

      default:
        // Generic webhook format
        payload = {
          title: notificationData.title,
          message: notificationData.message,
          type: notificationData.type,
          priority: notificationData.priority,
          timestamp: notificationData.createdAt.toDate().toISOString(),
          metadata: notificationData.metadata,
        };
    }

    // Send to webhook
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.statusText}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending to webhook:", error);
    return { success: false, error: (error as Error).message };
  }
}

function getColorForType(type: import("./entity").NotificationType): number {
  // Discord color codes (decimal)
  const colors: Record<import("./entity").NotificationType, number> = {
    info: 3447003, // Blue
    success: 3066993, // Green
    warning: 16776960, // Yellow
    error: 15158332, // Red
    task_assigned: 10181046, // Purple
    task_updated: 3447003, // Blue
    task_completed: 3066993, // Green
    project_invite: 7419530, // Indigo
    comment_mention: 15105570, // Orange
    deadline_reminder: 15158332, // Red
    system: 9807270, // Gray
  };

  return colors[type] || 3447003;
}
