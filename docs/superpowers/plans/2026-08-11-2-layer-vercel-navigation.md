# 2-Layer Vercel-Style Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the single 64px header into a 2-layer Vercel-style navigation system. Layer 1 is the global top bar (height 48px, h-12) containing the logo, slash divider, project switcher, primary tabs, and utility controls. Layer 2 is the sub-navigation bar (height 40px, h-10) containing horizontal inline links for the active primary tab, highlighting active items with a bottom border.

**Architecture:** Split navigation responsibility between `Header.tsx` (handles Layer 1 structure + top-level navigation actions) and `NavSections.tsx` (manages active section resolution and renders horizontal sub-navigation for Layer 2).

**Tech Stack:** React 19, TypeScript, `@tanstack/react-router`, `@remixicon/react`, `@radas/ui` (styles).

## Global Constraints

- Monochrome base with brand yellow `hsl(45 95% 50%)` as the chromatic active/focus accent.
- Geometry: 6px radius (`rounded-md`) on cards/inputs/buttons, pills (`rounded-full`) only for badges/chrome buttons.
- Height specs: Layer 1 = `h-12` (48px), Layer 2 = `h-10` (40px).
- Verification gate: `pnpm --filter @radas/opensible-console typecheck` (0 errors) then `pnpm --filter @radas/opensible-console build` (exit 0).

---

### Task 1: Refactor NavSections to support 2-Layer layout

**Files:**
- Modify: `apps/opensible-console/src/components/app-shell/NavSections.tsx`

**Interfaces:**
- Consumes: `useT` from `src/lib/i18n`, `@tanstack/react-router` (`Link`, `useLocation`), `@remixicon/react` icons.
- Produces:
  - `getActiveSection(pathname: string): "overview" | "cloud" | "infrastructure" | "system"`
  - `SubNavLinks(): ReactElement`

- [ ] **Step 1: Replace NavSections implementation**

Replace the entire contents of `apps/opensible-console/src/components/app-shell/NavSections.tsx` with:

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import {
  RiHomeLine as Home, RiPieChartLine as PieChart, RiStackLine as Layers,
  RiAddLine as Plus, RiCalculatorLine as Calculator, RiSettings2Line as Settings2,
  RiRocketLine as Rocket, RiArchiveLine as Library, RiNodeTree as Network,
  RiBookOpenLine as BookOpen, RiShieldCheckLine as ShieldCheck, RiTeamLine as Users,
  RiCpuLine as Cpu, RiPlugLine as Plug,
} from "@remixicon/react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: typeof Home };

const SECTIONS = (t: ReturnType<typeof useT>) => ({
  overview: [
    { to: "/dashboard", label: t("nav.homeDashboard"), icon: Home },
  ] as Item[],
  cloud: [
    { to: "/cloud/summary", label: t("nav.summary"), icon: PieChart },
    { to: "/cloud/stacks", label: t("nav.stacks"), icon: Layers },
    { to: "/cloud/stacks/new", label: t("nav.newStack"), icon: Plus },
    { to: "/cloud/cost", label: t("nav.costAnalysis"), icon: Calculator },
    { to: "/cloud/settings", label: t("nav.projectSettings"), icon: Settings2 },
  ] as Item[],
  infrastructure: [
    { to: "/infrastructure/deployment", label: t("nav.deployment"), icon: Rocket },
    { to: "/infrastructure/templates", label: t("nav.jobsTemplates"), icon: Library },
    { to: "/infrastructure/hosts", label: t("nav.hosts"), icon: Network },
    { to: "/infrastructure/playbooks-roles", label: t("nav.playbooksRoles"), icon: BookOpen },
    { to: "/infrastructure/vaults-secrets", label: t("nav.vaultsSecrets"), icon: ShieldCheck },
    { to: "/settings", label: t("nav.projectSettings"), icon: Settings2 },
  ] as Item[],
  system: [
    { to: "/system/settings", label: t("nav.settings"), icon: Settings2 },
    { to: "/system/users", label: t("nav.usersManagement"), icon: Users },
    { to: "/system/workers", label: t("nav.workers"), icon: Cpu },
    { to: "/system/secrets", label: t("nav.secretsManagement"), icon: ShieldCheck },
    { to: "/system/api", label: t("nav.api"), icon: Plug },
  ] as Item[],
});

export function getActiveSection(pathname: string): "overview" | "cloud" | "infrastructure" | "system" {
  if (pathname.startsWith("/cloud")) return "cloud";
  if (pathname.startsWith("/infrastructure") || pathname === "/settings") return "infrastructure";
  if (pathname.startsWith("/system")) return "system";
  return "overview";
}

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  // Sub-items match: exact or exact prefix match to prevent double highlights
  if (to === "/cloud/stacks" && pathname.startsWith("/cloud/stacks/new")) return false;
  return pathname === to || pathname.startsWith(to + "/");
}

