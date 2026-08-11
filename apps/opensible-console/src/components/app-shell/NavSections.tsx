import { Link, useLocation } from "@tanstack/react-router";
import {
  RiHomeLine as Home, RiPieChartLine as PieChart, RiStackLine as Layers,
  RiAddLine as Plus, RiCalculatorLine as Calculator, RiSettings2Line as Settings2,
  RiRocketLine as Rocket, RiArchiveLine as Library, RiNodeTree as Network,
  RiBookOpenLine as BookOpen, RiShieldCheckLine as ShieldCheck, RiTeamLine as Users,
  RiCpuLine as Cpu, RiPlugLine as Plug, RiArrowDownSLine as ChevronDown,
} from "@remixicon/react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: typeof Home };

const SECTIONS = (t: ReturnType<typeof useT>) => [
  {
    title: t("nav.overview"),
    items: [
      { to: "/dashboard", label: t("nav.homeDashboard"), icon: Home },
    ] as Item[],
  },
  {
    title: t("nav.cloud"),
    items: [
      { to: "/cloud/summary", label: t("nav.summary"), icon: PieChart },
      { to: "/cloud/stacks", label: t("nav.stacks"), icon: Layers },
      { to: "/cloud/stacks/new", label: t("nav.newStack"), icon: Plus },
      { to: "/cloud/cost", label: t("nav.costAnalysis"), icon: Calculator },
      { to: "/cloud/settings", label: t("nav.projectSettings"), icon: Settings2 },
    ] as Item[],
  },
  {
    title: t("nav.infrastructure"),
    items: [
      { to: "/infrastructure/deployment", label: t("nav.deployment"), icon: Rocket },
      { to: "/infrastructure/templates", label: t("nav.jobsTemplates"), icon: Library },
      { to: "/infrastructure/hosts", label: t("nav.hosts"), icon: Network },
      { to: "/infrastructure/playbooks-roles", label: t("nav.playbooksRoles"), icon: BookOpen },
      { to: "/infrastructure/vaults-secrets", label: t("nav.vaultsSecrets"), icon: ShieldCheck },
      { to: "/settings", label: t("nav.projectSettings"), icon: Settings2 },
    ] as Item[],
  },
  {
    title: t("nav.system"),
    items: [
      { to: "/system/settings", label: t("nav.settings"), icon: Settings2 },
      { to: "/system/users", label: t("nav.usersManagement"), icon: Users },
      { to: "/system/workers", label: t("nav.workers"), icon: Cpu },
      { to: "/system/secrets", label: t("nav.secretsManagement"), icon: ShieldCheck },
      { to: "/system/api", label: t("nav.api"), icon: Plug },
    ] as Item[],
  },
];

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

export function NavSections() {
  const t = useT();
  const { pathname } = useLocation();
  return (
    <nav className="flex items-center gap-1">
      {SECTIONS(t).map((section) => {
        const sectionActive = section.items.some((it) => isActive(pathname, it.to));
        return (
          <DropdownMenu key={section.title}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1 px-3 h-8 rounded-md text-sm transition-colors",
                  sectionActive
                    ? "font-mono text-[11px] uppercase tracking-[0.071em] text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                    : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
                )}
              >
                {section.title}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8}>
              <DropdownMenuLabel>{section.title}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {section.items.map((it) => {
                  const active = isActive(pathname, it.to);
                  const Icon = it.icon;
                  return (
                    <DropdownMenuItem key={it.to} asChild>
                      <Link to={it.to} className={cn("gap-2", active && "text-[var(--color-accent)] font-medium")}>
                        <Icon className="h-4 w-4 shrink-0" />
                        {it.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}
