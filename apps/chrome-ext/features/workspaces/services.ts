import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import type {
  Workspace,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  AddWorkspaceMemberDto,
  WorkspaceMemberRole,
  WorkspaceWithMembers,
} from "./entity";

// ============ Collections ============

const WORKSPACES_COLLECTION = "workspaces";
const USERS_COLLECTION = "users";

// ============ Workspace Services ============

export const createWorkspace = async (
  creatorId: string,
  data: CreateWorkspaceDto
): Promise<{ success: boolean; id?: string; error?: Error }> => {
  try {
    const workspaceDoc = {
      name: data.name,
      description: data.description,
      slug: data.slug,
      logo: data.logo,
      adminIds: [creatorId], // Creator is first admin
      memberIds: [], // Initially no members (only admins)
      settings: data.settings || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: creatorId,
    };

    const docRef = await addDoc(collection(db, WORKSPACES_COLLECTION), workspaceDoc);

    // Add workspace to creator's workspaceIds
    const userRef = doc(db, USERS_COLLECTION, creatorId);
    await updateDoc(userRef, {
      workspaceIds: arrayUnion(docRef.id),
      currentWorkspaceId: docRef.id, // Set as current workspace
    });

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("[createWorkspace] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const updateWorkspace = async (
  workspaceId: string,
  data: UpdateWorkspaceDto
): Promise<{ success: boolean; error?: Error }> => {
  try {
    const workspaceRef = doc(db, WORKSPACES_COLLECTION, workspaceId);

    const updates: any = {
      ...data,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(workspaceRef, updates);

    return { success: true };
  } catch (error) {
    console.error("[updateWorkspace] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const deleteWorkspace = async (
  workspaceId: string
): Promise<{ success: boolean; error?: Error }> => {
  try {
    // TODO: Check if workspace has projects, prevent deletion if it does
    // For now, we'll just delete it

    const workspaceRef = doc(db, WORKSPACES_COLLECTION, workspaceId);
    await deleteDoc(workspaceRef);

    return { success: true };
  } catch (error) {
    console.error("[deleteWorkspace] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const getWorkspace = async (workspaceId: string): Promise<Workspace | null> => {
  try {
    const workspaceRef = doc(db, WORKSPACES_COLLECTION, workspaceId);
    const workspaceSnap = await getDoc(workspaceRef);

    if (!workspaceSnap.exists()) return null;

    return {
      id: workspaceSnap.id,
      ...workspaceSnap.data(),
    } as Workspace;
  } catch (error) {
    console.error("[getWorkspace] Error:", error);
    return null;
  }
};

export const subscribeToWorkspaces = (
  userId: string,
  callback: (workspaces: Workspace[], error?: Error) => void
): (() => void) => {
  // Get workspaces where user is admin or member
  const q = query(
    collection(db, WORKSPACES_COLLECTION),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const allWorkspaces: Workspace[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Workspace[];

      // Filter workspaces where user is admin or member
      const userWorkspaces = allWorkspaces.filter(
        (ws) => ws.adminIds.includes(userId) || ws.memberIds.includes(userId)
      );

      callback(userWorkspaces);
    },
    (error) => {
      console.error("[subscribeToWorkspaces] Error:", error);
      callback([], error as Error);
    }
  );
};

// ============ Workspace Member Services ============

export const addWorkspaceMember = async (
  workspaceId: string,
  data: AddWorkspaceMemberDto
): Promise<{ success: boolean; error?: Error }> => {
  try {
    const workspaceRef = doc(db, WORKSPACES_COLLECTION, workspaceId);
    const userRef = doc(db, USERS_COLLECTION, data.userId);

    // Add user to appropriate array based on role
    if (data.role === "admin") {
      await updateDoc(workspaceRef, {
        adminIds: arrayUnion(data.userId),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(workspaceRef, {
        memberIds: arrayUnion(data.userId),
        updatedAt: serverTimestamp(),
      });
    }

    // Add workspace to user's workspaceIds
    await updateDoc(userRef, {
      workspaceIds: arrayUnion(workspaceId),
    });

    return { success: true };
  } catch (error) {
    console.error("[addWorkspaceMember] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const removeWorkspaceMember = async (
  workspaceId: string,
  userId: string
): Promise<{ success: boolean; error?: Error }> => {
  try {
    const workspaceRef = doc(db, WORKSPACES_COLLECTION, workspaceId);
    const userRef = doc(db, USERS_COLLECTION, userId);

    // Remove user from both admin and member arrays
    await updateDoc(workspaceRef, {
      adminIds: arrayRemove(userId),
      memberIds: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });

    // Remove workspace from user's workspaceIds
    await updateDoc(userRef, {
      workspaceIds: arrayRemove(workspaceId),
    });

    return { success: true };
  } catch (error) {
    console.error("[removeWorkspaceMember] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const updateWorkspaceMemberRole = async (
  workspaceId: string,
  userId: string,
  newRole: WorkspaceMemberRole
): Promise<{ success: boolean; error?: Error }> => {
  try {
    const workspaceRef = doc(db, WORKSPACES_COLLECTION, workspaceId);

    if (newRole === "admin") {
      // Move from member to admin
      await updateDoc(workspaceRef, {
        memberIds: arrayRemove(userId),
        adminIds: arrayUnion(userId),
        updatedAt: serverTimestamp(),
      });
    } else {
      // Move from admin to member
      await updateDoc(workspaceRef, {
        adminIds: arrayRemove(userId),
        memberIds: arrayUnion(userId),
        updatedAt: serverTimestamp(),
      });
    }

    return { success: true };
  } catch (error) {
    console.error("[updateWorkspaceMemberRole] Error:", error);
    return { success: false, error: error as Error };
  }
};

export const getWorkspaceWithMembers = async (
  workspaceId: string
): Promise<WorkspaceWithMembers | null> => {
  try {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) return null;

    // Fetch admin details
    const adminPromises = workspace.adminIds.map(async (adminId) => {
      const userRef = doc(db, USERS_COLLECTION, adminId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        return {
          id: userSnap.id,
          displayName: userData.displayName,
          email: userData.email,
        };
      }
      return null;
    });

    // Fetch member details
    const memberPromises = workspace.memberIds.map(async (memberId) => {
      const userRef = doc(db, USERS_COLLECTION, memberId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        return {
          id: userSnap.id,
          displayName: userData.displayName,
          email: userData.email,
        };
      }
      return null;
    });

    const admins = (await Promise.all(adminPromises)).filter((a) => a !== null) as Array<{
      id: string;
      displayName: string;
      email: string;
    }>;

    const members = (await Promise.all(memberPromises)).filter((m) => m !== null) as Array<{
      id: string;
      displayName: string;
      email: string;
    }>;

    return {
      ...workspace,
      admins,
      members,
    };
  } catch (error) {
    console.error("[getWorkspaceWithMembers] Error:", error);
    return null;
  }
};

// ============ Helper Functions ============

export const isWorkspaceAdmin = async (
  workspaceId: string,
  userId: string
): Promise<boolean> => {
  try {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) return false;

    return workspace.adminIds.includes(userId);
  } catch (error) {
    console.error("[isWorkspaceAdmin] Error:", error);
    return false;
  }
};

export const getUserWorkspaces = async (userId: string): Promise<Workspace[]> => {
  try {
    // Get all workspaces
    const workspacesQuery = query(
      collection(db, WORKSPACES_COLLECTION),
      orderBy("createdAt", "desc")
    );
    const workspacesSnap = await getDocs(workspacesQuery);

    const allWorkspaces: Workspace[] = workspacesSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Workspace[];

    // Filter workspaces where user is admin or member
    return allWorkspaces.filter(
      (ws) => ws.adminIds.includes(userId) || ws.memberIds.includes(userId)
    );
  } catch (error) {
    console.error("[getUserWorkspaces] Error:", error);
    return [];
  }
};
