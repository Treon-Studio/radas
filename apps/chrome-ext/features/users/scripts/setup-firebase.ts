import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, collection, getDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/shared/lib/firebase";
import {
  PermissionAction,
  PermissionResource,
  SYSTEM_ROLES,
  type Permission,
  type Role,
  type User,
} from "../entity";

interface SetupConfig {
  adminEmail: string;
  adminPassword: string;
  adminDisplayName: string;
}

/**
 * Setup Firebase Collections and Initial Data
 * This script will:
 * 1. Create all necessary collections
 * 2. Create default permissions
 * 3. Create default roles (Admin, Member, Viewer)
 * 4. Create default workspace
 * 5. Create first admin user
 */
export async function setupFirebase(config: SetupConfig): Promise<{
  success: boolean;
  adminUid?: string;
  workspaceId?: string;
  error?: Error;
}> {
  try {
    console.log("🚀 Starting Firebase setup...\n");

    // Step 1: Create Permissions
    console.log("📋 Creating permissions...");
    const permissionIds = await createDefaultPermissions();
    console.log(`✓ Created ${permissionIds.length} permissions\n`);

    // Step 2: Create Roles
    console.log("👥 Creating default roles...");
    await createDefaultRoles(permissionIds);
    console.log("✓ Created default roles (Admin, Member, Viewer)\n");

    // Step 3: Create Default Workspace
    console.log("🏢 Creating default workspace...");
    const workspaceId = await createDefaultWorkspace(config);
    console.log(`✓ Default workspace created with ID: ${workspaceId}\n`);

    // Step 4: Create Admin User
    console.log("👤 Creating admin user...");
    const adminUid = await createAdminUser(config, workspaceId);
    console.log(`✓ Admin user created with UID: ${adminUid}\n`);

    // Step 5: Mark setup as complete
    console.log("✅ Marking setup as complete...");
    await markSetupComplete();
    console.log("✓ Setup configuration saved\n");

    console.log("✅ Firebase setup completed successfully!");

    return { success: true, adminUid, workspaceId };
  } catch (error) {
    console.error("❌ Error during Firebase setup:", error);
    return { success: false, error: error as Error };
  }
}

/**
 * Create all default permissions
 */
