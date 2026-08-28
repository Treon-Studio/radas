import { Link, useLocation } from "@tanstack/react-router";
import {
  RiHomeLine as Home, RiPieChartLine as PieChart, RiStackLine as Layers,
  RiAddLine as Plus, RiCalculatorLine as Calculator, RiSettings2Line as Settings2,
  RiRocketLine as Rocket, RiArchiveLine as Library, RiNodeTree as Network,
  RiBookOpenLine as BookOpen, RiShieldCheckLine as ShieldCheck, RiTeamLine as Users,
  RiCpuLine as Cpu, RiPlugLine as Plug, RiFlagLine as Flag, RiFlaskLine as Flask,
  RiGithubLine as Github, RiCloudLine as Cloud, RiCodeBoxLine as CodeBox, RiStackLine as Services,
  RiRobotLine as Robot, RiFileListLine as FileList, RiTimerLine as Timer,
  RiWebhookLine as Webhook, RiGitBranchLine as Branch,
} from "@remixicon/react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: typeof Home };

const SECTIONS = (t: ReturnType<typeof useT>) => ({
  overview: [
    { to: "/dashboard", label: t("nav.homeDashboard"), icon: Home },
  ] as Item[],
  services: [
    { to: "/projects/$projectId/services/", label: "Services", icon: Services },
  ] as Item[],
  cloud: [
    { to: "/cloud/summary", label: t("nav.summary"), icon: PieChart },
    { to: "/cloud/stacks", label: t("nav.stacks"), icon: Layers },
    { to: "/cloud/stacks/new", label: t("nav.newStack"), icon: Plus },
    { to: "/cloud/cost", label: t("nav.costAnalysis"), icon: Calculator },
    { to: "/cloud/flags", label: t("nav.flags"), icon: Flag },
    { to: "/cloud/tests", label: t("nav.tests"), icon: Flask },
    { to: "/cloud/byoc", label: t("nav.byoc"), icon: Cloud },
    { to: "/cloud/registry", label: t("nav.registry"), icon: CodeBox },
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
    { to: "/system/ai", label: "AI Gateway (9Router)", icon: Cpu },
    { to: "/system/users", label: t("nav.usersManagement"), icon: Users },
    { to: "/system/workers", label: t("nav.workers"), icon: Cpu },
    { to: "/system/secrets", label: t("nav.secretsManagement"), icon: ShieldCheck },
    { to: "/system/api", label: t("nav.api"), icon: Plug },
    { to: "/system/github-actions", label: t("nav.githubActions"), icon: Github },
    { to: "/system/automation", label: "Automation Rules", icon: Robot },
    { to: "/system/audit", label: "Audit Log", icon: FileList },
    { to: "/system/retry-policy", label: "Retry Policy", icon: Timer },
    { to: "/system/inbound-webhooks", label: "Inbound Webhooks", icon: Webhook },
    { to: "/system/branch-mapping", label: "Branch Mapping", icon: Branch },
  ] as Item[],
});

export function getActiveSection(pathname: string): "overview" | "services" | "cloud" | "infrastructure" | "system" {
  if (pathname.startsWith("/projects/") && pathname.includes("/services")) return "services";
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
  return <SidebarNav />;
}

export function SidebarNav() {
  const t = useT();
  const { pathname } = useLocation();
  const activeSection = getActiveSection(pathname);

  const sections = SECTIONS(t);

  const sectionMap = {
    overview: { title: "MAIN", items: sections.overview },
    cloud: { title: t("nav.cloud").toUpperCase(), items: sections.cloud },
    infrastructure: { title: t("nav.infrastructure").toUpperCase(), items: sections.infrastructure },
    system: { title: t("nav.system").toUpperCase(), items: sections.system },
    services: { title: "SERVICES", items: sections.services },
  };

  const activeGroup = sectionMap[activeSection] || sectionMap.overview;

  return (
    <div className="flex flex-col py-4 px-3 space-y-4 font-mono">
      <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.15em] text-[var(--color-muted-foreground)] font-bold border-b border-[var(--color-border)]/60">
        {activeGroup.title}
      </div>
      <nav className="space-y-1">
        {activeGroup.items.map((it) => {
          const Icon = it.icon;
          const active = isActive(pathname, it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 text-xs font-mono pxl-corner-sm transition-all duration-150 group",
                active
                  ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)] font-bold pxl-shadow border-l-2 border-[var(--color-primary)]"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/60"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  active
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-muted-foreground)] group-hover:text-[var(--color-foreground)]"
                )}
              />
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
