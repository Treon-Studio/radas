#!/bin/bash

# Script to migrate imports from old structure to new monorepo structure
# Usage: ./scripts/migrate-imports.sh [target-directory]
# Example: ./scripts/migrate-imports.sh apps/console

set -e

# The target directory is explicit: there is no default (the historical
# default apps/chrome-ext no longer exists in the repository).
TARGET_DIR="${1:?usage: migrate-imports.sh <target-directory>}"

echo "🚀 Starting import migration for: $TARGET_DIR"
echo ""

# Function to update imports in files
update_imports() {
  local dir=$1
  local pattern=$2
  local old_import=$3
  local new_import=$4

  echo "  Updating $old_import → $new_import"

  find "$dir" -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/.next/*" \
    ! -path "*/.wxt/*" \
    ! -path "*/dist/*" \
    -exec sed -i '' "s|$old_import|$new_import|g" {} +
}

echo "📦 Phase 1: Updating Packages (Shared Libraries)"
echo "---------------------------------------------"

# UI Components
update_imports "$TARGET_DIR" "tsx,ts" "@/shared/components/ui/" "@radas/ui/ui/"
update_imports "$TARGET_DIR" "tsx,ts" "@/shared/components/" "@radas/ui/"

# Utils
update_imports "$TARGET_DIR" "tsx,ts" "@/shared/utils/" "@radas/utils/"

# Hooks
update_imports "$TARGET_DIR" "tsx,ts" "@/shared/hooks/" "@radas/hooks/"

# Types
update_imports "$TARGET_DIR" "tsx,ts" "@/shared/types/" "@radas/types/"

# Contexts & Lib
update_imports "$TARGET_DIR" "tsx,ts" "@/shared/contexts/" "@radas/config/contexts/"
update_imports "$TARGET_DIR" "tsx,ts" "@/shared/lib/" "@radas/config/lib/"

# Services
update_imports "$TARGET_DIR" "tsx,ts" "@/shared/services/" "@radas/api-client/services/"

echo ""
echo "🎨 Phase 2: Updating Styles"
echo "---------------------------------------------"

# Styles
find "$TARGET_DIR" -type f \( -name "*.css" -o -name "*.tsx" -o -name "*.ts" \) \
  ! -path "*/node_modules/*" \
  ! -path "*/.next/*" \
  ! -path "*/.wxt/*" \
  -exec sed -i '' "s|@/shared/styles/|@radas/ui/styles/|g" {} +

echo "  Updated style imports"

echo ""
echo "🧩 Phase 3: Updating Modules (Features)"
echo "---------------------------------------------"

# Modules
update_imports "$TARGET_DIR" "tsx,ts" "@/features/attendance/" "@radas/module-attendance/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/auth/" "@radas/module-auth/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/company-info/" "@radas/module-company-info/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/drive/" "@radas/module-drive/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/hiring/" "@radas/module-hiring/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/home/" "@radas/module-chat/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/links/" "@radas/module-links/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/notifications/" "@radas/module-notifications/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/okr/" "@radas/module-okr/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/profile/" "@radas/module-profile/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/projects/" "@radas/module-projects/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/users/" "@radas/module-users/"
update_imports "$TARGET_DIR" "tsx,ts" "@/features/wiki/" "@radas/module-wiki/"

echo ""
echo "✅ Import migration completed!"
echo ""
echo "📋 Next steps:"
echo "  1. Run type check: cd $TARGET_DIR && pnpm run compile"
echo "  2. Run build: cd $TARGET_DIR && pnpm run build"
echo "  3. Test in dev mode: cd $TARGET_DIR && pnpm run dev"
echo "  4. If everything works, delete old folders:"
echo "     - rm -rf $TARGET_DIR/features"
echo "     - rm -rf $TARGET_DIR/shared"
echo ""
echo "💡 Tip: If you see errors, check MIGRATION_GUIDE.md for troubleshooting"
