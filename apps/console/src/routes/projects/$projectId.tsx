import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import {
  RiAlertLine as Alert,
  RiArrowRightLine as ArrowRight,
  RiCloudLine as Cloud,
  RiFolder2Line as FolderKanban,
  RiRefreshLine as Refresh,
  RiStackLine as ServicesIcon,
  RiTimeLine as Clock,
} from "@remixicon/react"
import { Badge, statusToVariant } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StateView } from "@/components/ui/StateView"
import { api, isForbidden, unwrapData } from "@/lib/api"
import { useProjects } from "@/lib/project"
import { qk } from "@/lib/query"

type ServiceHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown"

type AttentionItem = {
  kind: "service_health" | "run" | "drift"
  severity: "critical" | "warning"
  title: string
  occurred_at: number | null
  target: { type: "service" | "run" | "stack"; id: string }
}

type RecentRun = {
  id: string
  stack: string
  action: string
  status: string
  started_at: number | null
  finished_at: number | null
}

type ServiceHealth = {
  instance_id: string
  name: string
  environment: string
  status: ServiceHealthStatus
  observed_at: number | null
}

type ProjectDashboard = {
  project: { id: string; name: string; description: string }
  summary: {
    stacks: { total: number; drifted: number }
    runs: { active: number; failed: number }
    services: {
      total: number
      healthy: number
      degraded: number
      unhealthy: number
      unknown: number
    }
    requires_attention: number
  }
  attention: AttentionItem[]
  recent_runs: RecentRun[]
  service_health: ServiceHealth[]
}

export const Route = createFileRoute("/projects/$projectId")({ component: ProjectOverview })

function relativeTime(value: number | null): string {
  if (!value || !Number.isFinite(value)) return "—"
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - value))
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function healthVariant(status: ServiceHealthStatus) {
  if (status === "healthy") return "success" as const
  if (status === "degraded") return "warning" as const
  if (status === "unhealthy") return "destructive" as const
  return "default" as const
}

