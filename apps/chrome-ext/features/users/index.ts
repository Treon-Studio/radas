// Entity exports
export * from "./entity";

// Service exports
export * from "./services";

// Hook exports
export * from "./hooks";

// Component exports
export { UserFormDialog } from "./components/user-form-dialog";
export { RoleFormDialog } from "./components/role-form-dialog";
export { PermissionFormDialog } from "./components/permission-form-dialog";

// Section exports
export { UsersSection } from "./sections/users-section";
export { RolesSection } from "./sections/roles-section";
export { PermissionsSection } from "./sections/permissions-section";

// Script exports
export { initializeUserManagementSystem } from "./scripts/init-permissions";
export { setupFirebase, isFirebaseSetup } from "./scripts/setup-firebase";
export { resetFirebaseDatabase, deleteCurrentAuthUser, completeReset } from "./scripts/reset-firebase";

// Page exports
export { SetupPage } from "./pages/setup-page";
