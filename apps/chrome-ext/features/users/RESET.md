# 🔥 Firebase Database Reset Guide

Panduan untuk reset database Firebase dan mulai dari awal.

## ⚠️ PERINGATAN

**Script ini akan MENGHAPUS SEMUA DATA dari Firestore!**

Data yang akan dihapus:
- ✅ Semua permissions (41+ documents)
- ✅ Semua roles (admin, member, viewer)
- ✅ Semua users
- ✅ Semua workspaces
- ✅ Semua projects
- ✅ Semua tasks, epics, pages, documents, links, test cases, dll
- ✅ localStorage

**⚠️ TIDAK BISA DI-UNDO!**

---

## 🚀 Cara Menggunakan

### **Option 1: Via Browser Console (Recommended)**

1. **Buka Chrome Extension Popup**
   ```
   Klik icon extension di toolbar
   ```

2. **Buka Developer Tools**
   ```
   Klik kanan → Inspect
   Atau tekan F12
   ```

3. **Jalankan Script di Console**

   **Pilih salah satu:**

   #### A. Reset Database Saja (Tanpa hapus auth user)
   ```javascript
   // Import script
   import { resetFirebaseDatabase } from '@/features/users';

   // Run reset
   const result = await resetFirebaseDatabase();
   console.log(result);
   ```

   **Atau langsung via window object:**
   ```javascript
   await window.resetFirebase();
   ```

   #### B. Complete Reset (Database + Auth User)
   ```javascript
   // Import script
   import { completeReset } from '@/features/users';

   // Run complete reset
   const result = await completeReset();
   console.log(result);
   ```

   **Atau langsung via window object:**
   ```javascript
   await window.completeFirebaseReset();
   ```

   #### C. Hapus Auth User Saja
   ```javascript
   await window.deleteAuthUser();
   ```

4. **Reload Extension**
   ```
   - Klik icon reload di Chrome Extensions page
   - Atau tutup & buka lagi popup
   ```

5. **Setup Page Akan Muncul**
   ```
   Isi form dengan credentials admin baru
   Klik "Initialize Firebase"
   ```

---

### **Option 2: Via TypeScript Code**

Jika Anda ingin memanggil dari code:

```typescript
import {
  resetFirebaseDatabase,
  deleteCurrentAuthUser,
  completeReset
} from '@/features/users';

// Option 1: Reset database saja
const dbResult = await resetFirebaseDatabase();
if (dbResult.success) {
  console.log(`Deleted ${dbResult.totalDeleted} documents`);
}

// Option 2: Hapus auth user saja
const authResult = await deleteCurrentAuthUser();
if (authResult.success) {
  console.log('Auth user deleted');
}

// Option 3: Complete reset (all)
const fullResult = await completeReset();
if (fullResult.success) {
  console.log('Complete reset successful');
  // Reload window
  window.location.reload();
}
```

---

## 📊 Output Example

Ketika script berjalan, Anda akan melihat:

```
🔥 DANGER: Starting Firebase Database Reset...

⚠️  This will DELETE ALL DATA!

🗑️  Deleting collection: time_entries...
✓ Deleted 0 documents from time_entries

🗑️  Deleting collection: tasks...
✓ Deleted 5 documents from tasks

🗑️  Deleting collection: projects...
✓ Deleted 2 documents from projects

🗑️  Deleting collection: users...
✓ Deleted 1 documents from users

🗑️  Deleting collection: workspaces...
✓ Deleted 1 documents from workspaces

🗑️  Deleting collection: roles...
✓ Deleted 3 documents from roles

🗑️  Deleting collection: permissions...
✓ Deleted 41 documents from permissions

🧹 Clearing localStorage...
✓ localStorage cleared

==================================================
📊 RESET SUMMARY:
==================================================
Total documents deleted: 53

Deleted per collection:
  - tasks: 5
  - projects: 2
  - users: 1
  - workspaces: 1
  - roles: 3
  - permissions: 41

==================================================
✅ Database reset completed successfully!

🔄 Next steps:
1. Reload the extension
2. Setup page will appear automatically
3. Fill in admin credentials
4. Click 'Initialize Firebase'
==================================================
```

---

## 🔄 After Reset

Setelah reset berhasil:

1. **Reload extension** (penting!)
2. **Setup Page akan muncul otomatis**
3. **Isi form setup:**
   - Admin Email (contoh: admin@example.com)
   - Admin Password (min 6 karakter)
   - Admin Display Name (contoh: Admin User)
4. **Klik "Initialize Firebase"**
5. **Tunggu proses selesai** (beberapa detik)
6. **Login dengan credentials baru**

---

## ❓ FAQ

### Q: Apakah saya perlu logout dulu?
**A:** Tidak perlu untuk `resetFirebaseDatabase()`. Tapi jika ingin hapus auth user juga (`completeReset()`), sebaiknya logout atau akan diminta login ulang.

### Q: Bagaimana jika saya punya data production?
**A:** **JANGAN JALANKAN SCRIPT INI DI PRODUCTION!** Script ini untuk development saja. Untuk production, buat backup dulu.

### Q: Apakah bisa di-undo?
**A:** **TIDAK!** Data yang sudah dihapus tidak bisa dikembalikan. Pastikan Anda yakin sebelum menjalankan.

### Q: Kenapa perlu reset?
**A:** Karena struktur database berubah drastis (workspace-based architecture). Data lama incompatible dengan struktur baru.

### Q: Apakah file lokal ikut terhapus?
**A:** Tidak. Hanya data di Firestore dan localStorage. File code Anda aman.

---

## 🛠️ Troubleshooting

### Error: "requires-recent-login"
**Solution:** Logout dan login kembali, lalu jalankan script lagi.

### Error: "Permission denied"
**Solution:** Check Firestore rules. Pastikan user Anda punya akses write.

### Setup Page tidak muncul setelah reset
**Solution:**
1. Hard reload browser (Ctrl+Shift+R)
2. Clear browser cache
3. Reload extension dari Chrome Extensions page

### Script tidak berjalan
**Solution:**
1. Pastikan Anda di context yang benar (popup window, bukan background)
2. Check console untuk error messages
3. Pastikan Firebase initialized dengan benar

---

## 📝 Notes

- Script ini **safe untuk development**
- Jangan pernah jalankan di **production** tanpa backup
- Setelah reset, semua users harus di-create ulang
- Semua projects & tasks akan hilang
- Setup akan create default workspace otomatis

---

## 🆘 Need Help?

Jika mengalami masalah:
1. Check browser console untuk error messages
2. Pastikan Firebase config benar di `.env`
3. Verify Firestore rules
4. Contact development team
