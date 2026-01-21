# Authentication Feature

Fitur autentikasi yang terintegrasi dengan Firebase Authentication untuk Chrome Extension Radas.

## Komponen

### 1. Login Page (`login-page.tsx`)

Halaman login yang menyediakan:
- **Login dengan Email/Password**: Form standar untuk login menggunakan email dan password
- **Registrasi**: Opsi untuk membuat akun baru dengan nama, email, dan password
- **Google Sign-In**: Login cepat menggunakan akun Google (menggunakan Chrome Identity API)
- **Error Handling**: Pesan error dalam Bahasa Indonesia
- **Loading States**: Indikator loading saat proses autentikasi

### 2. Auth Context (`shared/contexts/auth-context.tsx`)

Context provider yang menyediakan state dan fungsi autentikasi ke seluruh aplikasi:
- `user`: User object dari Firebase (null jika tidak login)
- `loading`: Boolean untuk loading state
- `error`: Error object jika ada
- `isAuthenticated`: Boolean status autentikasi
- `login()`: Fungsi untuk login dengan email/password
- `signup()`: Fungsi untuk registrasi
- `loginWithGoogle()`: Login dengan Google popup
- `loginWithGoogleChromeIdentity()`: Login dengan Chrome Identity API
- `logout()`: Fungsi untuk logout
- `sendPasswordReset()`: Fungsi untuk kirim email reset password

### 3. User Menu (`shared/components/user-menu.tsx`)

Dropdown menu di header yang menampilkan:
- Avatar pengguna
- Nama dan email
- Tombol logout

## Penggunaan

### Struktur Aplikasi

```tsx
<AuthProvider>
  <App>
    {user ? <MainContent /> : <LoginPage />}
  </App>
</AuthProvider>
```

### Menggunakan Auth Context

```tsx
import { useAuth } from "@/shared/contexts/auth-context";

function MyComponent() {
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <p>Silakan login</p>;
  }

  return (
    <div>
      <p>Welcome, {user.displayName}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## Konfigurasi

### Firebase Console

1. **Aktifkan Email/Password Authentication**:
   - Buka Firebase Console → Authentication → Sign-in method
   - Aktifkan "Email/Password"

2. **Aktifkan Google Sign-In**:
   - Di halaman yang sama, aktifkan "Google"
   - Pilih email support untuk project

### Google Cloud Console (untuk Chrome Identity)

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Pilih project Firebase Anda
3. Buka APIs & Services → Credentials
4. Buat OAuth 2.0 Client ID:
   - Application type: Chrome App
   - Masukkan Extension ID Anda
5. Copy Client ID yang dihasilkan

### Manifest Configuration

Extension sudah dikonfigurasi dengan permission `identity` di `wxt.config.ts`.

Untuk menggunakan Chrome Identity API, tambahkan OAuth config di manifest (jika diperlukan):

```json
{
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ]
  }
}
```

## Fitur Keamanan

- **Password Validation**: Minimal 6 karakter
- **Email Validation**: Validasi format email otomatis
- **Error Messages**: Pesan error yang jelas dan informatif
- **Secure Storage**: Credentials disimpan secara aman oleh Firebase
- **Auto Logout**: Session management otomatis

## Troubleshooting

### Login gagal dengan Chrome Identity

Jika login dengan Chrome Identity API gagal, aplikasi akan otomatis fallback ke metode popup. Pastikan:
- Extension ID sudah terdaftar di Google Cloud Console
- OAuth Client ID sudah dikonfigurasi dengan benar
- User mengizinkan popup

### Error "auth/popup-closed-by-user"

User menutup popup sebelum menyelesaikan proses login. User harus mengulangi proses login dan tidak menutup popup.

### Error "auth/network-request-failed"

Koneksi internet bermasalah. Pastikan device terhubung ke internet.

## Flow Diagram

```
User Opens Extension
       ↓
Check Auth State (useAuth)
       ↓
   ┌───────┐
   │ User? │
   └───┬───┘
       │
   ┌───┴────┐
   │        │
  Yes      No
   │        │
   ↓        ↓
Main    Login
Page     Page
   │        │
   │    ┌───┴────┐
   │    │ Login  │
   │    │Method? │
   │    └───┬────┘
   │        │
   │    ┌───┴─────────┐
   │    │             │
   │  Email      Google
   │    │             │
   │    ├─────────────┤
   │    │             │
   │    └──────┬──────┘
   │           │
   │       Firebase
   │       Auth ✓
   │           │
   └───────────┘
       │
   Main Page
  (Authenticated)
```

## Next Steps

Untuk pengembangan selanjutnya, Anda bisa menambahkan:
- Forgot password flow
- Email verification
- Social login lainnya (Facebook, Twitter, dll)
- Two-factor authentication
- User profile management
