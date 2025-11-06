# Projects Module - Complete Project Management

Module project management lengkap dengan struktur seperti Jira/ClickUp. Setiap project punya sidebar navigation dengan 10 sections berbeda untuk manage semua aspek project.

## Struktur Project

Setiap project memiliki **10 sections** yang bisa diakses via sidebar:

1. **✅ Tasks** - Task management dengan kanban board (✅ Implemented)
2. **🎯 Epics** - Epic management untuk group tasks (🚧 Coming Soon)
3. **🔄 Status** - Manage workflow statuses (🚧 Coming Soon)
4. **⏱️ Estimation** - Time tracking & estimations (🚧 Coming Soon)
5. **📄 Pages** - Project wiki/documentation (🚧 Coming Soon)
6. **📁 Documents** - File management (🚧 Coming Soon)
7. **🔗 Links** - Important project links (🚧 Coming Soon)
8. **🧪 Test Cases** - QA test scenarios (🚧 Coming Soon)
9. **🔁 Cycles** - Sprint/release cycles (🚧 Coming Soon)
10. **📊 Views** - Custom views (Board, List, Timeline) (🚧 Coming Soon)

## Fitur Utama

### 📋 Projects
- ✅ Buat dan kelola multiple projects
- ✅ Project selector dengan visual indicators
- ✅ Project key untuk task IDs (e.g., PROJ-123)
- ✅ Color coding untuk visual identification
- ✅ Project description dan metadata
- ✅ Sidebar navigation untuk semua sections

### ✅ Tasks (Issues)
- ✅ Task types: Task, Bug, Story, Epic
- ✅ Dynamic status per project
- ✅ Dynamic priority per project
- ✅ Dynamic labels per project (multi-select)
- ✅ Due dates
- ✅ Estimated hours
- ✅ Rich descriptions
- ✅ Assignee support (future: bisa assign ke team members)

### 🎨 Dynamic Workflow per Project

Setiap project punya konfigurasi sendiri yang bisa dikustomisasi:

**Status** - Workflow states
- Default: To Do → In Progress → In Review → Ready for Testing → Done
- Bisa tambah custom status (e.g., "Blocked", "QA", "Deployed")
- Set default status untuk task baru
- Set final status (completed state)
- Color coding

**Priorities** - Task importance
- Default: Critical, High, Medium, Low
- Bisa tambah custom priority
- Set default priority
- Order by importance (lower number = higher priority)
- Color coding

**Labels** - Kategorisasi tasks
- Default: Frontend, Backend, Design, Documentation
- Bisa tambah unlimited custom labels
- Multi-select per task
- Color coding

### 🎯 Board View (Kanban)
- ✅ Kanban board dengan kolom per status
- ✅ Drag & drop to change status (future feature)
- ✅ Task cards dengan info lengkap
- ✅ Visual indicators (type, priority, labels)
- ✅ Task count per status
- ✅ Quick create task per column

## Struktur Data

### Project
```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  key: string; // Project key (e.g., "PROJ")
  userId: string; // Owner
  color?: string;
  icon?: string;
  defaultStatusId?: string; // Default status for new tasks
  defaultPriorityId?: string; // Default priority for new tasks
  createdAt: Date;
  updatedAt: Date;
}
```

### Task
```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  type: "task" | "bug" | "story" | "epic";
  statusId: string; // Reference to ProjectStatus
  priorityId: string; // Reference to ProjectPriority
  projectId: string;
  userId: string; // Creator
  assigneeId?: string; // Assigned user
  labelIds?: string[]; // References to ProjectLabel
  dueDate?: Date;
  estimatedHours?: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### ProjectStatus (Dynamic)
```typescript
interface ProjectStatus {
  id: string;
  name: string;
  color: string;
  order: number;
  projectId: string;
  isDefault?: boolean; // Default status when creating task
  isFinal?: boolean; // Final status (like "Done")
}
```

### ProjectPriority (Dynamic)
```typescript
interface ProjectPriority {
  id: string;
  name: string;
  color: string;
  order: number; // Lower = higher priority
  projectId: string;
  isDefault?: boolean;
}
```

### ProjectLabel (Dynamic)
```typescript
interface ProjectLabel {
  id: string;
  name: string;
  color: string;
  projectId: string;
}
```

## Firestore Collections

### Main Collections
- `projects` - All projects
- `tasks` - All tasks across projects

### Config Collections (per project)
- `project_statuses` - Status definitions per project
- `project_priorities` - Priority definitions per project
- `project_labels` - Label definitions per project

## Default Values

Saat membuat project baru, otomatis dibuatkan:

### Default Statuses
1. **To Do** (gray, default, order: 1)
2. **In Progress** (blue, order: 2)
3. **In Review** (orange, order: 3)
4. **Ready for Testing** (purple, order: 4)
5. **Done** (green, final, order: 5)

### Default Priorities
1. **Critical** (red, order: 1)
2. **High** (orange, order: 2)
3. **Medium** (blue, default, order: 3)
4. **Low** (gray, order: 4)

### Default Labels
1. **Frontend** (blue)
2. **Backend** (green)
3. **Design** (purple)
4. **Documentation** (orange)

## Penggunaan

### Buat Project Baru

```typescript
import { useProjectMutations } from "@/features/projects/hooks";

const { create } = useProjectMutations();

await create({
  name: "My Awesome Project",
  key: "PROJ", // Will be used for task IDs: PROJ-1, PROJ-2, etc.
  description: "Project description",
  color: "#3b82f6",
});
```

### Buat Task Baru

```typescript
import { useTaskMutations } from "@/features/projects/hooks";

const { create } = useTaskMutations();