async function createDefaultPermissions(): Promise<string[]> {
  const permissionsRef = collection(db, "permissions");
  const createdPermissionIds: string[] = [];

  // Define all permissions with their IDs
  const permissions: Array<{
    id: string;
    data: Omit<Permission, "id" | "createdAt" | "updatedAt">;
  }> = [
    // Project permissions
    {
      id: "create_project",
      data: {
        name: "Create Project",
        description: "Create new projects",
        action: PermissionAction.CREATE,
        resource: PermissionResource.PROJECT,
      },
    },
    {
      id: "read_project",
      data: {
        name: "Read Project",
        description: "View project details",
        action: PermissionAction.READ,
        resource: PermissionResource.PROJECT,
      },
    },
    {
      id: "update_project",
      data: {
        name: "Update Project",
        description: "Edit project settings",
        action: PermissionAction.UPDATE,
        resource: PermissionResource.PROJECT,
      },
    },
    {
      id: "delete_project",
      data: {
        name: "Delete Project",
        description: "Delete projects",
        action: PermissionAction.DELETE,
        resource: PermissionResource.PROJECT,
      },
    },

    // Task permissions
    {
      id: "create_task",
      data: {
        name: "Create Task",
        description: "Create new tasks",
        action: PermissionAction.CREATE,
        resource: PermissionResource.TASK,
      },
    },
    {
      id: "read_task",
      data: {
        name: "Read Task",
        description: "View task details",
        action: PermissionAction.READ,
        resource: PermissionResource.TASK,
      },
    },
    {
      id: "update_task",
      data: {
        name: "Update Task",
        description: "Edit task details",
        action: PermissionAction.UPDATE,
        resource: PermissionResource.TASK,
      },
    },
    {
      id: "delete_task",
      data: {
        name: "Delete Task",
        description: "Delete tasks",
        action: PermissionAction.DELETE,
        resource: PermissionResource.TASK,
      },
    },

    // Epic permissions
    {
      id: "create_epic",
      data: {
        name: "Create Epic",
        description: "Create new epics",
        action: PermissionAction.CREATE,
        resource: PermissionResource.EPIC,
      },
    },
    {
      id: "read_epic",
      data: {
        name: "Read Epic",
        description: "View epic details",
        action: PermissionAction.READ,
        resource: PermissionResource.EPIC,
      },
    },
    {
      id: "update_epic",
      data: {
        name: "Update Epic",
        description: "Edit epic details",
        action: PermissionAction.UPDATE,
        resource: PermissionResource.EPIC,
      },
    },
    {
      id: "delete_epic",
      data: {
        name: "Delete Epic",
        description: "Delete epics",
        action: PermissionAction.DELETE,
        resource: PermissionResource.EPIC,
      },
    },

    // Page permissions
    {
      id: "create_page",
      data: {
        name: "Create Page",
        description: "Create new pages",
        action: PermissionAction.CREATE,
        resource: PermissionResource.PAGE,
      },
    },
    {
      id: "read_page",
      data: {
        name: "Read Page",
        description: "View page content",
        action: PermissionAction.READ,
        resource: PermissionResource.PAGE,
      },
    },
    {
      id: "update_page",
      data: {
        name: "Update Page",
        description: "Edit page content",
        action: PermissionAction.UPDATE,
        resource: PermissionResource.PAGE,
      },
    },
    {
      id: "delete_page",
      data: {
        name: "Delete Page",
        description: "Delete pages",
        action: PermissionAction.DELETE,
        resource: PermissionResource.PAGE,
      },
    },

    // Document permissions
    {
      id: "create_document",
      data: {
        name: "Create Document",
        description: "Upload new documents",
        action: PermissionAction.CREATE,
        resource: PermissionResource.DOCUMENT,
      },
    },
    {
      id: "read_document",
      data: {
        name: "Read Document",
        description: "View documents",
        action: PermissionAction.READ,
        resource: PermissionResource.DOCUMENT,
      },
    },
    {
      id: "update_document",
      data: {
        name: "Update Document",
        description: "Edit document metadata",
        action: PermissionAction.UPDATE,
        resource: PermissionResource.DOCUMENT,
      },
    },
    {
      id: "delete_document",
      data: {
        name: "Delete Document",
        description: "Delete documents",
        action: PermissionAction.DELETE,
        resource: PermissionResource.DOCUMENT,
      },
    },

    // Link permissions
    {
      id: "create_link",
      data: {
        name: "Create Link",
        description: "Create new links",
        action: PermissionAction.CREATE,
        resource: PermissionResource.LINK,
      },
    },
    {
      id: "read_link",
      data: {
        name: "Read Link",
        description: "View links",
        action: PermissionAction.READ,
        resource: PermissionResource.LINK,
      },
    },
    {
      id: "update_link",
      data: {
        name: "Update Link",
        description: "Edit links",
        action: PermissionAction.UPDATE,
        resource: PermissionResource.LINK,
      },
    },
    {
      id: "delete_link",
      data: {
        name: "Delete Link",
        description: "Delete links",
        action: PermissionAction.DELETE,
        resource: PermissionResource.LINK,
      },
    },

    // Test Case permissions
    {
      id: "create_test_case",
      data: {
        name: "Create Test Case",
        description: "Create new test cases",
        action: PermissionAction.CREATE,
        resource: PermissionResource.TEST_CASE,
      },
    },
    {
      id: "read_test_case",
      data: {
        name: "Read Test Case",
        description: "View test cases",
        action: PermissionAction.READ,
        resource: PermissionResource.TEST_CASE,
      },
    },
    {
      id: "update_test_case",
      data: {
        name: "Update Test Case",
        description: "Edit test cases",
        action: PermissionAction.UPDATE,
        resource: PermissionResource.TEST_CASE,
      },
    },
    {
      id: "delete_test_case",
      data: {
        name: "Delete Test Case",
        description: "Delete test cases",
        action: PermissionAction.DELETE,
        resource: PermissionResource.TEST_CASE,
      },
    },

    // User permissions
    {
      id: "create_user",
      data: {
        name: "Create User",
        description: "Add new users",
        action: PermissionAction.CREATE,
        resource: PermissionResource.USER,
      },
    },
    {
      id: "read_user",
      data: {
        name: "Read User",
        description: "View user details",
        action: PermissionAction.READ,
        resource: PermissionResource.USER,
      },
    },
    {
      id: "update_user",
      data: {
        name: "Update User",
        description: "Edit user details",
        action: PermissionAction.UPDATE,
        resource: PermissionResource.USER,
      },
    },
    {
      id: "delete_user",
      data: {
        name: "Delete User",
        description: "Delete users",
        action: PermissionAction.DELETE,
        resource: PermissionResource.USER,
      },
    },

    // Role permissions
    {
      id: "create_role",
      data: {
        name: "Create Role",
        description: "Create new roles",
        action: PermissionAction.CREATE,
        resource: PermissionResource.ROLE,
      },
    },
    {
      id: "read_role",
      data: {
        name: "Read Role",
        description: "View role details",
        action: PermissionAction.READ,
        resource: PermissionResource.ROLE,
      },
    },
    {
      id: "update_role",
      data: {
        name: "Update Role",
        description: "Edit role permissions",
        action: PermissionAction.UPDATE,
        resource: PermissionResource.ROLE,
      },
    },
    {
      id: "delete_role",
      data: {
        name: "Delete Role",
        description: "Delete roles",
        action: PermissionAction.DELETE,
        resource: PermissionResource.ROLE,
      },
    },

    // Manage All (Admin permission)
    {
      id: "manage_all",
      data: {
        name: "Manage All",
        description: "Full access to all resources",
        action: PermissionAction.MANAGE,
        resource: PermissionResource.ALL,
      },
    },
  ];

  // Create each permission
  for (const permission of permissions) {
    try {
      const permRef = doc(permissionsRef, permission.id);
      await setDoc(permRef, {
        ...permission.data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      createdPermissionIds.push(permission.id);
      console.log(`  ✓ ${permission.data.name}`);
    } catch (error) {
      console.error(`  ✗ Error creating ${permission.data.name}:`, error);
    }
  }

  return createdPermissionIds;
}

/**
 * Create default roles
 */
async function createDefaultRoles(permissionIds: string[]): Promise<void> {
  const rolesRef = collection(db, "roles");

  // Admin role - has all permissions
  const adminPermissions = permissionIds;

  // Member role - can create/read/update projects and tasks
  const memberPermissions = permissionIds.filter((id) =>
    [
      "create_project",
      "read_project",
      "update_project",
      "create_task",
      "read_task",
      "update_task",
      "delete_task",
      "create_epic",
      "read_epic",
      "update_epic",
      "create_page",
      "read_page",
      "update_page",
      "create_document",
      "read_document",
      "create_link",
      "read_link",
      "update_link",
      "create_test_case",
      "read_test_case",
      "update_test_case",
      "read_user",
      "read_role",
    ].includes(id)
  );

  // Viewer role - read-only access
  const viewerPermissions = permissionIds.filter((id) =>
    [
      "read_project",
      "read_task",
      "read_epic",
      "read_page",
      "read_document",
      "read_link",
      "read_test_case",
      "read_user",
      "read_role",
    ].includes(id)
  );

  const roles: Array<{ id: string; data: Omit<Role, "id" | "createdAt" | "updatedAt"> }> = [
    {
      id: "admin",
      data: {
        name: SYSTEM_ROLES.ADMIN.name,
        description: SYSTEM_ROLES.ADMIN.description,
        permissionIds: adminPermissions,
        isSystem: true,
        createdBy: "system",
      },
    },
    {
      id: "member",
      data: {
        name: SYSTEM_ROLES.MEMBER.name,
        description: SYSTEM_ROLES.MEMBER.description,
        permissionIds: memberPermissions,
        isSystem: true,
        createdBy: "system",
      },
    },
    {
      id: "viewer",
      data: {
        name: SYSTEM_ROLES.VIEWER.name,
        description: SYSTEM_ROLES.VIEWER.description,
        permissionIds: viewerPermissions,
        isSystem: true,
        createdBy: "system",
      },
    },
  ];

  // Create each role
  for (const role of roles) {
    try {
      const roleRef = doc(rolesRef, role.id);
      await setDoc(roleRef, {
        ...role.data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log(`  ✓ ${role.data.name} (${role.data.permissionIds.length} permissions)`);
    } catch (error) {
      console.error(`  ✗ Error creating ${role.data.name}:`, error);
    }
  }
}

/**
 * Create default workspace
 */
async function createDefaultWorkspace(config: SetupConfig): Promise<string> {
  try {
    const workspaceData = {
      name: `${config.adminDisplayName}'s Workspace`,
      description: "Default workspace created during setup",
      slug: "default",
      adminIds: [], // Will be updated after admin user is created
      memberIds: [],
      settings: {
        allowMemberInvite: true,
        features: {
          projects: true,
          tasks: true,
          epics: true,
          pages: true,
          documents: true,
          links: true,
          testCases: true,
        },
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: "system",
    };

    const workspaceRef = await addDoc(collection(db, "workspaces"), workspaceData);

    console.log(`  ✓ Workspace: ${workspaceData.name}`);
    console.log(`  ✓ Slug: ${workspaceData.slug}`);

    return workspaceRef.id;
  } catch (error) {
    console.error("Error creating default workspace:", error);
    throw error;
  }
}

/**
 * Create admin user
 */
async function createAdminUser(config: SetupConfig, workspaceId: string): Promise<string> {
  try {
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      config.adminEmail,
      config.adminPassword
    );

    const uid = userCredential.user.uid;

    // Create user document in Firestore with multiple roles support
    const userRef = doc(db, "users", uid);
    const userData: any = {
      email: config.adminEmail,
      displayName: config.adminDisplayName,
      roleIds: ["admin"], // Multiple roles support (array)
      workspaceIds: [workspaceId], // Array of workspaces user belongs to
      currentWorkspaceId: workspaceId, // Currently active workspace
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: "system",
    };

    await setDoc(userRef, userData);

    // Update workspace to add admin user to adminIds
    const workspaceRef = doc(db, "workspaces", workspaceId);
    await setDoc(
      workspaceRef,
      {
        adminIds: [uid],
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`  ✓ Email: ${config.adminEmail}`);
    console.log(`  ✓ Display Name: ${config.adminDisplayName}`);
    console.log(`  ✓ Roles: Admin`);
    console.log(`  ✓ Workspace: ${workspaceId}`);

    return uid;
  } catch (error: any) {
    if (error.code === "auth/email-already-in-use") {
      throw new Error("Email already in use. Please use a different email.");
    }
    throw error;
  }
}

/**
 * Mark setup as complete in configs collection
 */
async function markSetupComplete(): Promise<void> {
  try {
    const configRef = doc(db, "configs", "setup");
    await setDoc(configRef, {
      setupCompleted: true,
      completedAt: serverTimestamp(),
      version: "1.0.0",
    });
  } catch (error) {
    console.error("Error marking setup as complete:", error);
    throw error;
  }
}

/**
 * Check if Firebase is already set up
 */
export async function isFirebaseSetup(): Promise<boolean> {
  try {
    const configRef = doc(db, "configs", "setup");
    const configSnap = await getDoc(configRef);

    return configSnap.exists() && configSnap.data()?.setupCompleted === true;
  } catch (error) {
    console.error("Error checking Firebase setup:", error);
    return false;
  }
}

// Export for use in scripts/console
export { createDefaultPermissions, createDefaultRoles, createAdminUser };
