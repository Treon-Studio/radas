# Firebase Setup Guide

Panduan lengkap untuk setup awal Firebase collections dan admin user.

## 🚀 Quick Start

Aplikasi akan otomatis mendeteksi apakah Firebase sudah di-setup atau belum. Jika belum, akan muncul halaman setup secara otomatis.

### Cara Setup:

1. **Buka aplikasi** untuk pertama kali
2. Jika Firebase belum di-setup, akan muncul **Setup Page**
3. Isi form setup:
   - **Admin Email**: Email untuk akun admin (contoh: admin@example.com)
   - **Admin Password**: Password minimal 6 karakter
   - **Admin Display Name**: Nama tampilan (contoh: Admin User)
4. Klik **"Initialize Firebase"**
5. Tunggu beberapa detik sampai proses selesai
6. Aplikasi akan reload otomatis

## 📋 Apa yang Akan Dibuat?

Setup script akan membuat:

### 1. **Permissions Collection** (41 permissions)

Permissions untuk semua resources:

#### Project Permissions (4)
- `create_project` - Create new projects
- `read_project` - View project details
- `update_project` - Edit project settings
- `delete_project` - Delete projects

#### Task Permissions (4)
- `create_task` - Create new tasks
- `read_task` - View task details
- `update_task` - Edit task details
- `delete_task` - Delete tasks

#### Epic Permissions (4)
- `create_epic` - Create new epics
- `read_epic` - View epic details
- `update_epic` - Edit epic details
- `delete_epic` - Delete epics

#### Page Permissions (4)
- `create_page` - Create new pages
- `read_page` - View page content
- `update_page` - Edit page content
- `delete_page` - Delete pages

#### Document Permissions (4)
- `create_document` - Upload new documents
- `read_document` - View documents
- `update_document` - Edit document metadata
- `delete_document` - Delete documents

#### Link Permissions (4)
- `create_link` - Create new links
- `read_link` - View links
- `update_link` - Edit links
- `delete_link` - Delete links

#### Test Case Permissions (4)
- `create_test_case` - Create new test cases
- `read_test_case` - View test cases
- `update_test_case` - Edit test cases
- `delete_test_case` - Delete test cases

#### User Permissions (4)
- `create_user` - Add new users
- `read_user` - View user details
- `update_user` - Edit user details
- `delete_user` - Delete users

#### Role Permissions (4)
- `create_role` - Create new roles
- `read_role` - View role details
- `update_role` - Edit role permissions
- `delete_role` - Delete roles

#### Admin Permission (1)
- `manage_all` - Full access to all resources

### 2. **Roles Collection** (3 system roles)

#### Admin Role
- **ID**: `admin`
- **Permissions**: All 41 permissions (full access)
- **Description**: Full access to all features and settings
- **Is System**: Yes (cannot be deleted)

#### Member Role
- **ID**: `member`
- **Permissions**: 21 permissions
  - Create, read, update projects
  - Create, read, update, delete tasks
  - Create, read, update epics
  - Create, read, update pages, documents, links, test cases
  - Read users and roles
- **Description**: Can create and manage projects and tasks
- **Is System**: Yes (cannot be deleted)

#### Viewer Role
- **ID**: `viewer`
- **Permissions**: 9 read-only permissions
  - Read projects, tasks, epics, pages, documents, links, test cases, users, roles
- **Description**: Read-only access to projects
- **Is System**: Yes (cannot be deleted)

### 3. **Users Collection** (1 admin user)

Creates the first admin user:
- Email: (yang Anda masukkan)
- Display Name: (yang Anda masukkan)
- Role: Admin
- Status: Active

## 🔧 Manual Setup (Alternative)

Jika Anda ingin menjalankan setup secara manual lewat console:

```typescript
import { setupFirebase } from "@/features/users/scripts/setup-firebase";

// Run setup
await setupFirebase({
  adminEmail: "admin@example.com",
  adminPassword: "YourSecurePassword123",
  adminDisplayName: "Admin User",
});
```

## 🔍 Troubleshooting

### Issue: Setup page tidak muncul
**Solution**:
- Clear browser cache dan reload
- Check console untuk error
- Pastikan Firebase config sudah benar di `.env`

### Issue: "Email already in use"
**Solution**:
- Email sudah terdaftar di Firebase Auth
- Gunakan email yang berbeda
- Atau hapus user dari Firebase Auth Console

### Issue: Setup failed tanpa pesan error
**Solution**:
- Check browser console untuk error detail
- Pastikan koneksi internet stabil
- Verify Firebase credentials di `.env`
- Check Firestore rules (pastikan allow write)

### Issue: Roles sudah ada tapi user belum bisa login
**Solution**:
1. Check di Firestore Console:
   - Collection `roles` → Document `admin` harus exist
   - Collection `users` → Document dengan UID user harus exist
2. Pastikan field `roleId` di user document = "admin"
3. Logout dan login kembali

## 📝 Firestore Structure After Setup

```
firestore/
├── permissions/
│   ├── create_project
│   ├── read_project
│   ├── update_project
│   ├── delete_project
│   ├── create_task
│   └── ... (41 total)
│
├── roles/
│   ├── admin (41 permissions)
│   ├── member (21 permissions)
│   └── viewer (9 permissions)
│
└── users/
    └── {admin-uid}
        ├── email: "admin@example.com"
        ├── displayName: "Admin User"
        ├── roleId: "admin"
        └── status: "active"
```

## 🔐 Security Notes

1. **Admin Password**:
   - Gunakan password yang kuat (min 6 karakter)
   - Jangan share password admin ke siapa pun
   - Ganti password setelah setup jika perlu

2. **Firestore Rules**:
   - Pastikan Firestore rules sudah di-setup (lihat `README.md`)
   - Rules akan protect data berdasarkan user permissions

3. **First User**:
   - User pertama yang di-create adalah super admin
   - Bisa membuat user lain dan assign roles
   - Bisa manage semua data di aplikasi

## ✅ Post-Setup Checklist

Setelah setup selesai:

- [ ] Login dengan admin credentials
- [ ] Verify menu Workspace muncul di bottom navigation
- [ ] Test create user baru
- [ ] Test assign role ke user
- [ ] Create project pertama
- [ ] Verify permissions working correctly

## 🆘 Need Help?

Jika mengalami masalah:
1. Check console log untuk error detail
2. Verify Firebase config
3. Check Firestore rules
4. Review troubleshooting section di atas
5. Contact support team

## 🔄 Reset Setup

Jika perlu reset dan setup ulang:

1. **Hapus Collections di Firestore**:
   - Delete collection `permissions`
   - Delete collection `roles`
   - Delete collection `users`

2. **Hapus User di Firebase Auth**:
   - Go to Firebase Console → Authentication
   - Delete admin user

3. **Reload Aplikasi**:
   - Setup page akan muncul kembali
   - Run setup dari awal

**PERHATIAN**: Reset akan menghapus semua data! Backup dulu jika diperlukan.
