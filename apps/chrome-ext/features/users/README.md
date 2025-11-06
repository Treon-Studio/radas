# User Management System

Sistem manajemen user, role, dan permissions untuk aplikasi Radas.

## Overview

Sistem ini menyediakan:
- **Users**: Manajemen user accounts
- **Roles**: Pengelompokan permissions (Admin, Member, Viewer, dan custom roles)
- **Permissions**: Kontrol akses granular untuk setiap resource (project, task, epic, dll)

## Database Collections

### 1. `users`
```typescript
{
  id: string;              // Firebase Auth UID
  email: string;
  displayName: string;
  photoURL?: string;
  roleId: string;          // Reference ke roles collection
  status: "active" | "inactive" | "pending";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
  createdBy?: string;
}
```

### 2. `roles`
```typescript
{
  id: string;
  name: string;
  description: string;
  permissionIds: string[]; // Array of permission IDs
  isSystem: boolean;       // true untuk Admin, Member, Viewer
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
```

### 3. `permissions`
```typescript
{
  id: string;
  name: string;
  description: string;
  action: "create" | "read" | "update" | "delete" | "manage";
  resource: "project" | "task" | "epic" | "page" | "document" | "link" | "test_case" | "user" | "role" | "all";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Setup & Initialization

### ⚡ Automatic Setup (Recommended)

Aplikasi akan otomatis mendeteksi apakah Firebase sudah di-setup saat pertama kali dibuka.

**Cara Setup:**
1. Buka aplikasi untuk pertama kali
2. Jika belum setup, akan muncul **Setup Page** otomatis
3. Isi form dengan data admin:
   - Admin Email (contoh: admin@example.com)
   - Admin Password (minimal 6 karakter)
   - Admin Display Name (contoh: Admin User)
4. Klik **"Initialize Firebase"**
5. Tunggu beberapa detik
6. Aplikasi akan reload otomatis
7. Login dengan credentials yang baru dibuat

**Yang akan dibuat:**
- **41 default permissions** untuk semua resources
- **3 system roles**:
  - **Admin**: Full access (41 permissions)
  - **Member**: Can create/read/update projects dan tasks (21 permissions)
  - **Viewer**: Read-only access (9 permissions)
- **1 admin user** dengan credentials yang Anda masukkan

Lihat [SETUP.md](./SETUP.md) untuk panduan lengkap.

### 🔧 Manual Setup (Alternative)

Jika ingin setup manual via console:

```typescript
import { setupFirebase } from "@/features/users";

await setupFirebase({
  adminEmail: "admin@example.com",
  adminPassword: "YourSecurePassword123",
  adminDisplayName: "Admin User",
});
```

### 2. Firestore Security Rules

Tambahkan rules berikut ke Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function getUserRole(userId) {
      return get(/databases/$(database)/documents/users/$(userId)).data.roleId;
    }

    function hasPermission(userId, action, resource) {
      let roleId = getUserRole(userId);
      let role = get(/databases/$(database)/documents/roles/$(roleId)).data;
      let permissions = role.permissionIds;

      // Check for specific permission or manage:all
      return permissions.hasAny([action + '_' + resource, 'manage_all']);
    }

    // Users collection
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow create: if hasPermission(request.auth.uid, 'create', 'user');
      allow update: if hasPermission(request.auth.uid, 'update', 'user')
                    || request.auth.uid == userId; // Users can update their own profile
      allow delete: if hasPermission(request.auth.uid, 'delete', 'user');
    }

    // Roles collection
    match /roles/{roleId} {
      allow read: if isAuthenticated();
      allow create: if hasPermission(request.auth.uid, 'create', 'role');
      allow update: if hasPermission(request.auth.uid, 'update', 'role');
      allow delete: if hasPermission(request.auth.uid, 'delete', 'role')
                    && !resource.data.isSystem; // Cannot delete system roles
    }

    // Permissions collection
    match /permissions/{permissionId} {
      allow read: if isAuthenticated();
      allow write: if hasPermission(request.auth.uid, 'manage', 'all'); // Only admins
    }
  }
}
```

## Usage

### Hooks

#### useUsers()
Mengambil semua users dengan realtime updates:

```typescript
import { useUsers } from "@/features/users/hooks";

function MyComponent() {
  const { users, loading, error } = useUsers();

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.displayName}</div>
      ))}
    </div>
  );
}
```

#### useUsersWithRoles()
Mengambil users dengan role details:

```typescript
import { useUsersWithRoles } from "@/features/users/hooks";

function MyComponent() {
  const { usersWithRoles, loading } = useUsersWithRoles();

  return (
    <div>
      {usersWithRoles.map(user => (
        <div key={user.id}>
          {user.displayName} - {user.role.name}
        </div>
      ))}
    </div>
  );
}
```

#### useRoles()
Mengambil semua roles:

```typescript
import { useRoles } from "@/features/users/hooks";

function MyComponent() {
  const { roles, loading, error } = useRoles();

  return (
    <div>
      {roles.map(role => (
        <div key={role.id}>{role.name}</div>
      ))}
    </div>
  );
}
```

#### useRolesWithPermissions()
Mengambil roles dengan permission details:

