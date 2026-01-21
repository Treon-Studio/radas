# Migration Guide - Monorepo Restructuring

## Overview

Dokumen ini menjelaskan bagaimana cara memigrasikan import paths dari struktur lama ke struktur monorepo yang baru.

## Import Path Changes

### Packages (Shared Libraries)

| Old Path | New Path | Description |
|----------|----------|-------------|
| `@/shared/components/ui/*` | `@radas/ui/ui/*` | UI components (shadcn/ui) |
| `@/shared/components/*` | `@radas/ui/*` | Custom components |
| `@/shared/utils/*` | `@radas/utils/*` | Utility functions |
| `@/shared/hooks/*` | `@radas/hooks/*` | React hooks |
| `@/shared/types/*` | `@radas/types/*` | TypeScript types |
| `@/shared/contexts/*` | `@radas/config/contexts/*` | React contexts |
| `@/shared/lib/*` | `@radas/config/lib/*` | Libraries & configs |
| `@/shared/services/*` | `@radas/api-client/services/*` | API services |
| `@/shared/styles/*` | `@radas/ui/styles/*` | Styles (CSS) |

### Modules (Features)

| Old Path | New Path |
|----------|----------|
| `@/features/attendance/*` | `@radas/module-attendance/*` |
| `@/features/auth/*` | `@radas/module-auth/*` |
| `@/features/company-info/*` | `@radas/module-company-info/*` |
| `@/features/drive/*` | `@radas/module-drive/*` |
| `@/features/hiring/*` | `@radas/module-hiring/*` |
| `@/features/home/*` | `@radas/module-chat/*` |
| `@/features/links/*` | `@radas/module-links/*` |
| `@/features/notifications/*` | `@radas/module-notifications/*` |
| `@/features/okr/*` | `@radas/module-okr/*` |
| `@/features/profile/*` | `@radas/module-profile/*` |
| `@/features/projects/*` | `@radas/module-projects/*` |
| `@/features/users/*` | `@radas/module-users/*` |
| `@/features/wiki/*` | `@radas/module-wiki/*` |

## Migration Steps

### Step 1: Verify Structure

Pastikan semua folder dan files sudah ada:

```bash
# Check packages
ls -la packages/

# Check modules
ls -la modules/

# Verify chrome-ext dependencies
cat apps/chrome-ext/package.json | grep @radas
```

### Step 2: Update Imports Automatically (Recommended)

Gunakan find & replace dengan regex untuk update imports secara massal:

#### 2.1 Update UI Components

```bash
# Find all files that import from shared/components
find apps/chrome-ext -type f -name "*.tsx" -o -name "*.ts" | while read file; do
  # Update shadcn/ui imports
  sed -i '' 's|@/shared/components/ui/|@radas/ui/ui/|g' "$file"

  # Update custom components
  sed -i '' 's|@/shared/components/|@radas/ui/|g' "$file"
done
```

#### 2.2 Update Utils, Hooks, Types

```bash
find apps/chrome-ext -type f -name "*.tsx" -o -name "*.ts" | while read file; do
  sed -i '' 's|@/shared/utils/|@radas/utils/|g' "$file"
  sed -i '' 's|@/shared/hooks/|@radas/hooks/|g' "$file"
  sed -i '' 's|@/shared/types/|@radas/types/|g' "$file"
done
```

#### 2.3 Update Contexts & Lib

```bash
find apps/chrome-ext -type f -name "*.tsx" -o -name "*.ts" | while read file; do
  sed -i '' 's|@/shared/contexts/|@radas/config/contexts/|g' "$file"
  sed -i '' 's|@/shared/lib/|@radas/config/lib/|g' "$file"
  sed -i '' 's|@/shared/services/|@radas/api-client/services/|g' "$file"
done
```

#### 2.4 Update Styles

```bash
find apps/chrome-ext -type f -name "*.css" -o -name "*.tsx" | while read file; do
  sed -i '' 's|@/shared/styles/|@radas/ui/styles/|g' "$file"
done
```

#### 2.5 Update Module Imports

