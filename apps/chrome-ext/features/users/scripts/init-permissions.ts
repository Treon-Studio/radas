import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/shared/lib/firebase";
import {
  PermissionAction,
  PermissionResource,
  SYSTEM_ROLES,
  type Permission,
  type Role,
} from "../entity";

/**
 * Initialize default permissions in Firestore
 * This should be run once when setting up the system
 */
export async function initializeDefaultPermissions(): Promise<string[]> {
  const permissionsRef = collection(db, "permissions");
  const createdPermissionIds: string[] = [];

  // Define all default permissions
  const defaultPermissions: Omit<Permission, "id" | "createdAt" | "updatedAt">[] = [
    // Project permissions
    {
      name: "Create Project",
      description: "Create new projects",
      action: PermissionAction.CREATE,
      resource: PermissionResource.PROJECT,
    },
    {
      name: "Read Project",
      description: "View project details",
      action: PermissionAction.READ,
      resource: PermissionResource.PROJECT,
    },
    {
      name: "Update Project",
      description: "Edit project settings",
      action: PermissionAction.UPDATE,
      resource: PermissionResource.PROJECT,
    },
    {
      name: "Delete Project",
      description: "Delete projects",
      action: PermissionAction.DELETE,
      resource: PermissionResource.PROJECT,
    },

    // Task permissions
    {
      name: "Create Task",
      description: "Create new tasks",
      action: PermissionAction.CREATE,
      resource: PermissionResource.TASK,
    },
    {
      name: "Read Task",
      description: "View task details",
      action: PermissionAction.READ,
      resource: PermissionResource.TASK,
    },
    {
      name: "Update Task",
      description: "Edit task details",
      action: PermissionAction.UPDATE,
      resource: PermissionResource.TASK,
    },
    {
      name: "Delete Task",
      description: "Delete tasks",
      action: PermissionAction.DELETE,
      resource: PermissionResource.TASK,
    },

    // Epic permissions
    {
      name: "Create Epic",
      description: "Create new epics",
      action: PermissionAction.CREATE,
      resource: PermissionResource.EPIC,
    },
    {
      name: "Read Epic",
      description: "View epic details",
      action: PermissionAction.READ,
      resource: PermissionResource.EPIC,
    },
    {
      name: "Update Epic",
      description: "Edit epic details",
      action: PermissionAction.UPDATE,
      resource: PermissionResource.EPIC,
    },
    {
      name: "Delete Epic",
      description: "Delete epics",
      action: PermissionAction.DELETE,
      resource: PermissionResource.EPIC,
    },

    // Page permissions
    {
      name: "Create Page",
      description: "Create new pages",
      action: PermissionAction.CREATE,
      resource: PermissionResource.PAGE,
    },
    {
      name: "Read Page",
      description: "View page content",
      action: PermissionAction.READ,
      resource: PermissionResource.PAGE,
    },
    {
      name: "Update Page",
      description: "Edit page content",
      action: PermissionAction.UPDATE,
      resource: PermissionResource.PAGE,
    },
    {
      name: "Delete Page",
      description: "Delete pages",
      action: PermissionAction.DELETE,
      resource: PermissionResource.PAGE,
    },

    // Document permissions
    {
      name: "Create Document",
      description: "Upload new documents",
      action: PermissionAction.CREATE,
      resource: PermissionResource.DOCUMENT,
    },
    {
      name: "Read Document",
      description: "View documents",
      action: PermissionAction.READ,
      resource: PermissionResource.DOCUMENT,
    },
    {
      name: "Update Document",
      description: "Edit document metadata",
      action: PermissionAction.UPDATE,
      resource: PermissionResource.DOCUMENT,
    },
    {
      name: "Delete Document",
      description: "Delete documents",
      action: PermissionAction.DELETE,
      resource: PermissionResource.DOCUMENT,
    },

    // Link permissions
    {
      name: "Create Link",
      description: "Create new links",
      action: PermissionAction.CREATE,
      resource: PermissionResource.LINK,
    },
    {
      name: "Read Link",
      description: "View links",
      action: PermissionAction.READ,
      resource: PermissionResource.LINK,
    },
    {
      name: "Update Link",
      description: "Edit links",
      action: PermissionAction.UPDATE,
      resource: PermissionResource.LINK,
    },
    {
      name: "Delete Link",
      description: "Delete links",
      action: PermissionAction.DELETE,
      resource: PermissionResource.LINK,
    },

    // Test Case permissions
    {
      name: "Create Test Case",
      description: "Create new test cases",
      action: PermissionAction.CREATE,
      resource: PermissionResource.TEST_CASE,
    },
    {
      name: "Read Test Case",
      description: "View test cases",
      action: PermissionAction.READ,
      resource: PermissionResource.TEST_CASE,
    },
    {
      name: "Update Test Case",
      description: "Edit test cases",
      action: PermissionAction.UPDATE,
      resource: PermissionResource.TEST_CASE,
    },
    {
      name: "Delete Test Case",
      description: "Delete test cases",
      action: PermissionAction.DELETE,
      resource: PermissionResource.TEST_CASE,
    },

    // User permissions
    {
      name: "Create User",
      description: "Add new users",
      action: PermissionAction.CREATE,
      resource: PermissionResource.USER,
    },
    {
      name: "Read User",
      description: "View user details",
      action: PermissionAction.READ,
      resource: PermissionResource.USER,
    },
    {
      name: "Update User",
      description: "Edit user details",
      action: PermissionAction.UPDATE,
      resource: PermissionResource.USER,
    },
    {
      name: "Delete User",
      description: "Delete users",
      action: PermissionAction.DELETE,
      resource: PermissionResource.USER,
    },

    // Role permissions
    {
      name: "Create Role",
      description: "Create new roles",
      action: PermissionAction.CREATE,
      resource: PermissionResource.ROLE,
    },
    {
      name: "Read Role",
      description: "View role details",
      action: PermissionAction.READ,
      resource: PermissionResource.ROLE,
    },
    {
      name: "Update Role",
      description: "Edit role permissions",
      action: PermissionAction.UPDATE,
      resource: PermissionResource.ROLE,
    },
    {
      name: "Delete Role",
      description: "Delete roles",
      action: PermissionAction.DELETE,
      resource: PermissionResource.ROLE,
    },

    // Manage All (Admin permission)
    {
      name: "Manage All",
      description: "Full access to all resources",
      action: PermissionAction.MANAGE,
      resource: PermissionResource.ALL,
    },
  ];

  // Create permissions
  for (const permission of defaultPermissions) {
    try {
      const permId = `${permission.action}_${permission.resource}`;
      const permRef = doc(permissionsRef, permId);

      await setDoc(permRef, {
        ...permission,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      createdPermissionIds.push(permId);
      console.log(`✓ Created permission: ${permission.name}`);
    } catch (error) {
      console.error(`✗ Error creating permission ${permission.name}:`, error);
    }
  }

  return createdPermissionIds;
}

/**
 * Initialize default roles (Admin, Member, Viewer)
 */
export async function initializeDefaultRoles(
  permissionIds: string[]
): Promise<void> {
  const rolesRef = collection(db, "roles");

  // Admin role - has all permissions
  const adminRole: Omit<Role, "id" | "createdAt" | "updatedAt"> = {
    name: SYSTEM_ROLES.ADMIN.name,
    description: SYSTEM_ROLES.ADMIN.description,
    permissionIds: permissionIds, // All permissions
    isSystem: true,
    createdBy: "system",
  };

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

  const memberRole: Omit<Role, "id" | "createdAt" | "updatedAt"> = {
    name: SYSTEM_ROLES.MEMBER.name,
    description: SYSTEM_ROLES.MEMBER.description,
    permissionIds: memberPermissions,
    isSystem: true,
    createdBy: "system",
  };

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

  const viewerRole: Omit<Role, "id" | "createdAt" | "updatedAt"> = {
    name: SYSTEM_ROLES.VIEWER.name,
    description: SYSTEM_ROLES.VIEWER.description,
    permissionIds: viewerPermissions,
    isSystem: true,
    createdBy: "system",
  };

  // Create roles
  const roles = [
    { id: "admin", data: adminRole },
    { id: "member", data: memberRole },
    { id: "viewer", data: viewerRole },
  ];

  for (const role of roles) {
    try {
      const roleRef = doc(rolesRef, role.id);
      await setDoc(roleRef, {
        ...role.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`✓ Created role: ${role.data.name}`);
    } catch (error) {
      console.error(`✗ Error creating role ${role.data.name}:`, error);
    }
  }
}

/**
 * Main initialization function
 * Run this once to set up the permissions and roles system
 */
export async function initializeUserManagementSystem(): Promise<void> {
  console.log("🚀 Initializing user management system...\n");

  try {
    // Step 1: Create permissions
    console.log("📋 Creating permissions...");
    const permissionIds = await initializeDefaultPermissions();
    console.log(`\n✓ Created ${permissionIds.length} permissions\n`);

    // Step 2: Create roles
    console.log("👥 Creating default roles...");
    await initializeDefaultRoles(permissionIds);
    console.log("\n✓ Created default roles\n");

    console.log("✅ User management system initialized successfully!");
  } catch (error) {
    console.error("❌ Error initializing user management system:", error);
    throw error;
  }
}
