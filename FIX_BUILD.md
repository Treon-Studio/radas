# Fix Build Configuration

## Quick Fix untuk WXT Build Error

Build error terjadi karena Vite/Rollup tidak bisa resolve workspace packages. Solusinya adalah menambahkan alias di wxt.config.ts.

## Solution: Update wxt.config.ts

```typescript
// apps/chrome-ext/wxt.config.ts
import { defineConfig } from 'wxt';
import path from 'path';

export default defineConfig({
  // ... existing config

  vite: () => ({
    resolve: {
      alias: {
        // Packages
        '@radas/ui': path.resolve(__dirname, '../../packages/ui/src'),
        '@radas/utils': path.resolve(__dirname, '../../packages/utils/src'),
        '@radas/hooks': path.resolve(__dirname, '../../packages/hooks/src'),
        '@radas/types': path.resolve(__dirname, '../../packages/types/src'),
        '@radas/config': path.resolve(__dirname, '../../packages/config/src'),
        '@radas/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
        '@radas/validation': path.resolve(__dirname, '../../packages/validation/src'),

        // Modules
        '@radas/module-attendance': path.resolve(__dirname, '../../modules/attendance/client'),
        '@radas/module-auth': path.resolve(__dirname, '../../modules/auth/client'),
        '@radas/module-chat': path.resolve(__dirname, '../../modules/chat/client'),
        '@radas/module-company-info': path.resolve(__dirname, '../../modules/company-info/client'),
        '@radas/module-drive': path.resolve(__dirname, '../../modules/drive/client'),
        '@radas/module-hiring': path.resolve(__dirname, '../../modules/hiring/client'),
        '@radas/module-links': path.resolve(__dirname, '../../modules/links/client'),
        '@radas/module-notifications': path.resolve(__dirname, '../../modules/notifications/client'),
        '@radas/module-okr': path.resolve(__dirname, '../../modules/okr/client'),
        '@radas/module-profile': path.resolve(__dirname, '../../modules/profile/client'),
        '@radas/module-projects': path.resolve(__dirname, '../../modules/projects/client'),
        '@radas/module-users': path.resolve(__dirname, '../../modules/users/client'),
        '@radas/module-wiki': path.resolve(__dirname, '../../modules/wiki/client'),
      }
    }
  })
});
```

## Alternative: Update vite.config.ts

Jika wxt.config.ts tidak ada atau tidak bekerja, buat/update `apps/chrome-ext/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@radas/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@radas/utils': path.resolve(__dirname, '../../packages/utils/src'),
      '@radas/hooks': path.resolve(__dirname, '../../packages/hooks/src'),
      '@radas/types': path.resolve(__dirname, '../../packages/types/src'),
      '@radas/config': path.resolve(__dirname, '../../packages/config/src'),
      '@radas/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@radas/validation': path.resolve(__dirname, '../../packages/validation/src'),
      '@radas/module-attendance': path.resolve(__dirname, '../../modules/attendance/client'),
      '@radas/module-auth': path.resolve(__dirname, '../../modules/auth/client'),
      '@radas/module-chat': path.resolve(__dirname, '../../modules/chat/client'),
      '@radas/module-company-info': path.resolve(__dirname, '../../modules/company-info/client'),
      '@radas/module-drive': path.resolve(__dirname, '../../modules/drive/client'),
      '@radas/module-hiring': path.resolve(__dirname, '../../modules/hiring/client'),
      '@radas/module-links': path.resolve(__dirname, '../../modules/links/client'),
      '@radas/module-notifications': path.resolve(__dirname, '../../modules/notifications/client'),
      '@radas/module-okr': path.resolve(__dirname, '../../modules/okr/client'),
      '@radas/module-profile': path.resolve(__dirname, '../../modules/profile/client'),
      '@radas/module-projects': path.resolve(__dirname, '../../modules/projects/client'),
      '@radas/module-users': path.resolve(__dirname, '../../modules/users/client'),
      '@radas/module-wiki': path.resolve(__dirname, '../../modules/wiki/client'),
    }
  }
});
```

## Steps to Fix

1. **Check if wxt.config.ts exists:**
   ```bash
   ls apps/chrome-ext/wxt.config.ts
   ```

2. **Add aliases to config file** (use appropriate solution above)

3. **Test build:**
   ```bash
   pnpm --filter @treonstudio/app-radas run build
   ```

4. **If still errors, check:**
   - Path resolves correctly: `ls ../../packages/ui/src`
   - All imports use correct aliases
   - No circular dependencies

## Common Issues After Fix

### Issue 1: "Cannot find module" after adding aliases

**Solution:** Restart dev server or clear cache
```bash
rm -rf apps/chrome-ext/.wxt
rm -rf apps/chrome-ext/.output
rm -rf apps/chrome-ext/node_modules/.vite
pnpm --filter @treonstudio/app-radas run build
```

### Issue 2: TypeScript still showing errors

**Solution:** Restart TypeScript server in VSCode
- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
- Type "TypeScript: Restart TS Server"
- Press Enter

### Issue 3: Some modules still not resolving

**Solution:** Check package.json exports are correct
```bash
cat modules/projects/package.json | grep exports -A 20
```

## Verification

After fix, you should see:
```bash
✔ Built popup in XXXms
✔ Built background in XXXms
✔ Built content-script in XXXms
✔ Build completed!
```

## Rollback if Needed

If fix doesn't work and you need to rollback:

```bash
# Stash all changes
git stash

# Or checkout specific file
git checkout apps/chrome-ext/wxt.config.ts
```

## Next After Build Works

1. **Test in browser:**
   ```bash
   pnpm --filter @treonstudio/app-radas run dev
   ```

2. **Load extension** in Chrome
3. **Test all features** work correctly
4. **Delete old folders:**
   ```bash
   rm -rf apps/chrome-ext/features
   rm -rf apps/chrome-ext/shared
   ```

5. **Commit changes:**
   ```bash
   git add -A
   git commit -m "feat: restructure monorepo with packages and modules"
   ```

---
*Quick Fix Guide*
*For detailed troubleshooting, see MIGRATION_GUIDE.md*
