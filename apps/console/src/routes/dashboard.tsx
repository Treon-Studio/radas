import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  RiArrowRightLine as ArrowRight,
  RiAddLine as Plus,
  RiFolder2Line as FolderKanban,
  RiComputerLine as Computer,
  RiRocketLine as Rocket,
  RiPlayLine as Play,
  RiShieldCheckLine as ShieldCheck,
  RiDownload2Line as Download,
  RiUser3Line as UserIcon,
  RiCpuLine as Cpu,
  RiDatabase2Line as Database,
  RiCheckDoubleLine as CheckDouble,
  RiTerminalBoxLine as Terminal,
  RiStackLine as Layers,
  RiPulseLine as Activity,
  RiServerLine as Server,
  RiLineChartLine as TrendingUp,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProjects, type Project } from "@/lib/project";
import { NewProjectDialog } from "@/components/project/NewProjectDialog";
import { useT } from "@/lib/i18n";
import { api, getStoredUser } from "@/lib/api";
import { qk } from "@/lib/query";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

type StoredUser = { username?: string; email?: string; roles?: string[] };
type Org = { id: string; name: string; role?: string };
type Worker = { id?: string; name?: string; status?: string };

// 8-Bit Pixelated Step Activity Data
const activityData = [
  { day: "Mon", executions: 4, syncs: 2 },
  { day: "Tue", executions: 8, syncs: 5 },
  { day: "Wed", executions: 6, syncs: 4 },
  { day: "Thu", executions: 14, syncs: 9 },
  { day: "Fri", executions: 11, syncs: 7 },
  { day: "Sat", executions: 5, syncs: 2 },
  { day: "Sun", executions: 9, syncs: 6 },
];

