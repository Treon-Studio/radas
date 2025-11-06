# OAuth Setup untuk Chrome Extension

## Current Status

✅ OAuth Client ID untuk Web Application sudah dibuat:
- **Client ID**: `648573011640-f9t24pgttv5bqdisgpdc52mm647p84u2.apps.googleusercontent.com`
- **Type**: Web application
- **Authorized Origins**: localhost, https://radas-prod.firebaseapp.com

## Untuk Chrome Extension - Dua Metode Login Google

### Metode 1: Google Sign-In Popup (Sudah Siap)

Menggunakan Web Client ID yang sudah ada. **Tidak perlu setup tambahan**, sudah berfungsi!

**Cara kerja**:
- Firebase membuka popup window
- User login di popup
- Token dikembalikan ke extension

**Kelebihan**:
- ✅ Sudah configured
- ✅ Tidak perlu Extension ID
- ✅ Berfungsi di development dan production

**Kekurangan**:
- ❌ Popup bisa di-block browser
- ❌ UX kurang smooth

---

### Metode 2: Chrome Identity API (Recommended untuk Production)

Menggunakan Chrome's native Identity API. **Perlu setup tambahan**.

**Cara kerja**:
- Chrome menampilkan account picker native
- User pilih akun
- Token otomatis dikembalikan

**Kelebihan**:
- ✅ UX lebih baik (native Chrome UI)
- ✅ Tidak ada popup blocker
- ✅ Lebih cepat

**Kekurangan**:
- ❌ Perlu Extension ID (tidak bisa pakai localhost)
- ❌ Perlu setup OAuth Chrome App

## Setup Chrome Identity API (Opsional - Untuk Production)

### Langkah 1: Build Extension dan Dapatkan Extension ID

```bash
# Build extension
pnpm build

# Load ke Chrome
# 1. Buka chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Pilih folder: .output/chrome-mv3
# 5. COPY Extension ID (contoh: abcdefghijklmnopqrstuvwxyz123456)
```

### Langkah 2: Buat OAuth Client untuk Chrome App

1. Buka [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials?project=radas-prod)

2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**

3. **Application type**: Pilih **"Chrome extension"** atau **"Chrome App"**

4. **Item ID**: Masukkan Extension ID yang sudah di-copy
   ```
   Format: abcdefghijklmnopqrstuvwxyz123456
   ```

5. Click **"Create"**

6. **COPY Client ID** yang dihasilkan (berbeda dari Web client)
   ```
   Format: xxxxx.apps.googleusercontent.com
   ```

### Langkah 3: Update Environment Variables

Tambahkan Chrome App Client ID ke `.env`:

```env
# Untuk Chrome Identity API (gunakan Chrome App Client ID)
VITE_CHROME_EXTENSION_CLIENT_ID=YOUR_CHROME_APP_CLIENT_ID_HERE.apps.googleusercontent.com
```

### Langkah 4: Update Manifest (Sudah Auto-generated)

WXT akan otomatis menambahkan permission `identity` ke manifest. Untuk menambahkan OAuth config, update `wxt.config.ts`:

```typescript
export default defineConfig({
  manifest: {
    manifest_version: 3,
    permissions: ["identity"],
    oauth2: {
      client_id: "YOUR_CHROME_APP_CLIENT_ID.apps.googleusercontent.com",
      scopes: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
      ]
    },
    // ... rest of config
  }
});
```

### Langkah 5: Test

1. Rebuild extension: `pnpm build`
2. Reload extension di Chrome
3. Buka popup dan coba "Masuk dengan Google"
4. Seharusnya muncul Chrome's native account picker

## Rekomendasi

### Untuk Development (Sekarang)
✅ **Gunakan Metode 1 (Popup)** - Sudah siap pakai, tidak perlu setup tambahan

### Untuk Production (Nanti)
✅ **Gunakan Metode 2 (Chrome Identity API)** - UX lebih baik

## Current Implementation

Kode login sudah mendukung **kedua metode**:

```typescript
// Di features/auth/login-page.tsx
const handleGoogleSignIn = async () => {
  // Coba Chrome Identity API dulu
  const result = await loginWithGoogleChromeIdentity();

  if (!result.success) {
    // Fallback ke popup jika gagal
    const popupResult = await loginWithGoogle();
  }
};
```

**Prioritas fallback**:
1. ✅ Chrome Identity API (jika configured)
2. ✅ Popup method (jika Chrome Identity gagal)

## Testing

### Test Popup Method (Sudah Bisa Digunakan)

```bash
pnpm dev
```

Buka extension dan klik "Masuk dengan Google" - akan buka popup.

### Test Chrome Identity API (Setelah Setup)

Setelah mengikuti Langkah 1-5 di atas:

```bash
pnpm build
# Load .output/chrome-mv3 ke Chrome
# Test login
```

## Troubleshooting

### Error: "popup blocked"
- **Solusi**: User harus allow popups, ATAU setup Chrome Identity API

### Error: "invalid client ID"
- **Pastikan**: Client ID di `.env` sesuai dengan yang di Google Cloud Console
- **Web client** untuk popup method
- **Chrome App client** untuk Identity API

### Chrome Identity API tidak jalan
- **Pastikan**: Extension ID sudah didaftarkan di OAuth client
- **Pastikan**: OAuth2 config ada di manifest
- **Pastikan**: Extension di-load dari folder build (bukan dev server)

## Next Steps

1. ✅ **Sekarang**: Gunakan popup method untuk testing
2. ⏭️ **Nanti**: Setup Chrome Identity API untuk production
3. ⏭️ **Deploy**: Publish extension ke Chrome Web Store dengan Chrome Identity API
