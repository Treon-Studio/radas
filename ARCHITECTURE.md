# Radas Monorepo Architecture

## Overview

Radas adalah monorepo berbasis pnpm workspace dengan struktur yang terorganisir berdasarkan:
1. **Shared Libraries** (packages) - Komponen dan utilities yang dapat digunakan kembali
2. **Business Modules** (modules) - Domain logic bisnis yang terpisah
3. **Platform Applications** (apps) - Aplikasi spesifik per platform

## Struktur Direktori

```
radas/
├── apps/                          # Platform-specific applications
│   ├── web/                       # Next.js web application
│   ├── web-lp/                    # Landing page
│   ├── chat-widget/               # Chat widget component
│   ├── chrome-ext/                # Chrome extension
│   └── cli/                       # CLI tool (Go)
│
├── modules/                       # Business domain modules
│   ├── attendance/
│   ├── auth/
│   ├── chat/
│   ├── company-info/
│   ├── drive/
│   ├── hiring/
│   ├── links/
│   ├── notifications/
│   ├── okr/
│   ├── profile/
│   ├── projects/
│   ├── users/
│   └── wiki/
│
├── packages/                      # Shared libraries
│   ├── ui/                        # UI components & design system
│   ├── utils/                     # Common utilities
│   ├── hooks/                     # Shared React hooks
│   ├── types/                     # Shared TypeScript types
│   ├── config/                    # Shared configurations & contexts
│   ├── api-client/                # API client services
│   └── validation/                # Zod schemas & validators
│
├── pnpm-workspace.yaml            # Workspace configuration
├── tsconfig.base.json             # Base TypeScript config
└── package.json                   # Root package.json
```

## Module Structure

Setiap module memiliki struktur:

```
modules/<module-name>/
├── client/                        # Frontend-specific code
│   ├── components/               # React components
│   ├── hooks/                    # Module-specific hooks
│   ├── services/                 # API services
│   ├── contexts/                 # React contexts
│   ├── sections/                 # Page sections
│   └── index.ts                  # Public exports
├── shared/                        # Shared between client/server
│   ├── types/                    # TypeScript types
│   ├── schemas/                  # Validation schemas
│   └── constants/                # Constants
├── package.json
└── tsconfig.json
```

## Package Naming Convention

- **Apps**: `@treonstudio/app-*` atau package name sendiri
- **Modules**: `@radas/module-<name>`
- **Packages**: `@radas/<name>`

Contoh:
- `@radas/ui` - UI components package
- `@radas/module-projects` - Projects module
- `@treonstudio/app-radas` - Chrome extension app

## Dependency Flow

```
apps → modules → packages
  ↓       ↓         ↓
  └───────┴─────────┘
  (all can use packages)
```

**Aturan Dependencies:**
- ✅ Apps dapat import modules & packages
- ✅ Modules dapat import packages
- ❌ Packages TIDAK boleh import modules
- ❌ Modules sebaiknya tidak saling import (gunakan shared packages)

## TypeScript Paths

Base paths sudah dikonfigurasi di `tsconfig.base.json`:

```json
{
  "paths": {
    "@radas/ui": ["./packages/ui/src"],
    "@radas/utils": ["./packages/utils/src"],
    "@radas/hooks": ["./packages/hooks/src"],
    "@radas/types": ["./packages/types/src"],
    "@radas/config": ["./packages/config/src"],
    "@radas/api-client": ["./packages/api-client/src"],
    "@radas/validation": ["./packages/validation/src"],
    "@radas/module-<name>": ["./modules/<name>/client"],
    // ... dll
  }
}
```

## Workspace Configuration

File `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'modules/*'
  - 'modules/*/client'
  - 'modules/*/server'
  - 'packages/*'
  - '!**/test/**'
  - '!**/.next/**'
  - '!**/node_modules/**'
```

## Migration Status

### ✅ Completed

1. ✅ Struktur folder baru dibuat (modules, packages)
2. ✅ Pnpm workspace configuration
3. ✅ Base packages dengan tsconfig
4. ✅ Features dimigrasikan ke modules
5. ✅ Shared resources dimigrasikan ke packages:
   - `apps/chrome-ext/shared/components` → `packages/ui`
   - `apps/chrome-ext/shared/utils` → `packages/utils`
   - `apps/chrome-ext/shared/types` → `packages/types`
   - `apps/chrome-ext/shared/hooks` → `packages/hooks`
   - `apps/chrome-ext/shared/contexts` & `lib` → `packages/config`
   - `apps/chrome-ext/shared/services` → `packages/api-client`
6. ✅ Chrome-ext package.json updated dengan workspace dependencies
7. ✅ TypeScript paths configured
8. ✅ Dependencies installed

### 🚧 Next Steps

1. **Update Import Paths**: Semua import di chrome-ext perlu diupdate:
   - `@/shared/components/*` → `@radas/ui/*`
   - `@/shared/utils/*` → `@radas/utils/*`
   - `@/shared/hooks/*` → `@radas/hooks/*`
   - `@/shared/types/*` → `@radas/types/*`
   - `@/shared/contexts/*` → `@radas/config/contexts/*`
   - `@/shared/lib/*` → `@radas/config/lib/*`
   - `@/features/<module>/*` → `@radas/module-<module>/*`

2. **Cleanup**: Setelah import paths diupdate dan tested:
   - Hapus folder `apps/chrome-ext/features` (sudah dimigrasikan)
   - Hapus folder `apps/chrome-ext/shared` (sudah dimigrasikan)

3. **Update Other Apps**: Apply struktur yang sama ke:
   - `apps/web`
   - `apps/web-lp`
   - `apps/chat-widget`

4. **Testing**: Build dan test semua apps untuk memastikan tidak ada breaking changes

## Usage Examples

### Importing from Packages

```tsx
// Before
import { Button } from '@/shared/components/ui/button'
import { formatDate } from '@/shared/utils/date'

// After
import { Button } from '@radas/ui/ui/button'
import { formatDate } from '@radas/utils/date'
```

### Importing from Modules

```tsx
// Before
import { useProjects } from '@/features/projects/hooks'

// After
import { useProjects } from '@radas/module-projects/hooks'
```

### Adding New Module

1. Create module directory:
```bash
mkdir -p modules/<module-name>/{client,shared}
```

2. Create package.json:
```json
{
  "name": "@radas/module-<module-name>",
  "version": "0.0.0",
  "type": "module",
  "main": "./client/index.ts",
  "dependencies": {
    "@radas/ui": "workspace:*",
    "@radas/utils": "workspace:*"
  }
}
```

3. Create tsconfig.json extending base config
4. Add to tsconfig.base.json paths
5. Run `pnpm install`

## Benefits

1. **Code Reusability**: Shared packages dapat digunakan di semua apps
2. **Clear Dependencies**: Dependency graph yang jelas dan terstruktur
3. **Separation of Concerns**: Business logic terpisah dari UI dan utilities
4. **Scalability**: Mudah menambah module atau package baru
5. **Type Safety**: TypeScript paths memastikan imports yang benar
6. **Multi-Platform**: Mudah share code antar web, mobile, desktop, dan extension