export function Dashboard() {
  const t = useT();
  const navigate = useNavigate();
  const { projects, currentId, loading, setCurrent } = useProjects();
  const [createOpen, setCreateOpen] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);

  const user = getStoredUser<StoredUser>() || {};
  const username = user.username || "treonstudio";

  useEffect(() => {
    let alive = true;
    api<{ orgs: Org[] }>("GET", "/api/orgs")
      .then((d) => {
        if (alive) setOrgs(d.orgs ?? []);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const workersQ = useQuery({
    queryKey: qk.dashboardWorkers(currentId),
    queryFn: () => api<{ workers?: Worker[] }>("GET", "/api/system/workers"),
  });

  const activeProjects = projects.filter((p) => !p.isArchived && !p.archived);
  const activeOrgName = orgs[0]?.name || "Treon Studio";

  const openProject = async (project: Project) => {
    await setCurrent(project.id);
    await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  };

  return (
    <div className="space-y-8 animate-enter pb-16">
      
      {/* KPI Stats Counter Row (4 Pixel Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        <Card className="border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md bg-[var(--color-card)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-mono uppercase tracking-widest text-[var(--color-muted-foreground)]">Active Stacks</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono">4</span>
                <span className="text-[10px] text-emerald-400 font-mono flex items-center">
                  <TrendingUp className="h-3 w-3 mr-0.5" /> +20%
                </span>
              </div>
            </div>
            <div className="h-11 w-11 pxl-corner-sm bg-cyan-500/15 border-2 border-cyan-500/40 flex items-center justify-center">
              <Layers className="h-5 w-5 text-cyan-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md bg-[var(--color-card)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-mono uppercase tracking-widest text-[var(--color-muted-foreground)]">Playbook Runs</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono">32</span>
                <span className="text-[10px] text-emerald-400 font-mono flex items-center">
                  <CheckDouble className="h-3 w-3 mr-0.5" /> 96.8%
                </span>
              </div>
            </div>
            <div className="h-11 w-11 pxl-corner-sm bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center">
              <Play className="h-5 w-5 text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md bg-[var(--color-card)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-mono uppercase tracking-widest text-[var(--color-muted-foreground)]">Managed VMs</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono">14</span>
                <span className="text-[10px] text-sky-400 font-mono">ByteDC Cloud</span>
              </div>
            </div>
            <div className="h-11 w-11 pxl-corner-sm bg-sky-500/15 border-2 border-sky-500/40 flex items-center justify-center">
              <Server className="h-5 w-5 text-sky-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md bg-[var(--color-card)]">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-mono uppercase tracking-widest text-[var(--color-muted-foreground)]">Vault Secrets</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono">18</span>
                <span className="text-[10px] text-amber-400 font-mono">Encrypted</span>
              </div>
            </div>
            <div className="h-11 w-11 pxl-corner-sm bg-amber-500/15 border-2 border-amber-500/40 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
            </div>
          </CardContent>
        </Card>

      </div>

      {/* 2-Column Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        
        {/* Left Column (Main Content - 8 Cols) */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Beep Boop Speech Bubble Banner (PXL NES Balloon) */}
          <div className="flex items-center gap-4 bg-[var(--color-card)] border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md p-5">
            <div className="h-12 w-12 pxl-corner-sm bg-[var(--color-primary)]/15 border-2 border-[var(--color-primary)]/40 flex items-center justify-center shrink-0 animate-pixel-bounce">
              <Computer className="h-6 w-6 text-[var(--color-primary)]" />
            </div>
            <div className="flex-1 min-w-0 bg-[var(--color-muted)]/60 border-2 border-[var(--color-border)] pxl-corner-sm px-5 py-3 text-xs sm:text-sm font-mono leading-relaxed">
              <span className="text-[var(--color-primary)] font-bold">Beep boop!</span> Welcome back,{" "}
              <span className="font-bold text-[var(--color-foreground)]">{username}</span>. Your OpenTofu &amp; Ansible GitOps workspace is active.
            </div>
          </div>

          {/* 8-Bit Pixelated Stepped Area Chart (PXL UI KIT Styling) */}
          <Card className="border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md bg-[var(--color-card)]">
            <CardHeader className="p-6 pb-2 border-b-2 border-[var(--color-border)] flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold uppercase tracking-widest font-mono flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--color-primary)]" /> Execution Activity (8-Bit Stepped)
                </CardTitle>
                <p className="text-xs text-[var(--color-muted-foreground)] mt-1 font-mono">
                  Weekly 8-bit stepped activity trend for Ansible jobs &amp; OpenTofu syncs.
                </p>
              </div>
              <Badge variant="cyan" className="font-mono text-[10px] pxl-corner-sm border border-cyan-400/40">
                Pixelated Sync
              </Badge>
            </CardHeader>
            <CardContent className="p-6 pt-4">
              <div className="h-56 w-full pxl-chart-step">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorExecutions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorSyncs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border)" opacity={0.6} />
                    <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        borderColor: "var(--color-border)",
                        borderWidth: "2px",
                        boxShadow: "3px 3px 0 0 rgba(0, 0, 0, 0.3)",
                        fontSize: "12px",
                        fontFamily: "monospace",
                      }}
                    />
                    <Area
                      type="stepAfter"
                      dataKey="executions"
                      name="Playbook Executions"
                      stroke="var(--color-primary)"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorExecutions)"
                    />
                    <Area
                      type="stepAfter"
                      dataKey="syncs"
                      name="Stack Syncs"
                      stroke="#10b981"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorSyncs)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Your Projects Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest font-mono flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-[var(--color-primary)]" />
                Your Projects ({activeProjects.length})
              </h2>
              <Button size="sm" variant="outline" className="text-xs px-3 pxl-corner-sm pxl-btn-shadow" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> {t("common.newProject")}
              </Button>
            </div>

            {loading ? (
              <div className="border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md bg-[var(--color-card)] p-12 text-center text-xs text-[var(--color-muted-foreground)] font-mono">
                Loading projects…
              </div>
            ) : activeProjects.length === 0 ? (
              <div className="border-2 border-dashed border-[var(--color-border)] pxl-corner-md bg-[var(--color-card)] p-12 text-center space-y-4">
                <p className="text-sm text-[var(--color-muted-foreground)]">No active projects in organization {activeOrgName}.</p>
                <Button size="sm" className="pxl-corner-sm pxl-btn-shadow" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Create project
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {activeProjects.map((project) => (
                  <Card
                    key={project.id}
                    className="group cursor-pointer border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md hover:border-[var(--color-primary)] transition-all bg-[var(--color-card)]"
                    onClick={() => void openProject(project)}
                  >
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="h-10 w-10 pxl-corner-sm bg-[var(--color-primary)]/15 border-2 border-[var(--color-primary)]/30 flex items-center justify-center">
                          <FolderKanban className="h-5 w-5 text-[var(--color-primary)]" />
                        </div>
                        <ArrowRight className="h-5 w-5 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] group-hover:translate-x-1.5 transition-all" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-bold text-base truncate">{project.name}</h3>
                        <p className="text-xs text-[var(--color-muted-foreground)] line-clamp-2 leading-relaxed min-h-[36px]">
                          {project.description || "No description provided"}
                        </p>
                      </div>
                      <div className="pt-3 border-t-2 border-[var(--color-border)] flex items-center justify-between text-xs font-mono text-[var(--color-muted-foreground)]">
                        <Badge variant="success" className="text-[10px] px-2 py-0.5 pxl-corner-sm">Active</Badge>
                        <span className="group-hover:text-[var(--color-primary)] font-semibold transition-colors flex items-center gap-1">
                          Open workspace →
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions Grid */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest font-mono">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Link
                to="/cloud/stacks/new"
                className="bg-[var(--color-card)] border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md p-5 flex flex-col items-center justify-center text-center hover:border-[var(--color-primary)] transition-all group space-y-1.5"
              >
                <Layers className="h-6 w-6 text-[var(--color-primary)] mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">New Stack</span>
                <span className="text-[10px] text-[var(--color-muted-foreground)] font-mono">OpenTofu</span>
              </Link>
              <Link
                to="/infrastructure/templates"
                className="bg-[var(--color-card)] border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md p-5 flex flex-col items-center justify-center text-center hover:border-[var(--color-primary)] transition-all group space-y-1.5"
              >
                <Play className="h-6 w-6 text-emerald-500 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Run Playbook</span>
                <span className="text-[10px] text-[var(--color-muted-foreground)] font-mono">Ansible Job</span>
              </Link>
              <Link
                to="/infrastructure/hosts"
                className="bg-[var(--color-card)] border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md p-5 flex flex-col items-center justify-center text-center hover:border-[var(--color-primary)] transition-all group space-y-1.5"
              >
                <Download className="h-6 w-6 text-sky-500 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Import Hosts</span>
                <span className="text-[10px] text-[var(--color-muted-foreground)] font-mono">Cloud VMs</span>
              </Link>
              <Link
                to="/infrastructure/vaults-secrets"
                className="bg-[var(--color-card)] border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md p-5 flex flex-col items-center justify-center text-center hover:border-[var(--color-primary)] transition-all group space-y-1.5"
              >
                <ShieldCheck className="h-6 w-6 text-amber-500 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Vault Keys</span>
                <span className="text-[10px] text-[var(--color-muted-foreground)] font-mono">Secrets</span>
              </Link>
            </div>
          </div>

        </div>

        {/* Right Column (Sidebar Widgets - 4 Cols) */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* User Profile Card (PXL UI KIT) */}
          <Card className="border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md bg-[var(--color-card)]">
            <CardHeader className="p-5 pb-4 border-b-2 border-[var(--color-border)]">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-full bg-[var(--color-primary)]/20 border-2 border-[var(--color-primary)] flex items-center justify-center font-bold text-base text-[var(--color-primary)] shadow-sm">
                  {username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base font-bold truncate">{username}</CardTitle>
                  <p className="text-xs text-[var(--color-muted-foreground)] truncate mt-0.5">{user.email || "Administrator"}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-muted-foreground)]">Organization</span>
                <Badge variant="cyan" className="font-mono text-[10px] px-2.5 py-0.5 pxl-corner-sm">{activeOrgName}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-muted-foreground)]">Access Level</span>
                <Badge variant="default" className="text-[10px] px-2.5 py-0.5 pxl-corner-sm">Owner</Badge>
              </div>
              <div className="pt-3 border-t-2 border-[var(--color-border)]">
                <Button size="sm" variant="outline" className="w-full text-xs font-semibold py-2 pxl-corner-sm pxl-btn-shadow" onClick={() => void navigate({ to: "/profile" })}>
                  <UserIcon className="h-3.5 w-3.5 mr-2" /> View Profile
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stepped Pixel Resource Distribution Meter */}
          <Card className="border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md bg-[var(--color-card)]">
            <CardHeader className="p-5 pb-3 border-b-2 border-[var(--color-border)]">
              <CardTitle className="text-xs font-bold uppercase tracking-widest font-mono">Resource Distribution (Pixel Meter)</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-muted-foreground)]">OpenTofu Stacks</span>
                  <span className="font-bold text-cyan-400">65%</span>
                </div>
                <div className="h-3.5 w-full border-2 border-[var(--color-border)] bg-[var(--color-muted)] pxl-corner-sm overflow-hidden pxl-meter-bar">
                  <div className="h-full bg-cyan-400" style={{ width: "65%" }} />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-muted-foreground)]">Ansible Playbooks</span>
                  <span className="font-bold text-emerald-400">25%</span>
                </div>
                <div className="h-3.5 w-full border-2 border-[var(--color-border)] bg-[var(--color-muted)] pxl-corner-sm overflow-hidden pxl-meter-bar">
                  <div className="h-full bg-emerald-400" style={{ width: "25%" }} />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-muted-foreground)]">Vault &amp; Secrets</span>
                  <span className="font-bold text-amber-400">10%</span>
                </div>
                <div className="h-3.5 w-full border-2 border-[var(--color-border)] bg-[var(--color-muted)] pxl-corner-sm overflow-hidden pxl-meter-bar">
                  <div className="h-full bg-amber-400" style={{ width: "10%" }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Health Status Widget */}
          <Card className="border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md bg-[var(--color-card)]">
            <CardHeader className="p-5 pb-4 border-b-2 border-[var(--color-border)]">
              <CardTitle className="text-xs font-bold uppercase tracking-widest font-mono flex items-center gap-2">
                <Cpu className="h-4 w-4 text-[var(--color-primary)]" /> System Health
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-500" /> PostgreSQL DB
                </span>
                <span className="text-emerald-500 font-bold flex items-center gap-1.5">
                  <CheckDouble className="h-3.5 w-3.5" /> Connected
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-sky-500" /> OpenSible Server
                </span>
                <span className="text-emerald-500 font-bold flex items-center gap-1.5">
                  <CheckDouble className="h-3.5 w-3.5" /> Online (:5001)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-purple-500" /> Go Worker Nodes
                </span>
                <Badge variant="cyan" className="text-[10px] px-2 py-0.5 pxl-corner-sm">
                  {workersQ.data?.workers?.length || 1} worker(s) online
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Navigation Shortcuts */}
          <Card className="border-2 border-[var(--color-border)] pxl-card-shadow pxl-corner-md bg-[var(--color-card)]">
            <CardHeader className="p-5 pb-3 border-b-2 border-[var(--color-border)]">
              <CardTitle className="text-xs font-bold uppercase tracking-widest font-mono">Shortcuts</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <nav className="space-y-1 text-xs font-mono">
                <Link
                  to="/cloud/summary"
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-lg hover:bg-[var(--color-muted)] transition-colors group"
                >
                  <span>Cloud Summary</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] group-hover:translate-x-1 transition-all" />
                </Link>
                <Link
                  to="/infrastructure/deployment"
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-lg hover:bg-[var(--color-muted)] transition-colors group"
                >
                  <span>Deployment History</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] group-hover:translate-x-1 transition-all" />
                </Link>
                <Link
                  to="/system/settings"
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-lg hover:bg-[var(--color-muted)] transition-colors group"
                >
                  <span>System Settings</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)] group-hover:translate-x-1 transition-all" />
                </Link>
              </nav>
            </CardContent>
          </Card>

        </div>

      </div>

      <NewProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => void navigate({ to: "/projects/$projectId", params: { projectId: id } })}
      />
    </div>
  );
}
