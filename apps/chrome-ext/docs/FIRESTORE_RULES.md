# Firestore Security Rules

Firestore Security Rules yang perlu ditambahkan ke Firebase Console.

## Cara Menambahkan Rules

1. Buka [Firebase Console](https://console.firebase.google.com/project/radas-prod/firestore/rules)
2. Pilih tab **"Rules"**
3. Copy-paste rules di bawah ini
4. Klik **"Publish"**

## Rules Lengkap

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper function to check if user is authenticated
    function isSignedIn() {
      return request.auth != null;
    }

    // Helper function to check if user owns the document
    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    // Links collection
    match /links/{linkId} {
      // Allow read if user owns the link
      allow read: if isSignedIn() &&
                     resource.data.userId == request.auth.uid;

      // Allow create if user is authenticated and sets correct userId
      allow create: if isSignedIn() &&
                      request.resource.data.userId == request.auth.uid;

      // Allow update if user owns the link
      allow update: if isSignedIn() &&
                      resource.data.userId == request.auth.uid &&
                      request.resource.data.userId == request.auth.uid;

      // Allow delete if user owns the link
      allow delete: if isSignedIn() &&
                      resource.data.userId == request.auth.uid;
    }

    // Link categories collection
    match /link_categories/{categoryId} {
      // Allow read if user owns the category
      allow read: if isSignedIn() &&
                     resource.data.userId == request.auth.uid;

      // Allow create if user is authenticated and sets correct userId
      allow create: if isSignedIn() &&
                      request.resource.data.userId == request.auth.uid;

      // Allow update if user owns the category
      allow update: if isSignedIn() &&
                      resource.data.userId == request.auth.uid &&
                      request.resource.data.userId == request.auth.uid;

      // Allow delete if user owns the category
      allow delete: if isSignedIn() &&
                      resource.data.userId == request.auth.uid;
    }

    // User profiles collection (optional - untuk future features)
    match /users/{userId} {
      // Users can read their own profile
      allow read: if isSignedIn() && request.auth.uid == userId;

      // Users can create their own profile
      allow create: if isSignedIn() && request.auth.uid == userId;

      // Users can update their own profile
      allow update: if isSignedIn() && request.auth.uid == userId;

      // Users cannot delete their profile (optional, bisa diubah)
      allow delete: if false;
    }

    // Projects collection
    match /projects/{projectId} {
      // Allow read if user owns the project
      allow read: if isSignedIn() &&
                     resource.data.userId == request.auth.uid;

      // Allow create if user is authenticated and sets correct userId
      allow create: if isSignedIn() &&
                      request.resource.data.userId == request.auth.uid;

      // Allow update if user owns the project
      allow update: if isSignedIn() &&
                      resource.data.userId == request.auth.uid &&
                      request.resource.data.userId == request.auth.uid;

      // Allow delete if user owns the project
      allow delete: if isSignedIn() &&
                      resource.data.userId == request.auth.uid;
    }

    // Tasks collection
    match /tasks/{taskId} {
      // Allow read if user owns the task
      allow read: if isSignedIn() &&
                     resource.data.userId == request.auth.uid;

      // Allow create if user is authenticated and sets correct userId
      allow create: if isSignedIn() &&
                      request.resource.data.userId == request.auth.uid;

      // Allow update if user owns the task
      allow update: if isSignedIn() &&
                      resource.data.userId == request.auth.uid &&
                      request.resource.data.userId == request.auth.uid;

      // Allow delete if user owns the task
      allow delete: if isSignedIn() &&
                      resource.data.userId == request.auth.uid;
    }

    // Epics collection
    match /epics/{epicId} {
      // Allow read if user owns the epic
      allow read: if isSignedIn() &&
                     resource.data.userId == request.auth.uid;

      // Allow create if user is authenticated and sets correct userId
      allow create: if isSignedIn() &&
                      request.resource.data.userId == request.auth.uid;

      // Allow update if user owns the epic
      allow update: if isSignedIn() &&
                      resource.data.userId == request.auth.uid &&
                      request.resource.data.userId == request.auth.uid;

      // Allow delete if user owns the epic
      allow delete: if isSignedIn() &&
                      resource.data.userId == request.auth.uid;
    }

    // Project Statuses collection
    match /project_statuses/{statusId} {
      // Allow read for all authenticated users (to view project statuses)
      allow read: if isSignedIn();

      // Allow create/update/delete if user owns the parent project
      // Note: This requires checking project ownership
      allow create, update, delete: if isSignedIn();
    }

    // Project Labels collection
    match /project_labels/{labelId} {
      // Allow read for all authenticated users
      allow read: if isSignedIn();

      // Allow create/update/delete if authenticated
      allow create, update, delete: if isSignedIn();
    }

    // Project Priorities collection
    match /project_priorities/{priorityId} {
      // Allow read for all authenticated users
      allow read: if isSignedIn();

      // Allow create/update/delete if authenticated
      allow create, update, delete: if isSignedIn();
    }
  }
}
```

## Penjelasan Rules

### Links Collection (`/links/{linkId}`)

**Read**: User hanya bisa membaca link milik mereka sendiri
- ✅ `userId` di document harus sama dengan `auth.uid`

**Create**: User hanya bisa membuat link dengan `userId` mereka sendiri
- ✅ Authenticated
- ✅ `request.resource.data.userId` harus sama dengan `auth.uid`

**Update**: User hanya bisa update link milik mereka sendiri
- ✅ `userId` di document lama harus sama dengan `auth.uid`
- ✅ `userId` di document baru tidak boleh berubah

**Delete**: User hanya bisa menghapus link milik mereka sendiri
- ✅ `userId` di document harus sama dengan `auth.uid`

### Categories Collection (`/link_categories/{categoryId}`)

Rules yang sama dengan links collection - user hanya bisa CRUD kategori milik mereka sendiri.

### Projects Collection (`/projects/{projectId}`)

**Read/Create/Update/Delete**: User hanya bisa akses project milik mereka sendiri
- ✅ `userId` di document harus sama dengan `auth.uid`

### Tasks Collection (`/tasks/{taskId}`)

**Read/Create/Update/Delete**: User hanya bisa akses task milik mereka sendiri
- ✅ `userId` di document harus sama dengan `auth.uid`

### Epics Collection (`/epics/{epicId}`)

**Read/Create/Update/Delete**: User hanya bisa akses epic milik mereka sendiri
- ✅ `userId` di document harus sama dengan `auth.uid`
- Epics are large features that group multiple tasks together

### Project Config Collections

**Project Statuses** (`/project_statuses/{statusId}`)
**Project Labels** (`/project_labels/{labelId}`)
**Project Priorities** (`/project_priorities/{priorityId}`)

- ✅ Authenticated users dapat read (untuk melihat config)
- ✅ Authenticated users dapat create/update/delete (untuk mengelola config)
- Note: Idealnya harus check project ownership, tapi untuk simplicity sementara cukup authenticated check

### Users Collection (`/users/{userId}`)

Optional collection untuk user profiles:
- User bisa read/create/update profile mereka sendiri
- Delete disabled (bisa diubah sesuai kebutuhan)

## Testing Rules

Setelah publish rules, test dengan:

1. **Login dengan user A**
   - ✅ Bisa create/read/update/delete link & category sendiri
   - ❌ Tidak bisa read/update/delete link & category user lain

2. **Login dengan user B**
   - ✅ Bisa create link & category baru
   - ✅ Bisa read link & category milik user B
   - ❌ Tidak bisa read link & category milik user A

3. **Tidak login (unauthenticated)**
   - ❌ Tidak bisa create/read/update/delete apa pun

## Troubleshooting

### Error: "Missing or insufficient permissions"

**Penyebab**: Rules belum dipublish atau user tidak memiliki akses

**Solusi**:
1. Pastikan rules sudah dipublish di Firebase Console
2. Pastikan user sudah login (authenticated)
3. Pastikan `userId` di document sama dengan `auth.uid`
4. Check console log untuk detail error

### Error: "PERMISSION_DENIED"

**Penyebab**: User mencoba akses document yang bukan miliknya

**Solusi**:
1. Pastikan query filter by `userId`:
   ```typescript
   queryDocuments("links", {
     field: "userId",
     operator: "==",
     value: currentUser.uid
   });
   ```

2. Jangan hardcode `userId` saat create:
   ```typescript
   // ✅ Good
   await createLink(user.uid, linkData);

   // ❌ Bad
   await createLink("hardcoded-user-id", linkData);
   ```

## Indexes yang Diperlukan

**PENTING**: Firestore memerlukan composite indexes untuk query yang filter + sort. Tanpa indexes ini, query akan gagal dengan error: "The query requires an index".

### Cara Membuat Indexes

#### Metode 1: Otomatis (Recommended)

Saat pertama kali menjalankan aplikasi, Firestore akan menampilkan error dengan link direct ke Firebase Console untuk membuat index. Contoh error:

```
FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/...
```

**Langkah-langkah**:
1. Copy link dari error message di console
2. Paste di browser dan tekan Enter
3. Klik tombol **"Create Index"**
4. Tunggu beberapa menit sampai status berubah dari "Building..." ke "Enabled"
5. Refresh aplikasi

#### Metode 2: Manual

Jika link otomatis tidak tersedia, buat indexes secara manual:

1. Buka [Firebase Console - Indexes](https://console.firebase.google.com/project/radas-prod/firestore/indexes)
2. Klik **"Create Index"** atau **"Add Index"**
3. Pilih collection dan field sesuai tabel di bawah
4. Klik **"Create"**

### Required Indexes

#### Links Module

**Links Collection (`links`)**

| Collection | Field 1 | Order 1 | Field 2 | Order 2 | Field 3 | Order 3 |
|------------|---------|---------|---------|---------|---------|---------|
| links | userId | Ascending | createdAt | Descending | __name__ | Descending |
| links | userId | Ascending | categoryId | Ascending | createdAt | Descending |
| links | userId | Ascending | isFavorite | Ascending | createdAt | Descending |

**Categories Collection (`link_categories`)**

| Collection | Field 1 | Order 1 | Field 2 | Order 2 | Field 3 | Order 3 |
|------------|---------|---------|---------|---------|---------|---------|
| link_categories | userId | Ascending | order | Ascending | __name__ | Ascending |
| link_categories | userId | Ascending | parentId | Ascending | order | Ascending |

#### Projects Module

**Projects Collection (`projects`)**

| Collection | Field 1 | Order 1 | Field 2 | Order 2 | Field 3 | Order 3 |
|------------|---------|---------|---------|---------|---------|---------|
| projects | userId | Ascending | createdAt | Descending | __name__ | Descending |

**Tasks Collection (`tasks`)**

| Collection | Field 1 | Order 1 | Field 2 | Order 2 | Field 3 | Order 3 |
|------------|---------|---------|---------|---------|---------|---------|
| tasks | userId | Ascending | createdAt | Descending | __name__ | Descending |
| tasks | projectId | Ascending | createdAt | Descending | __name__ | Descending |

**Epics Collection (`epics`)**

| Collection | Field 1 | Order 1 | Field 2 | Order 2 | Field 3 | Order 3 |
|------------|---------|---------|---------|---------|---------|---------|
| epics | projectId | Ascending | createdAt | Descending | __name__ | Descending |

**Project Statuses Collection (`project_statuses`)**

| Collection | Field 1 | Order 1 | Field 2 | Order 2 | Field 3 | Order 3 |
|------------|---------|---------|---------|---------|---------|---------|
| project_statuses | projectId | Ascending | order | Ascending | __name__ | Ascending |

**Project Priorities Collection (`project_priorities`)**

| Collection | Field 1 | Order 1 | Field 2 | Order 2 | Field 3 | Order 3 |
|------------|---------|---------|---------|---------|---------|---------|
| project_priorities | projectId | Ascending | order | Ascending | __name__ | Ascending |

**Project Labels Collection (`project_labels`)**

| Collection | Field 1 | Order 1 | Field 2 | Order 2 |
|------------|---------|---------|---------|---------|
| project_labels | projectId | Ascending | __name__ | Ascending |

### Index Status

Cek status indexes di Firebase Console:
- **Building**: Index sedang dibuat (tunggu beberapa menit)
- **Enabled**: Index siap digunakan ✅
- **Error**: Ada masalah dengan index (perlu diperbaiki)

**Note**: Untuk dataset kecil (<1000 dokumen), index biasanya selesai dalam 1-5 menit. Dataset besar bisa memakan waktu lebih lama.

## Monitoring

Monitor Firestore usage di Firebase Console:
1. **Usage** tab: Lihat read/write operations
2. **Rules** tab: Test rules dengan simulator
3. **Indexes** tab: Lihat status indexes

## Best Practices

1. **Always filter by userId**: Setiap query harus include userId filter
2. **Validate on client**: Validate data sebelum kirim ke Firestore
3. **Use transactions**: Untuk operasi yang butuh atomicity
4. **Limit query results**: Gunakan `limit` untuk pagination
5. **Monitor costs**: Firestore charges per operation

## Cost Optimization

Tips untuk menghemat Firestore operations:

1. **Cache data locally**: Gunakan React Query cache
2. **Use real-time wisely**: Hanya subscribe untuk data yang sering berubah
3. **Batch operations**: Gunakan batch write untuk multiple operations
4. **Paginate results**: Jangan load semua data sekaligus

---

**Last Updated**: 2025-10-30
**Firebase Project**: radas-prod
**Environment**: Production