```bash
find apps/chrome-ext -type f -name "*.tsx" -o -name "*.ts" | while read file; do
  sed -i '' 's|@/features/attendance/|@radas/module-attendance/|g' "$file"
  sed -i '' 's|@/features/auth/|@radas/module-auth/|g' "$file"
  sed -i '' 's|@/features/company-info/|@radas/module-company-info/|g' "$file"
  sed -i '' 's|@/features/drive/|@radas/module-drive/|g' "$file"
  sed -i '' 's|@/features/hiring/|@radas/module-hiring/|g' "$file"
  sed -i '' 's|@/features/home/|@radas/module-chat/|g' "$file"
  sed -i '' 's|@/features/links/|@radas/module-links/|g' "$file"
  sed -i '' 's|@/features/notifications/|@radas/module-notifications/|g' "$file"
  sed -i '' 's|@/features/okr/|@radas/module-okr/|g' "$file"
  sed -i '' 's|@/features/profile/|@radas/module-profile/|g' "$file"
  sed -i '' 's|@/features/projects/|@radas/module-projects/|g' "$file"
  sed -i '' 's|@/features/users/|@radas/module-users/|g' "$file"
  sed -i '' 's|@/features/wiki/|@radas/module-wiki/|g' "$file"
done
```

### Step 3: Update Imports Manually (Alternative)

Jika prefer manual, gunakan VSCode find & replace:

1. Open VSCode
2. Press `Cmd+Shift+F` (Mac) or `Ctrl+Shift+F` (Windows)
3. Enable regex mode (click `.*` button)
4. Find: `@/shared/components/ui/`
5. Replace: `@radas/ui/ui/`
6. Replace All in `apps/chrome-ext` folder

Ulangi untuk setiap mapping di tabel di atas.

### Step 4: Fix Internal Module Imports

Di dalam setiap module, ada imports yang reference internal files. Ini tidak perlu diubah karena masih dalam module yang sama. Contoh:

```tsx
// modules/projects/client/components/task-form.tsx
// Ini tetap OK karena masih di dalam module projects
import { useProjects } from '../hooks'
import type { Project } from '../entity'
```

### Step 5: Verify & Type Check

```bash
# Type check chrome extension
cd apps/chrome-ext
pnpm run compile

# Type check all packages
cd ../../
pnpm run -r type-check
```

### Step 6: Test Build

```bash
# Build chrome extension
cd apps/chrome-ext
pnpm run build

# Run dev mode
pnpm run dev
```

## Common Issues & Solutions

### Issue 1: Module Not Found

**Error:**
```
Cannot find module '@radas/ui/ui/button'
```

**Solution:**
- Pastikan pnpm install sudah dijalankan
- Check tsconfig.json paths sudah benar
- Restart TypeScript server di VSCode: `Cmd+Shift+P` → "TypeScript: Restart TS Server"

### Issue 2: Circular Dependencies

**Error:**
```
Circular dependency detected
```

**Solution:**
- Jangan import module dari module lain
- Pindahkan shared code ke packages
- Gunakan dependency injection pattern

### Issue 3: Type Errors After Migration

**Error:**
```
Type 'X' is not assignable to type 'Y'
```

**Solution:**
- Check apakah semua exports di index.ts sudah benar
- Pastikan tidak ada duplicate type definitions
- Update imports di module yang error

### Issue 4: Missing Dependencies

**Error:**
```
Module '@radas/module-projects' not found
```

**Solution:**
```bash
# Di root directory
pnpm install

# Clear cache if needed
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
```

## Verification Checklist

- [ ] All packages have package.json and tsconfig.json
- [ ] All modules have package.json and tsconfig.json
- [ ] pnpm install runs without errors
- [ ] TypeScript compilation succeeds
- [ ] Chrome extension builds successfully
- [ ] No runtime errors in dev mode
- [ ] All imports resolved correctly
- [ ] Old `apps/chrome-ext/features` folder can be deleted
- [ ] Old `apps/chrome-ext/shared` folder can be deleted

## Rollback Plan

Jika ada masalah dan perlu rollback:

```bash
# Stash changes
git stash

# Or create a backup branch
git checkout -b backup/before-monorepo-migration
git add -A
git commit -m "Backup before migration"

# Return to original branch
git checkout feat/integrate-desk
```

## Next Steps After Migration

1. **Apply to Other Apps**: Migrate web, web-lp, chat-widget
2. **Add New Modules**: POS, accounting, procurement, sales, CRM, stock, assets
3. **Setup Build Pipeline**: Configure turbo or nx for better build performance
4. **Add Module Documentation**: Document each module's API and usage
5. **Create Storybook**: For shared UI components

## Questions?

Jika ada pertanyaan atau issue, silakan:
1. Check ARCHITECTURE.md untuk struktur overview
2. Check tsconfig.base.json untuk path mappings
3. Check individual package.json untuk dependencies