await create({
  title: "Implement login feature",
  description: "Add email/password login",
  type: "task",
  statusId: "status-id-todo",
  priorityId: "priority-id-medium",
  projectId: "project-id",
  labelIds: ["label-frontend", "label-backend"],
  dueDate: new Date("2025-12-31"),
  estimatedHours: 8,
});
```

### Load Project dengan Data

```typescript
import { useProjectWithData } from "@/features/projects/hooks";

const {
  tasks,
  statuses,
  labels,
  priorities,
  tasksByStatus, // Grouped by status
  tasksWithDetails, // Tasks with status/priority/label objects
  loading,
} = useProjectWithData(projectId);
```

## Customize Workflow

### Tambah Custom Status

```typescript
import { useStatusMutations } from "@/features/projects/hooks";

const { create } = useStatusMutations();

await create(projectId, {
  name: "Testing",
  color: "#f59e0b",
  order: 3, // Position in board
  isDefault: false,
  isFinal: false,
});
```

### Tambah Custom Priority

```typescript
import { usePriorityMutations } from "@/features/projects/hooks";

const { create } = usePriorityMutations();

await create(projectId, {
  name: "Urgent",
  color: "#dc2626",
  order: 0, // Highest priority
  isDefault: false,
});
```

### Tambah Custom Label

```typescript
import { useLabelMutations } from "@/features/projects/hooks";

const { create } = useLabelMutations();

await create(projectId, {
  name: "Mobile",
  color: "#8b5cf6",
});
```

## Firestore Security Rules

Pastikan sudah add rules di Firebase Console (lihat `FIRESTORE_RULES.md`):

```javascript
// Projects
match /projects/{projectId} {
  allow read, write: if request.auth.uid == resource.data.userId;
}

// Tasks
match /tasks/{taskId} {
  allow read, write: if request.auth.uid == resource.data.userId;
}

// Config collections (statuses, labels, priorities)
match /project_statuses/{statusId} {
  allow read, write: if request.auth != null;
}
// Same for project_labels and project_priorities
```

## Required Firestore Indexes

Buat indexes berikut di Firebase Console:

### Projects
- `userId` (asc) + `createdAt` (desc)

### Tasks
- `userId` (asc) + `createdAt` (desc)
- `projectId` (asc) + `createdAt` (desc)

### Project Statuses
- `projectId` (asc) + `order` (asc)

### Project Priorities
- `projectId` (asc) + `order` (asc)

### Project Labels
- `projectId` (asc)

Firebase akan otomatis generate link untuk create indexes saat pertama kali error.

## UI Components

### ProjectFormDialog
Form untuk create/edit project dengan:
- Name, key, description
- Color picker
- Auto-generate project key dari name

### TaskFormDialog
Form lengkap untuk create/edit task dengan:
- Title, description
- Type selector (Task, Bug, Story, Epic)
- Status selector (dynamic dari project)
- Priority selector (dynamic dari project)
- Labels multi-select (dynamic dari project)
- Due date picker
- Estimated hours input

### TaskBoard
Kanban board view dengan:
- Kolom per status (dynamic)
- Task cards dengan visual indicators
- Quick actions (edit, delete)
- Quick create per kolom
- Task count per status

## Tips Penggunaan

### Project Key Best Practices
- Gunakan 3-5 karakter uppercase
- Singkat dan mudah diingat
- Contoh: "PROJ", "DEV", "DESIGN", "MOBILE"

### Workflow Configuration
- Keep statuses simple (3-5 statuses optimal)
- Status order menentukan urutan di board
- Set 1 status sebagai default
- Set 1 status sebagai final (done)

### Priority System
- Lower order = higher priority
- Gunakan color coding konsisten:
  - Critical/Urgent: Red
  - High: Orange
  - Medium: Blue
  - Low: Gray

### Labels
- Gunakan untuk cross-cutting concerns
- Max 8-10 labels per project untuk simplicity
- Color code by domain (Frontend, Backend, Design, etc.)

## Roadmap Features

### 🚧 Planned
- [ ] Drag & drop tasks antar status
- [ ] Task comments/activity log
- [ ] Task attachments
- [ ] Sprint/milestone management
- [ ] Team member assignment (multi-user support)
- [ ] Task templates
- [ ] Bulk operations
- [ ] Filter & search tasks
- [ ] Custom fields per project
- [ ] Time tracking
- [ ] Reports & analytics
- [ ] Export to CSV/JSON
- [ ] Email notifications
- [ ] Task relationships (blocks, depends on)
- [ ] Sub-tasks

## Integration

Module ini sudah terintegrasi dengan:
- ✅ Firebase Authentication (user-specific data)
- ✅ Firestore Database (real-time sync)
- ✅ Main App (tabs navigation)
- ✅ Toast notifications (Sonner)

## Performance

- **Real-time updates**: Menggunakan Firestore subscriptions untuk sync otomatis
- **Indexed queries**: Semua query yang penting sudah di-index
- **Lazy loading**: Config (statuses, labels, priorities) hanya load saat project selected
- **In-memory filtering**: Filter tambahan dilakukan di-memory untuk performa

## Troubleshooting

### Error: "The query requires an index"
1. Copy link dari error message di console
2. Paste di browser
3. Klik "Create Index"
4. Tunggu 1-5 menit sampai status "Enabled"
5. Refresh aplikasi

### Categories tidak muncul
1. Check Firestore Rules sudah dipublish
2. Check indexes sudah dibuat
3. Check console untuk error messages
4. Verify userId matches authenticated user

### Task tidak update real-time
1. Check Firestore subscription masih aktif
2. Check tidak ada error di console
3. Verify Firestore Rules sudah benar

---

**Last Updated**: 2025-10-30
**Firebase Project**: radas-prod
**Environment**: Production
