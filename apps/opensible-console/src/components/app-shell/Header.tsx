import { RiLogoutBoxRLine as LogOut, RiAddLine as Plus, RiUserSettingsLine as UserCog, RiArrowDownSLine as ChevronDown, RiStackLine as StackLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import logoSvg from "@/assets/opensible-logo.png";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { getActiveSection, SubNavLinks } from "@/components/app-shell/NavSections";
import { useT } from "@/lib/i18n";
import { useProjects } from "@/lib/project";
import { logout } from "@/lib/auth";
import { NewProjectDialog } from "@/components/project/NewProjectDialog";
import { getStoredUser } from "@/lib/api";
import { cn } from "@/lib/utils";

type StoredUser = { username?: string; email?: string; roles?: string[]; role_details?: { name: string }[] };

export function AppHeader() {
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
