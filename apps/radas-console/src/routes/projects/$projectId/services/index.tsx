import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RiAddLine as Plus, RiArrowLeftLine as Back } from "@remixicon/react";
import { api } from "@/lib/api";
import { qk } from "@/lib/query";
import { Badge, statusToVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StateView } from "@/components/ui/StateView";

export const Route = createFileRoute("/projects/$projectId/services/")({ component: ServicesPage });

type Service = { id: string; name: string; definition_slug?: string; definition_version?: string; environment?: string; runtime_id?: string; status?: string; endpoint_summary?: unknown };
function ServicesPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: qk.projectServices(projectId), queryFn: () => api<{ services?: Service[] }>("GET", `/api/projects/${encodeURIComponent(projectId)}/services`) });
  if (query.isLoading) return <StateView state="loading" title="Loading project services…" />;
  if (query.isError) return <StateView state="error" title="Services are unavailable" message={(query.error as Error).message} onRetry={() => void query.refetch()} action={<Link to="/projects/$projectId" params={{ projectId }}><Button size="sm" variant="ghost"><Back className="h-3.5 w-3.5" /> Back to project</Button></Link>} />;
  const services = query.data?.services || [];
  return <div className="space-y-6 animate-enter"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Link to="/projects/$projectId" params={{ projectId }} className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"><Back className="h-3.5 w-3.5" /> Project overview</Link><p className="text-xs font-mono uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">Project services</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Services</h1><p className="mt-2 text-sm text-[var(--color-muted-foreground)]">Deploy and operate workloads inside project <span className="font-medium text-[var(--color-foreground)]">{projectId}</span>.</p></div><Button onClick={() => void navigate({ to: "/projects/$projectId/services/new", params: { projectId } })}><Plus className="h-4 w-4" /> New service</Button></div>{services.length === 0 ? <Card><CardContent className="p-2"><StateView state="empty" title="No services in this project" message="Choose a recommended service to create the first deployment." action={<Button size="sm" onClick={() => void navigate({ to: "/projects/$projectId/services/new", params: { projectId } })}><Plus className="h-3.5 w-3.5" /> Browse catalog</Button>} /></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{services.map((service) => <Card key={service.id} className="cursor-pointer transition-colors hover:border-[var(--color-primary)]/60" onClick={() => void navigate({ to: "/projects/$projectId/services/$serviceId", params: { projectId, serviceId: service.id } })}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><CardTitle className="text-sm">{service.name}</CardTitle><Badge variant={statusToVariant(service.status)}>{service.status || "draft"}</Badge></div><p className="text-xs text-[var(--color-muted-foreground)]">{service.definition_slug || "Service"} · {service.environment || "No environment"}</p></CardHeader><CardContent className="space-y-2 pt-0 text-xs text-[var(--color-muted-foreground)]"><div>Runtime: <span className="text-[var(--color-foreground)]">{service.runtime_id || "—"}</span></div><div>Desired version: <span className="text-[var(--color-foreground)]">{service.definition_version || "—"}</span></div><div className="pt-2 text-[var(--color-primary)]">Open service details →</div></CardContent></Card>)}</div>}</div>;
}
