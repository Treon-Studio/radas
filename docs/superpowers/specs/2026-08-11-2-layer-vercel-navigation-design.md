# OpenSible Console — 2-Layer Vercel-Style Navigation Design

**Date:** 2026-08-11
**App:** `apps/opensible-console` (`@radas/opensible-console`)
**Reference Plan:** `docs/superpowers/plans/2026-08-11-vercel-console-theme.md`

## Goal

Refactor the single 64px header into a 2-layer Vercel-style navigation system:
1. **Layer 1 (Top Header, 48px height):** logo/brand mark, breadcrumb slash `/`, project switcher select trigger, flat primary tabs (Overview, Cloud, Infrastructure, System), and right utilities (New Project, Locale select, Theme toggle, User avatar).
2. **Layer 2 (Sub Header, 40px height):** active section sub-links (e.g. for Cloud: Summary, Stacks, Cost Analysis, etc.) aligned horizontally with a border-bottom indicator on the active route.

## Section 1 — Navigation Architecture

### Layer 1: Global Context & Primary Tabs
- **Height:** `h-12` (48px).
- **Layout:** Flex row, items center, justify between.
- **Left Anatomy:**
  - OpenSible logo (`logoSvg`, 24x24 px).
  - Breadcrumb slash: `/` (stone gray text, mono tracking, e.g., `mx-2 text-[var(--color-stone)] font-mono`).
  - Project Switcher: simplified borderless Select trigger (h-8, rounded-md, hover:bg-[var(--color-muted)]) showing active project.
- **Center-Left Anatomy:**
  - Flat inline links for main groups:
    - **Overview:** links to `/dashboard`
    - **Cloud:** links to `/cloud/summary`
    - **Infrastructure:** links to `/infrastructure/deployment`
    - **System:** links to `/system/settings`
  - Style: flat text labels, `text-sm`, `px-3 h-8 flex items-center justify-center rounded-md font-medium transition-colors`.
  - Active Primary Link style: `text-[var(--color-primary)]` or `font-semibold`. Inactive: `text-[var(--color-stone)] hover:text-[var(--color-foreground)]`. No colored backgrounds.
- **Right Anatomy:**
  - Plus Button: `size="pill"` / `variant="outline"`, icon-only on smaller screens to save space.
  - Locale Select: borderless/hairline Select trigger.
  - Theme Toggle.
  - Avatar Menu.

### Layer 2: Sub-navigation Tabs
- **Height:** `h-10` (40px).
- **Layout:** Flex row, items center, border-b border-[var(--color-border)] bg-[var(--color-card)] px-6 overflow-x-auto scrollbar-none.
- **Content:** Flat list of links matching the currently active section:
  - **Overview:**
    - Dashboard (`/dashboard`)
  - **Cloud:**
    - Summary (`/cloud/summary`)
    - Stacks (`/cloud/stacks`)
    - Cost Analysis (`/cloud/cost`)
    - Settings (`/cloud/settings`)
  - **Infrastructure:**
    - Deployment (`/infrastructure/deployment`)
    - Jobs & Templates (`/infrastructure/templates`)
    - Hosts (`/infrastructure/hosts`)
    - Playbooks & Roles (`/infrastructure/playbooks-roles`)
    - Vaults & Secrets (`/infrastructure/vaults-secrets`)
    - Project Settings (`/settings`)
  - **System:**
    - Settings (`/system/settings`)
    - Users (`/system/users`)
    - Workers (`/system/workers`)
    - Secrets (`/system/secrets`)
    - API (`/system/api`)
- **Active Sub-link Style:**
  - Height fits the sub-header (`h-10` or matches parent flex).
  - Active: `text-[var(--color-primary)] font-medium border-b-2 border-[var(--color-primary)]` (or yellow accent `border-[var(--color-accent)]`). Inactive: `text-[var(--color-stone)] hover:text-[var(--color-foreground)]`.
  - Links are nested inside a `<Link>` block from `@tanstack/react-router`.

## Section 2 — Component Invariants

### 1. Route Matching
- Top-level active section matches the current pathname:
  - Overview: path is `/dashboard`
  - Cloud: path starts with `/cloud`
  - Infrastructure: path starts with `/infrastructure` or is `/settings` (project settings)
  - System: path starts with `/system`
- Inside Layer 2, active sub-link matches:
  - Exact match (`to === pathname`) or starts-with prefix match where appropriate (e.g. `/cloud/stacks/new` matches `/cloud/stacks` tab to keep hierarchy highlighted).

### 2. Layout Integration
- The main layout wrapper in `src/routes/__root.tsx` changes:
  - Div height structure stays full height.
  - Flex wrapper header section now holds both Layer 1 and Layer 2:
    ```tsx
    <div className="flex h-screen w-full flex-col">
      <AppHeader />
      {/* AppHeader internally renders Layer 1 (Header) + Layer 2 (SubHeader) */}
      <main className="flex-1 overflow-auto bg-[var(--color-background)]">
        <div className="mx-auto w-full max-w-[1280px] px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
    ```

## Section 3 — Sequence & Verification

1. Refactor `NavSections.tsx` to handle Layer 2 rendering based on current path, exporting a `SubHeader` component or returning inline tab components.
2. Refactor `Header.tsx` to:
   - Restructure Layer 1 (Top bar, flat primary tabs, slash `/`, simple project switcher).
   - Render `SubHeader` directly underneath as Layer 2.
3. Verify navigation links:
   - Ensure clicking top-level tabs (e.g. Infrastructure) takes the user to the default page.
   - Ensure the correct child sub-links appear and indicate active state under them.
4. Typecheck and build verification gate:
   - `pnpm --filter @radas/opensible-console typecheck` (0 errors)
   - `pnpm --filter @radas/opensible-console build` (succeeds)
