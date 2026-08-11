import { RiMoonLine as Moon, RiSunLine as Sun, RiTranslate as Languages, RiLogoutBoxRLine as LogOut, RiAddLine as Plus, RiUserSettingsLine as UserCog, RiArrowDownSLine as ChevronDown, RiStackLine as StackLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import logoSvg from "@/assets/opensible-logo.png";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { NavSections } from "@/components/app-shell/NavSections";
import { useTheme } from "@/lib/theme";
import { useLocale, useT, LOCALES, type Locale } from "@/lib/i18n";
import { useProjects } from "@/lib/project";
import { logout } from "@/lib/auth";
import { NewProjectDialog } from "@/components/project/NewProjectDialog";
import { getStoredUser } from "@/lib/api";

type StoredUser = { username?: string; email?: string; roles?: string[]; role_details?: { name: string }[] };

export function AppHeader() {
  const { theme, toggle } = useTheme();
  const { locale, setLocale } = useLocale();
  const t = useT();
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

  return (
    <header className="h-16 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-background)] flex items-center justify-between px-6 gap-4">
      <div className="flex items-center gap-6 min-w-0">
        <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0">
          <img src={logoSvg} className="h-8 w-8" alt="OpenSible" />
          <span className="hidden md:inline text-sm font-medium tracking-tight">{t("app.name")}</span>
        </Link>
        <NavSections />
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden xl:block w-[200px]">
          <Select
            value={currentId ?? ""}
            onChange={(v) => setCurrent(v || null)}
            disabled={loading}
            placeholder={loading ? t("common.loading") : t("common.noProjects")}
            prefix={<StackLine className="h-3.5 w-3.5 text-[var(--color-foreground)] shrink-0" />}
            options={projects.map(p => ({ value: p.id, label: p.name, description: p.description }))}
            triggerClassName="h-8 rounded-full"
            align="start"
          />
        </div>

        <Button variant="outline" size="pill" onClick={() => setNewProjectOpen(true)} title={t("common.createNewProject")}>
          <Plus className="h-4 w-4" />
          <span className="hidden md:inline">{t("common.newProject")}</span>
        </Button>

        <div className="w-[150px]">
          <Select
            value={locale}
            onChange={(v) => setLocale(v as Locale)}
            options={LOCALES.map((l) => ({
              value: l.code,
              label: `${l.flag}  ${l.nativeLabel}`,
              description: l.label !== l.nativeLabel ? l.label : undefined,
            }))}
            prefix={<Languages className="h-3.5 w-3.5 text-[var(--color-foreground)] shrink-0" />}
            align="end"
          />
        </div>

        <Button variant="ghost" size="icon" onClick={toggle} title={t("common.theme")} className="rounded-full">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-2 pl-1 pr-2 h-8 rounded-full hover:bg-[var(--color-muted)] transition-colors"
            title={displayName}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className="h-8 w-8 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] flex items-center justify-center text-sm font-medium">{initial}</div>
            <div className="hidden sm:flex flex-col items-start leading-tight max-w-[140px]">
              <span className="text-sm font-medium truncate max-w-[140px]">{displayName}</span>
              <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-muted-foreground)] truncate max-w-[140px]">{primaryRole}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] ml-0.5" />
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
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </header>
  );
}