```typescript
import { useRolesWithPermissions } from "@/features/users/hooks";

function MyComponent() {
  const { rolesWithPermissions, loading } = useRolesWithPermissions();

  return (
    <div>
      {rolesWithPermissions.map(role => (
        <div key={role.id}>
          <h3>{role.name}</h3>
          <p>{role.permissions.length} permissions</p>
        </div>
      ))}
    </div>
  );
}
```

#### usePermissionCheck()
Cek apakah user memiliki permission tertentu:

```typescript
import { usePermissionCheck } from "@/features/users/hooks";

function MyComponent() {
  const { hasPermission, canCreate, canUpdate, canDelete } = usePermissionCheck();

  // Check specific permission
  const checkPermission = async () => {
    const canCreateProject = await canCreate("project");
    if (canCreateProject) {
      // Show create button
    }
  };

  return <button onClick={checkPermission}>Check Permission</button>;
}
```

#### useCurrentUser()
Mengambil current logged in user dengan role:

```typescript
import { useCurrentUser } from "@/features/users/hooks";

function MyComponent() {
  const { currentUser, loading, error } = useCurrentUser();

  if (!currentUser) return <div>Not logged in</div>;

  return (
    <div>
      <h1>{currentUser.displayName}</h1>
      <p>Role: {currentUser.role.name}</p>
    </div>
  );
}
```

### Mutations

#### Create User

```typescript
import { useUserMutations } from "@/features/users/hooks";

function MyComponent() {
  const userMutations = useUserMutations();

  const handleCreateUser = async () => {
    const result = await userMutations.create({
      email: "user@example.com",
      displayName: "John Doe",
      roleId: "member",
      password: "password123",
    });

    if (result.success) {
      console.log("User created:", result.id);
    }
  };

  return <button onClick={handleCreateUser}>Create User</button>;
}
```

#### Update User

```typescript
const handleUpdateUser = async (userId: string) => {
  const result = await userMutations.update(userId, {
    displayName: "Jane Doe",
    roleId: "admin",
  });

  if (result.success) {
    console.log("User updated");
  }
};
```

#### Create Role

```typescript
import { useRoleMutations } from "@/features/users/hooks";

function MyComponent() {
  const roleMutations = useRoleMutations();

  const handleCreateRole = async () => {
    const result = await roleMutations.create({
      name: "Project Manager",
      description: "Can manage projects and tasks",
      permissionIds: ["create_project", "read_project", "update_project"],
    });

    if (result.success) {
      console.log("Role created:", result.id);
    }
  };

  return <button onClick={handleCreateRole}>Create Role</button>;
}
```

## Components

### UsersSection
Component untuk menampilkan dan mengelola users:

```typescript
import { UsersSection } from "@/features/users/sections/users-section";

function MyApp() {
  return <UsersSection />;
}
```

### RolesSection
Component untuk menampilkan dan mengelola roles:

```typescript
import { RolesSection } from "@/features/users/sections/roles-section";

function MyApp() {
  return <RolesSection />;
}
```

## Permission System

### Permission Actions
- `create` - Create new resources
- `read` - View resources
- `update` - Edit existing resources
- `delete` - Delete resources
- `manage` - Full control (admin only)

### Permission Resources
- `project` - Projects
- `task` - Tasks
- `epic` - Epics
- `page` - Wiki pages
- `document` - Documents
- `link` - Links
- `test_case` - Test cases
- `user` - Users
- `role` - Roles
- `all` - All resources (admin only)

### Checking Permissions Programmatically

```typescript
import { checkUserPermission } from "@/features/users/services";

// Check if user can create projects
const canCreate = await checkUserPermission(
  userId,
  "create",
  "project"
);

if (canCreate) {
  // Show create project button
}
```

## Default Roles

### Admin
- **Permissions**: `manage:all` (full access)
- **Description**: Full access to all features and settings
- **Use Case**: System administrators

### Member
- **Permissions**:
  - Create, read, update projects
  - Create, read, update, delete tasks
  - Create, read, update epics
  - Create, read, update pages, documents, links, test cases
  - Read users and roles
- **Description**: Can create and manage projects and tasks
- **Use Case**: Team members who actively work on projects

### Viewer
- **Permissions**: Read-only access to all resources
- **Description**: Read-only access to projects
- **Use Case**: Stakeholders, clients, or observers

## Best Practices

1. **Always check permissions** before showing UI elements or performing actions
2. **Use system roles** (Admin, Member, Viewer) for most users
3. **Create custom roles** only when specific permission combinations are needed
4. **Don't delete system roles** - they cannot be deleted by design
5. **Audit permission changes** - track who modifies roles and permissions
6. **Test with different roles** - ensure UI and functionality work for all user types

## Troubleshooting

### Issue: User can't see certain features
- Check user's role in Firestore
- Verify role has the required permissions
- Check Firestore security rules

### Issue: Can't delete a role
- System roles (Admin, Member, Viewer) cannot be deleted
- Roles assigned to users cannot be deleted - reassign users first

### Issue: Permission checks not working
- Ensure user document exists in Firestore
- Verify roleId in user document is valid
- Check that role has the required permissions
