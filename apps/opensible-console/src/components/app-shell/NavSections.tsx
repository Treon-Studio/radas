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

export function NavSections() { return null; }

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