function ProjectOverview() {
  const { pathname } = useLocation()
  const { projectId } = Route.useParams()
  const { projects, current, loading, setCurrent } = useProjects()
  const project = projects.find((item) => item.id === projectId)
  const dashboardQuery = useQuery({
    queryKey: qk.projectDashboard(projectId),
    queryFn: async () =>
      unwrapData<ProjectDashboard>(
        await api<{ data: ProjectDashboard }>(
          "GET",
          `/api/projects/${encodeURIComponent(projectId)}/dashboard`,
        ),
      ),
    enabled: Boolean(project) && pathname === `/projects/${projectId}`,
  })

  useEffect(() => {
    if (project && current?.id !== project.id) {
      void setCurrent(project.id)
    }
  }, [current?.id, project, setCurrent])

  if (loading) return <StateView state="loading" title="Memuat project…" />
  if (!project) {
    return (
      <StateView
        state="error"
        title="Project tidak ditemukan atau akses ditolak"
        message="Project ini tidak tersedia untuk akun Anda. Periksa izin project atau pilih project lain."
      />
    )
  }

  if (pathname !== `/projects/${projectId}`) return <Outlet />
  if (dashboardQuery.isLoading) {
    return <StateView state="loading" title="Loading project dashboard…" />
  }
  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <StateView
        state="error"
        title={isForbidden(dashboardQuery.error) ? "Project access denied" : "Unable to load project dashboard"}
        message={dashboardQuery.error instanceof Error ? dashboardQuery.error.message : undefined}
        onRetry={() => void dashboardQuery.refetch()}
      />
    )
  }

  const dashboard = dashboardQuery.data
  const isEmpty = dashboard.summary.stacks.total === 0 && dashboard.summary.services.total === 0

  return (
    <div className="space-y-8 animate-enter">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">Project</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{dashboard.project.name}</h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            {dashboard.project.description || "Your project workspace"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
          <Refresh className={dashboardQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      {isEmpty ? (
        <StateView
          state="empty"
          title="This project has no managed resources yet"
          message="Create a stack or deploy a service to begin tracking operational health."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" asChild>
                <Link to="/cloud/stacks">Open Cloud</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to="/projects/$projectId/services" params={{ projectId }}>Open Services</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Operational summary">
            <MetricCard label="Stacks" value={dashboard.summary.stacks.total} detail={`${dashboard.summary.stacks.drifted} drifted`} />
            <MetricCard label="Drifted" value={dashboard.summary.stacks.drifted} detail="requires review" tone="warning" />
            <MetricCard label="Runs" value={dashboard.summary.runs.active} detail={`${dashboard.summary.runs.failed} failed`} tone={dashboard.summary.runs.failed ? "destructive" : "default"} />
            <MetricCard label="Services needing attention" value={dashboard.summary.requires_attention} detail={`${dashboard.summary.services.total} total services`} tone={dashboard.summary.requires_attention ? "destructive" : "success"} />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <DashboardCard title="Needs attention" icon={<Alert className="h-4 w-4" />}>
              {dashboard.attention.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">No action required right now.</p>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {dashboard.attention.map((item) => (
                    <AttentionLink key={`${item.kind}-${item.target.id}`} item={item} projectId={projectId} />
                  ))}
                </ul>
              )}
            </DashboardCard>

            <DashboardCard title="Recent runs" icon={<Clock className="h-4 w-4" />}>
              {dashboard.recent_runs.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">No infrastructure runs yet.</p>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {dashboard.recent_runs.map((run) => (
                    <li key={run.id}>
                      <Link to="/cloud/summary" className="flex items-center justify-between gap-3 py-3 text-sm hover:text-[var(--color-primary)]">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{run.stack}</span>
                          <span className="block font-mono text-xs text-[var(--color-muted-foreground)]">tofu {run.action} · {relativeTime(run.started_at ?? run.finished_at)}</span>
                        </span>
                        <Badge variant={statusToVariant(run.status)}>{run.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardCard>
          </section>

          <DashboardCard title="Service health" icon={<ServicesIcon className="h-4 w-4" />}>
            {dashboard.service_health.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">No services are being tracked yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {dashboard.service_health.map((service) => (
                  <li key={service.instance_id}>
                    <Link
                      to="/projects/$projectId/services/$serviceId"
                      params={{ projectId, serviceId: service.instance_id }}
                      className="flex items-center justify-between gap-3 py-3 text-sm hover:text-[var(--color-primary)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{service.name}</span>
                        <span className="block text-xs text-[var(--color-muted-foreground)]">{service.environment} · {relativeTime(service.observed_at)}</span>
                      </span>
                      <Badge variant={healthVariant(service.status)}>{service.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>
        </>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string
  value: number
  detail: string
  tone?: "default" | "success" | "warning" | "destructive"
}) {
  const color = tone === "success"
    ? "text-[var(--color-success)]"
    : tone === "warning"
      ? "text-[var(--color-warning)]"
      : tone === "destructive"
        ? "text-[var(--color-destructive)]"
        : "text-[var(--color-foreground)]"

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">{label}</p>
        <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{detail}</p>
      </CardContent>
    </Card>
  )
}

function DashboardCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          {icon}
          <h2>{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function AttentionLink({ item, projectId }: { item: AttentionItem; projectId: string }) {
  const content = (
    <>
      <span className="min-w-0">
        <span className="block truncate font-medium">{item.title}</span>
        <span className="block text-xs text-[var(--color-muted-foreground)]">{relativeTime(item.occurred_at)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Badge variant={item.severity === "critical" ? "destructive" : "warning"}>{item.kind.replace("_", " ")}</Badge>
        <ArrowRight className="h-4 w-4" />
      </span>
    </>
  )

  if (item.target.type === "service") {
    return (
      <li>
        <Link to="/projects/$projectId/services/$serviceId" params={{ projectId, serviceId: item.target.id }} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-[var(--color-primary)]">
          {content}
        </Link>
      </li>
    )
  }
  if (item.target.type === "stack") {
    return (
      <li>
        <Link to="/cloud/stacks/$stackId" params={{ stackId: item.target.id }} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-[var(--color-primary)]">
          {content}
        </Link>
      </li>
    )
  }
  return (
    <li>
      <Link to="/cloud/summary" className="flex items-center justify-between gap-3 py-3 text-sm hover:text-[var(--color-primary)]">
        {content}
      </Link>
    </li>
  )
}
