# Firestore Security Rules Setup

## Problem
Anda mendapatkan error "Missing or insufficient permissions" karena Firestore Security Rules terlalu ketat.

## Solution

### Option 1: Deploy via Firebase CLI (Recommended)

1. **Install Firebase CLI** (jika belum ada):
```bash
npm install -g firebase-tools
```

2. **Login ke Firebase**:
```bash
firebase login
```

3. **Initialize Firebase** (jika belum):
```bash
firebase init firestore
```
- Pilih existing project: `radas-prod`
- Gunakan file `firestore.rules` yang sudah ada

4. **Deploy Firestore Rules**:
```bash
firebase deploy --only firestore:rules
```

### Option 2: Update Manual via Firebase Console

1. Buka [Firebase Console](https://console.firebase.google.com)
2. Pilih project `radas-prod`
3. Ke **Firestore Database** → **Rules**
4. Copy paste isi file `firestore.rules` ke editor
5. Klik **Publish**

## Firestore Rules yang Sudah Dibuat

File `firestore.rules` sudah dibuat dengan rules yang mengizinkan:

### ✅ Authenticated Users Can:
- Read/Write pada collections yang diperlukan untuk setup
- Create users, workspaces, roles, dan permissions
- Manage data dalam workspace mereka sendiri

### 🔒 Security Features:
- Hanya authenticated users yang bisa akses data
- Users hanya bisa akses data dalam workspace mereka
- Admin role memiliki akses lebih
- Hiring applications bisa dibuat tanpa auth (untuk public job applications)

## Files Created

- `firestore.rules` - Security rules untuk Firestore
- `firebase.json` - Firebase project configuration

## Quick Deploy Script

Tambahkan script ini ke `package.json`:

```json
{
  "scripts": {
    "firebase:deploy": "firebase deploy --only firestore:rules",
    "firebase:deploy:all": "firebase deploy"
  }
}
```

Kemudian jalankan:
```bash
pnpm firebase:deploy
```

## Testing After Deploy

Setelah deploy rules, reload aplikasi Anda. Error "Missing or insufficient permissions" seharusnya hilang.

## Notes

- Rules saat ini dibuat permissive untuk development
- Untuk production, sebaiknya perketat rules sesuai kebutuhan
- Selalu test rules setelah update
- Backup rules lama sebelum update

## Troubleshooting

### Error: "Firebase CLI not found"
```bash
npm install -g firebase-tools
```

### Error: "Not logged in"
```bash
firebase login
```

### Error: "Project not initialized"
```bash
firebase init
```

### Tetap Error setelah Deploy
1. Clear browser cache dan reload
2. Logout dan login kembali
3. Cek di Firebase Console apakah rules sudah ter-update