export function SubNavLinks() {
  const t = useT();
  const { pathname } = useLocation();
  const activeSec = getActiveSection(pathname);
  const items = SECTIONS(t)[activeSec] || [];

  return (
    <div className="flex items-center gap-6 h-full min-w-0">
      {items.map((it) => {
        const active = isActive(pathname, it.to);
        return (
          <Link
            key={it.to}
            to={it.to}
            className={cn(
              "h-10 flex items-center text-xs font-mono uppercase tracking-[0.071em] border-b-2 transition-colors shrink-0",
              active
                ? "border-[var(--color-primary)] text-[var(--color-foreground)] font-semibold"
                : "border-transparent text-[var(--color-stone)] hover:text-[var(--color-foreground)]"
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @radas/opensible-console typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/opensible-console/src/components/app-shell/NavSections.tsx
git commit -m "feat(console): refactor NavSections to horizontal subnav links"
```

---

### Task 2: Rewrite AppHeader with Layer 1 and Layer 2 split

**Files:**
- Modify: `apps/opensible-console/src/components/app-shell/Header.tsx`

**Interfaces:**
- Consumes: `getActiveSection` and `SubNavLinks` from `src/components/app-shell/NavSections.tsx`.
- Produces: `AppHeader(): ReactElement` containing both Layer 1 (`h-12`) and Layer 2 (`h-10`) panels.

- [ ] **Step 1: Replace AppHeader implementation**

Replace the entire contents of `apps/opensible-console/src/components/app-shell/Header.tsx` with:

```tsx
import { RiMoonLine as Moon, RiSunLine as Sun, RiTranslate as Languages, RiLogoutBoxRLine as LogOut, RiAddLine as Plus, RiUserSettingsLine as UserCog, RiArrowDownSLine as ChevronDown, RiStackLine as StackLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import logoSvg from "@/assets/opensible-logo.png";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { getActiveSection, SubNavLinks } from "@/components/app-shell/NavSections";
import { useTheme } from "@/lib/theme";
import { useLocale, useT, LOCALES, type Locale } from "@/lib/i18n";
import { useProjects } from "@/lib/project";
import { logout } from "@/lib/auth";
import { NewProjectDialog } from "@/components/project/NewProjectDialog";
import { getStoredUser } from "@/lib/api";
import { cn } from "@/lib/utils";

type StoredUser = { username?: string; email?: string; roles?: string[]; role_details?: { name: string }[] };

export function AppHeader() {
  const { theme, toggle } = useTheme();
  const { locale, setLocale } = useLocale();
  const t = useT();
  const { pathname } = useLocation();
  const activeSection = getActiveSection(pathname);
  const { projects, currentId, setCurrent, loading } = useProjects();
  const navigate = useNavigate();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const user = getStoredUser<StoredUser>() || {};
  const displayName = user.username || t("common.admin");
  const initial = (displayName.charAt(0) || "A").toUpperCase();
  const primaryRole =
    (user.role_details && user.role_details[0]?.name) ||
    (user.roles && user.roles[0]) ||
    t("common.admin");

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function onLogout() {
    setMenuOpen(false);
    await logout();
    navigate({ to: "/login", replace: true });
  }

  function onProfile() {
    setMenuOpen(false);
    navigate({ to: "/profile" });
  }

  const primaryTabs = [
    { key: "overview", label: t("nav.overview"), to: "/dashboard" },
    { key: "cloud", label: t("nav.cloud"), to: "/cloud/summary" },
    { key: "infrastructure", label: t("nav.infrastructure"), to: "/infrastructure/deployment" },
    { key: "system", label: t("nav.system"), to: "/system/settings" },
  ];

  return (
    <div className="flex flex-col shrink-0 border-b border-[var(--color-border)] bg-[var(--color-background)]">
      {/* Layer 1 (Height 48px, h-12) */}
      <header className="h-12 flex items-center justify-between px-6 gap-4 border-b border-[var(--color-border)]/60">
        <div className="flex items-center gap-3 min-w-0 h-full">
          <Link to="/dashboard" className="flex items-center shrink-0">
            <img src={logoSvg} className="h-6 w-6" alt="OpenSible" />
          </Link>
          <span className="text-[var(--color-stone)] font-mono text-sm leading-none shrink-0 select-none">/</span>
          <div className="w-[180px] shrink-0">
            <Select
              value={currentId ?? ""}
              onChange={(v) => setCurrent(v || null)}
              disabled={loading}
              placeholder={loading ? t("common.loading") : t("common.noProjects")}
              prefix={<StackLine className="h-3 w-3 text-[var(--color-foreground)] shrink-0" />}
              options={projects.map(p => ({ value: p.id, label: p.name }))}
              triggerClassName="h-7 text-xs border-none hover:bg-[var(--color-muted)] bg-transparent shadow-none"
              align="start"
            />
          </div>

          {/* Primary horizontal tabs */}
          <nav className="hidden md:flex items-center gap-1 h-full ml-2">
            {primaryTabs.map((tab) => {
              const active = activeSection === tab.key;
              return (
                <Link
                  key={tab.key}
                  to={tab.to}
                  className={cn(
                    "px-3 h-8 flex items-center text-xs font-mono uppercase tracking-[0.071em] rounded-md transition-colors",
                    active
                      ? "text-[var(--color-foreground)] font-semibold bg-[var(--color-muted)]/60"
                      : "text-[var(--color-stone)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/30"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 h-full">
          <Button variant="outline" size="pill" onClick={() => setNewProjectOpen(true)} title={t("common.createNewProject")} className="h-7 px-3 text-xs">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{t("common.newProject")}</span>
          </Button>

          <div className="w-[120px] hidden sm:block">
            <Select
              value={locale}
              onChange={(v) => setLocale(v as Locale)}
              options={LOCALES.map((l) => ({
                value: l.code,
                label: `${l.flag}  ${l.nativeLabel}`,
              }))}
              prefix={<Languages className="h-3 w-3 text-[var(--color-foreground)] shrink-0" />}
              triggerClassName="h-7 text-xs border-none hover:bg-[var(--color-muted)] bg-transparent shadow-none"
              align="end"
            />
          </div>

          <Button variant="ghost" size="icon" onClick={toggle} title={t("common.theme")} className="rounded-full h-7 w-7">
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-1.5 pl-1 pr-1.5 h-8 rounded-full hover:bg-[var(--color-muted)] transition-colors"
              title={displayName}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <div className="h-6 w-6 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] flex items-center justify-center text-xs font-semibold">{initial}</div>
              <ChevronDown className="h-3 w-3 text-[var(--color-muted-foreground)]" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-popover)] z-50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-[var(--color-border)]">
                  <div className="text-sm font-semibold truncate">{displayName}</div>
                  {user.email && <div className="text-xs text-[var(--color-muted-foreground)] truncate">{user.email}</div>}
                  <div className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-muted-foreground)] mt-1">{primaryRole}</div>
                </div>
                <button
                  role="menuitem"
                  onClick={onProfile}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[var(--color-muted)] text-left"
                >
                  <UserCog className="h-4 w-4" /> Profile Settings
                </button>
                <button
                  role="menuitem"
                  onClick={onLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[var(--color-muted)] text-left border-t border-[var(--color-border)]"
                >
                  <LogOut className="h-4 w-4" /> {t("common.logOut")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Layer 2 (Height 40px, h-10) */}
      <div className="h-10 flex items-center px-6 bg-[var(--color-card)] overflow-x-auto scrollbar-none">
        <SubNavLinks />
      </div>
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @radas/opensible-console typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/opensible-console/src/components/app-shell/Header.tsx
git commit -m "feat(console): refactor AppHeader to support Layer 1 and Layer 2 split"
```

---

### Task 3: Adjust RootLayout to handle new header geometry

**Files:**
- Modify: `apps/opensible-console/src/routes/__root.tsx:335-345`

**Interfaces:**
- Consumes: `AppHeader` from `src/components/app-shell/Header.tsx`.
- Produces: Correct main flex layout wrapping both Layer 1 and Layer 2 header bars.

- [ ] **Step 1: Verify and adjust RootLayout height wrappers**

Inspect `apps/opensible-console/src/routes/__root.tsx` lines ~335-345. Verify that it structures the full layout appropriately. The content canvas should fit cleanly below the header. The code is already:
```tsx
  return (
    <div className="flex h-screen w-full flex-col">
      <AppHeader />
      <main className="flex-1 overflow-auto bg-[var(--color-background)]">
        <div className="mx-auto w-full max-w-[1280px] px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
```
Since the `AppHeader` handles both layers internally and has a border-bottom, this container is already correct.
Ensure no styling conflicts are present.

- [ ] **Step 2: Verify compilation**

Run: `pnpm --filter @radas/opensible-console typecheck`
Expected: 0 errors.

Run: `pnpm --filter @radas/opensible-console build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

(If no changes were needed in `__root.tsx`, this commit is empty / omitted.)
```bash
git commit --allow-empty -m "chore(console): verify root layout header height integration"
```

---

### Task 4: Final verification and build

**Files:** none.

- [ ] **Step 1: Clean build verify**

Run: `pnpm --filter @radas/opensible-console typecheck && pnpm --filter @radas/opensible-console build`
Expected: Passes with no TS errors or bundle issues.

- [ ] **Step 2: Local visual smoke check**

Run: `pnpm --filter @radas/opensible-console dev`
Expected: Dev server runs. Test standard paths (e.g. `/dashboard`, `/cloud/summary`, `/infrastructure/deployment`) and verify Layer 2 horizontal links appear for each group.
