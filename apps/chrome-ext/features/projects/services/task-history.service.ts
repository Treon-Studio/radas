import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/shared/lib/firebase/config";
import type {
  TaskHistoryEvent,
  TaskHistoryDto,
  TaskHistoryEventType,
} from "../entities/task-history.entity";

const TASK_HISTORY_COLLECTION = "task_history";

/**
 * Create a new task history event
 */
export async function createTaskHistoryEvent(
  data: TaskHistoryDto
): Promise<{ success: boolean; id?: string; error?: Error }> {
  try {
    // Remove undefined fields to prevent Firestore errors
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    const historyData = {
      ...cleanData,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(
      collection(db, TASK_HISTORY_COLLECTION),
      historyData
    );

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error creating task history event:", error);
    return { success: false, error: error as Error };
  }
}

/**
 * Get task history events for a specific task
 */
export async function getTaskHistory(
  taskId: string
): Promise<TaskHistoryEvent[]> {
  try {
    const q = query(
      collection(db, TASK_HISTORY_COLLECTION),
      where("taskId", "==", taskId),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as TaskHistoryEvent[];
  } catch (error) {
    console.error("Error getting task history:", error);
    return [];
  }
}

/**
 * Subscribe to task history events in real-time
 */
export function subscribeToTaskHistory(
  taskId: string,
  callback: (history: TaskHistoryEvent[], error?: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, TASK_HISTORY_COLLECTION),
    where("taskId", "==", taskId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const history = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TaskHistoryEvent[];

      callback(history);
    },
    (error) => {
      console.error("Error subscribing to task history:", error);
      callback([], error);
    }
  );
}

/**
 * Get task history for a project
 */
export async function getProjectTaskHistory(
  projectId: string,
  limit?: number
): Promise<TaskHistoryEvent[]> {
  try {
    let q = query(
      collection(db, TASK_HISTORY_COLLECTION),
      where("projectId", "==", projectId),
      orderBy("createdAt", "desc")
    );

    if (limit) {
      q = query(q);
    }

    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as TaskHistoryEvent[];
  } catch (error) {
    console.error("Error getting project task history:", error);
    return [];
  }
}

/**
 * Helper function to log task creation
 */
export async function logTaskCreated(
  taskId: string,
  projectId: string,
  userId: string,
  userName: string,
  userPhotoURL?: string,
  taskTitle?: string
): Promise<{ success: boolean; error?: Error }> {
  return createTaskHistoryEvent({
    taskId,
    projectId,
    eventType: "created",
    userId,
    userName,
    userPhotoURL,
    description: `Created task${taskTitle ? `: ${taskTitle}` : ""}`,
  });
}

/**
 * Helper function to log status change
 */
export async function logStatusChange(
  taskId: string,
  projectId: string,
  userId: string,
  userName: string,
  previousStatus: string,
  newStatus: string,
  userPhotoURL?: string
): Promise<{ success: boolean; error?: Error }> {
  return createTaskHistoryEvent({
    taskId,
    projectId,
    eventType: "status_changed",
    userId,
    userName,
    userPhotoURL,
    previousValue: previousStatus,
    newValue: newStatus,
    description: `Changed status from "${previousStatus}" to "${newStatus}"`,
  });
}

/**
 * Helper function to log assignee change
 */
export async function logAssigneeChange(
  taskId: string,
  projectId: string,
  userId: string,
  userName: string,
  previousAssignee?: string,
  newAssignee?: string,
  userPhotoURL?: string
): Promise<{ success: boolean; error?: Error }> {
  let description = "";
  if (!previousAssignee && newAssignee) {
    description = `Assigned to ${newAssignee}`;
  } else if (previousAssignee && !newAssignee) {
    description = `Unassigned from ${previousAssignee}`;
  } else if (previousAssignee && newAssignee) {
    description = `Changed assignee from ${previousAssignee} to ${newAssignee}`;
  } else {
    description = "Assignee updated";
  }

  return createTaskHistoryEvent({
    taskId,
    projectId,
    eventType: "assignee_changed",
    userId,
    userName,
    userPhotoURL,
    previousValue: previousAssignee || "Unassigned",
    newValue: newAssignee || "Unassigned",
    description,
  });
}

/**
 * Helper function to log priority change
 */
export async function logPriorityChange(
  taskId: string,
  projectId: string,
  userId: string,
  userName: string,
  previousPriority?: string,
  newPriority?: string,
  userPhotoURL?: string
): Promise<{ success: boolean; error?: Error }> {
  const oldPriority = previousPriority || "No Priority";
  const newPriorityValue = newPriority || "No Priority";

  let description = "";
  if (!previousPriority && newPriority) {
    description = `Set priority to ${newPriority}`;
  } else if (previousPriority && !newPriority) {
    description = `Removed priority ${previousPriority}`;
  } else {
    description = `Changed priority from ${oldPriority} to ${newPriorityValue}`;
  }

  return createTaskHistoryEvent({
    taskId,
    projectId,
    eventType: "priority_changed",
    userId,
    userName,
    userPhotoURL,
    previousValue: oldPriority,
    newValue: newPriorityValue,
    description,
  });
}

/**
 * Helper function to log time entry
 */
export async function logTimeEntry(
  taskId: string,
  projectId: string,
  userId: string,
  userName: string,
  duration: number,
  userPhotoURL?: string
): Promise<{ success: boolean; error?: Error }> {
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return createTaskHistoryEvent({
    taskId,
    projectId,
    eventType: "time_entry_added",
    userId,
    userName,
    userPhotoURL,
    newValue: duration,
    description: `Logged ${timeStr} of work`,
    metadata: { duration },
  });
}

/**
 * Helper function to log title change
 */
export async function logTitleChange(
  taskId: string,
  projectId: string,
  userId: string,
  userName: string,
  previousTitle: string,
  newTitle: string,
  userPhotoURL?: string
): Promise<{ success: boolean; error?: Error }> {
  return createTaskHistoryEvent({
    taskId,
    projectId,
    eventType: "field_changed",
    userId,
    userName,
    userPhotoURL,
    previousValue: previousTitle,
    newValue: newTitle,
    description: `Changed title from "${previousTitle}" to "${newTitle}"`,
    metadata: { field: "title" },
  });
}

/**
 * Helper function to log description change
 */
export async function logDescriptionChange(
  taskId: string,
  projectId: string,
  userId: string,
  userName: string,
  previousDescription?: string,
  newDescription?: string,
  userPhotoURL?: string
): Promise<{ success: boolean; error?: Error }> {
  let description = "";
  if (!previousDescription && newDescription) {
    description = "Added description";
  } else if (previousDescription && !newDescription) {
    description = "Removed description";
  } else {
    description = "Updated description";
  }

  return createTaskHistoryEvent({
    taskId,
    projectId,
    eventType: "field_changed",
    userId,
    userName,
    userPhotoURL,
    previousValue: previousDescription,
    newValue: newDescription,
    description,
    metadata: { field: "description" },
  });
}
