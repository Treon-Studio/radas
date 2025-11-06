import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db, auth } from "@/shared/lib/firebase";

/**
 * ⚠️ DANGER: Reset Firebase Database
 *
 * This script will DELETE ALL DATA from Firestore:
 * - permissions (all 41+ documents)
 * - roles (admin, member, viewer)
 * - users (all user documents)
 * - workspaces (all workspaces)
 * - projects (all projects)
 * - tasks (all tasks)
 * - epics (all epics)
 * - And all other collections
 *
 * USE WITH EXTREME CAUTION!
 */

interface ResetResult {
  success: boolean;
  deletedCounts: Record<string, number>;
  errors: string[];
  totalDeleted: number;
}

export async function resetFirebaseDatabase(): Promise<ResetResult> {
  console.log("🔥 DANGER: Starting Firebase Database Reset...\n");
  console.log("⚠️  This will DELETE ALL DATA!\n");

  const deletedCounts: Record<string, number> = {};
  const errors: string[] = [];
  let totalDeleted = 0;

  // Collections to delete (in order)
  const collectionsToDelete = [
    "time_entries",
    "test_executions",
    "test_cases",
    "test_suites",
    "views",
    "cycles",
    "links",
    "documents",
    "document_folders",
    "pages",
    "tasks",
    "epics",
    "project_priorities",
    "project_labels",
    "project_statuses",
    "projects",
    "users",
    "workspaces",
    "roles",
    "permissions",
  ];

  // Delete each collection
  for (const collectionName of collectionsToDelete) {
    try {
      console.log(`🗑️  Deleting collection: ${collectionName}...`);
      const count = await deleteCollection(collectionName);
      deletedCounts[collectionName] = count;
      totalDeleted += count;
      console.log(`✓ Deleted ${count} documents from ${collectionName}\n`);
    } catch (error) {
      const errorMsg = `Failed to delete ${collectionName}: ${error}`;
      console.error(`❌ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  // Clear localStorage
  try {
    console.log("🧹 Clearing localStorage...");
    localStorage.clear();
    console.log("✓ localStorage cleared\n");
  } catch (error) {
    console.error("❌ Failed to clear localStorage:", error);
  }

  const success = errors.length === 0;

  console.log("\n" + "=".repeat(50));
  console.log("📊 RESET SUMMARY:");
  console.log("=".repeat(50));
  console.log(`Total documents deleted: ${totalDeleted}`);
  console.log("\nDeleted per collection:");
  Object.entries(deletedCounts).forEach(([name, count]) => {
    if (count > 0) {
      console.log(`  - ${name}: ${count}`);
    }
  });

  if (errors.length > 0) {
    console.log("\n❌ Errors encountered:");
    errors.forEach((err) => console.log(`  - ${err}`));
  }

  console.log("\n" + "=".repeat(50));

  if (success) {
    console.log("✅ Database reset completed successfully!");
    console.log("\n🔄 Next steps:");
    console.log("1. Reload the extension");
    console.log("2. Setup page will appear automatically");
    console.log("3. Fill in admin credentials");
    console.log("4. Click 'Initialize Firebase'");
  } else {
    console.log("⚠️  Database reset completed with errors");
  }

  console.log("=".repeat(50) + "\n");

  return {
    success,
    deletedCounts,
    errors,
    totalDeleted,
  };
}

/**
 * Delete all documents in a collection
 */
async function deleteCollection(collectionName: string): Promise<number> {
  const collectionRef = collection(db, collectionName);
  const snapshot = await getDocs(collectionRef);

  if (snapshot.empty) {
    return 0;
  }

  // Delete all documents
  const deletePromises = snapshot.docs.map((document) =>
    deleteDoc(doc(db, collectionName, document.id))
  );

  await Promise.all(deletePromises);

  return snapshot.docs.length;
}

/**
 * Delete current Firebase Auth user
 * Note: User must be logged in for this to work
 */
export async function deleteCurrentAuthUser(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const user = auth.currentUser;

    if (!user) {
      return {
        success: false,
        error: "No user is currently logged in",
      };
    }

    console.log(`🗑️  Deleting Auth user: ${user.email}...`);
    await user.delete();
    console.log("✓ Auth user deleted\n");

    return { success: true };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error("❌ Failed to delete auth user:", errorMsg);

    if (error.code === "auth/requires-recent-login") {
      return {
        success: false,
        error: "Please logout and login again before deleting user (requires recent login)",
      };
    }

    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Complete reset: Database + Auth user
 */
export async function completeReset(): Promise<{
  success: boolean;
  dbResult: ResetResult;
  authDeleted: boolean;
  authError?: string;
}> {
  console.log("\n🔥🔥🔥 COMPLETE FIREBASE RESET 🔥🔥🔥\n");
  console.log("This will:");
  console.log("1. Delete all Firestore data");
  console.log("2. Delete current auth user");
  console.log("3. Clear localStorage");
  console.log("\n⚠️  ARE YOU SURE? This cannot be undone!\n");

  // Delete database
  const dbResult = await resetFirebaseDatabase();

  // Delete auth user
  const authResult = await deleteCurrentAuthUser();

  const success = dbResult.success && authResult.success;

  if (success) {
    console.log("\n✅ COMPLETE RESET SUCCESSFUL!");
    console.log("🔄 Reload the extension to start fresh\n");
  }

  return {
    success,
    dbResult,
    authDeleted: authResult.success,
    authError: authResult.error,
  };
}

// Export for browser console usage
if (typeof window !== "undefined") {
  (window as any).resetFirebase = resetFirebaseDatabase;
  (window as any).completeFirebaseReset = completeReset;
  (window as any).deleteAuthUser = deleteCurrentAuthUser;
}
