import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { RiArrowLeftLine as Back, RiClipboardLine as Copy, RiPlayLine as Play, RiRestartLine as Restart, RiStopLine as Stop, RiDeleteBinLine as Trash, RiUploadCloud2Line as Deploy, RiHistoryLine as Rollback } from "@remixicon/react";
import { api, createAttemptKey, getStoredUser, isForbidden, unwrapData, unwrapOperation } from "@/lib/api";
import { qk } from "@/lib/query";
import { Badge, statusToVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StateView } from "@/components/ui/StateView";
import { Tabs } from "@/components/ui/tabs";
import { ServiceOperationPanel, type ServiceOperation } from "@/components/services/ServiceOperationPanel";

export const Route = createFileRoute("/projects/$projectId/services/$serviceId")({ component: ServiceDetailPage });
type Service = { id: string; name: string; definition_slug?: string; definition_version?: string; environment?: string; runtime_id?: string; status?: string; desired_revision_id?: string; revision?: { id?: string; revision_number?: number; spec?: Record<string, unknown> }; endpoint_summary?: unknown; provider_ref?: unknown };
type CurrentUser = { id?: string; user_id?: string; username?: string; email?: string };
type RetryContext = { revision_id?: string; current_revision_id?: string; impact_token?: string; production_confirmation_token?: string; identity?: string; requested_by?: string };
type DetailResponse = { data?: { service?: Service }; service?: Service };
type OpsResponse = { data?: { operations?: ServiceOperation[] }; operations?: ServiceOperation[] };
type OpResponse = { operation?: ServiceOperation; data?: { operation?: ServiceOperation } };

function currentIdentity(): string | undefined {
  const user = getStoredUser<CurrentUser>();
  return user?.id || user?.user_id || user?.username || user?.email;
}

function retryContext(operation: ServiceOperation, service: Service | undefined): RetryContext {
  const context = operation.retry_context || {};
  const currentRevision = service?.desired_revision_id;
  const identity = currentIdentity();
  return {
    ...context,
    ...(currentRevision ? { current_revision_id: currentRevision } : {}),
    ...(identity ? { identity, requested_by: identity } : {}),
  };
}
const terminal = new Set(["succeeded", "failed", "canceled"]);
function ServiceDetailPage() {
  const { projectId, serviceId } = Route.useParams(); const qc = useQueryClient(); const [tab, setTab] = useState<"overview" | "activity">("overview"); const [confirm, setConfirm] = useState(false); const [updateOpen, setUpdateOpen] = useState(false); const [rollbackOpen, setRollbackOpen] = useState(false); const [updateSpec, setUpdateSpec] = useState("");
  const serviceQ = useQuery({ queryKey: qk.projectService(projectId, serviceId), queryFn: () => api<DetailResponse>("GET", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}`) });
  const operationsQ = useQuery({ queryKey: qk.serviceOperations(projectId, serviceId), queryFn: () => api<OpsResponse>("GET", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/operations`), enabled: !!serviceQ.data, refetchInterval: (query) => { const list = unwrapData<OpsResponse>(query.state.data)?.operations || query.state.data?.operations || []; return list.some((item) => !terminal.has(String(item.status || "").toLowerCase())) ? 3000 : false; } });
  const service = unwrapData<DetailResponse>(serviceQ.data)?.service || serviceQ.data?.service; const operations = unwrapData<OpsResponse>(operationsQ.data)?.operations || operationsQ.data?.operations || []; const latest = operations[0] || null;
  const readOperation = (response: OpResponse) => unwrapOperation<ServiceOperation>(response) || response.operation || response.data?.operation || null;
  const attemptKeys = useRef<Record<string, string>>({});
  const nextAttemptKey = (kind: string) => { const existing = attemptKeys.current[kind]; if (existing) return existing; const key = createAttemptKey(`${projectId}:${serviceId}:${kind}`, crypto.randomUUID()); attemptKeys.current[kind] = key; return key; };
  const lifecycle = useMutation({ mutationFn: ({ kind, body, retryToken }: { kind: string; body?: unknown; retryToken?: string }) => api<OpResponse>("POST", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/operations/${kind}`, body, { headers: { "Idempotency-Key": retryToken || nextAttemptKey(kind) } }), onSuccess: () => { void operationsQ.refetch(); void serviceQ.refetch(); toast.success("Operasi masuk antrean"); }, onError: (error: Error) => toast.error(error.message) });
  const productionOperationBody = service?.environment === "production" ? { production_confirmed: true, current_revision_id: service.desired_revision_id } : undefined;
  const retryOperation = async (operation: ServiceOperation) => {
    const kind = String(operation.kind || "deploy").replace(/^service\./, "");
    const context = retryContext(operation, service);
    attemptKeys.current[kind] = createAttemptKey(`${projectId}:${serviceId}:${kind}`, crypto.randomUUID());
    let impactToken = context.impact_token;
    if (service?.environment === "production") {
      try {
        const impactResponse = await api<{ data?: { impact?: { confirmation_token?: string } }; impact?: { confirmation_token?: string } }>("GET", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/impact`);
        impactToken = unwrapData(impactResponse)?.impact?.confirmation_token || impactToken;
      } catch { /* backend still verifies the current revision and identity */ }
    }
    const body = {
      ...(kind === "rollback" && context.revision_id ? { revision_id: context.revision_id } : {}),
      ...(kind === "rollback" && context.current_revision_id ? { current_revision_id: context.current_revision_id } : {}),
      ...(kind === "rollback" && impactToken ? { impact_token: impactToken } : {}),
      ...(kind === "rollback" && context.production_confirmation_token ? { production_confirmation_token: context.production_confirmation_token } : {}),
      ...(kind === "rollback" && context.identity ? { identity: context.identity } : {}),
      ...(kind === "rollback" && service?.environment === "production" ? { production_confirmed: true } : {}),
      ...(kind !== "rollback" && ["deploy", "update"].includes(kind) ? productionOperationBody : {}),
    };
    lifecycle.mutate({ kind, body: Object.keys(body).length ? body : undefined });
  };
  const updateKey = createAttemptKey(`${projectId}:${serviceId}:update`, updateSpec || "draft");
  const update = useMutation({ mutationFn: () => api<OpResponse>("PATCH", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}`, { spec: JSON.parse(updateSpec), ...(service?.environment === "production" ? { production_confirmed: true, current_revision_id: service.desired_revision_id } : {}) }, { headers: { "Idempotency-Key": updateKey } }), onSuccess: (result) => { setUpdateOpen(false); setTab("activity"); void operationsQ.refetch(); void serviceQ.refetch(); toast.success(`Update masuk antrean: ${readOperation(result)?.id || "queued"}`); }, onError: (error: Error) => toast.error(error.message) });
  const rollback = useMutation({ mutationFn: async () => { const history = await api<{ data?: { revisions?: Array<{ id: string; revision_number?: number }> } }>("GET", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/revisions`); const revisions = unwrapData<{ revisions?: Array<{ id: string; revision_number?: number }> }>(history)?.revisions || []; const target = revisions.find((item) => item.id !== service?.desired_revision_id && (item.revision_number || 0) < (service?.revision?.revision_number || 0)); if (!target) throw new Error("Tidak ada revision sebelumnya"); return api<OpResponse>("POST", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/operations/rollback`, { revision_id: target.id, ...(productionOperationBody || {}) }, { headers: { "Idempotency-Key": nextAttemptKey("rollback") } }); }, onSuccess: () => { setRollbackOpen(false); void operationsQ.refetch(); void serviceQ.refetch(); toast.success("Rollback masuk antrean"); }, onError: (error: Error) => toast.error(error.message) });
  const destroy = () => { if (!service) return; lifecycle.mutate({ kind: "destroy", body: { confirm: true, target_id: service.id, revision_id: service.desired_revision_id } }); setConfirm(false); };
  const endpoint = typeof service?.endpoint_summary === "string" ? service.endpoint_summary : service?.endpoint_summary && typeof service.endpoint_summary === "object" ? String((service.endpoint_summary as Record<string, unknown>).url || (service.endpoint_summary as Record<string, unknown>).endpoint || "") : "";
  const copyEndpoint = async () => { if (endpoint) { await navigator.clipboard?.writeText(endpoint); toast.success("Endpoint disalin"); } };
  const active = latest && !terminal.has(String(latest.status || "").toLowerCase()); const title = useMemo(() => service?.name || "Service", [service?.name]);
  if (serviceQ.isLoading) return <StateView state="loading" title="Memuat layanan…" />;
  if (serviceQ.isError) return <StateView state="error" title={isForbidden(serviceQ.error) ? "Akses layanan ditolak" : "Layanan tidak tersedia"} message={isForbidden(serviceQ.error) ? "Anda tidak memiliki akses ke project ini." : (serviceQ.error as Error).message} onRetry={() => void serviceQ.refetch()} action={<Link to="/projects/$projectId/services" params={{ projectId }}><Button size="sm" variant="ghost"><Back className="h-3.5 w-3.5" /> Services</Button></Link>} />;
  if (!service) return <StateView state="error" title="Layanan tidak ditemukan" message="Layanan mungkin telah dihapus atau akses project tidak tersedia." />;
  return <div className="space-y-6 animate-enter"><div><Link to="/projects/$projectId/services" params={{ projectId }} className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"><Back className="h-3.5 w-3.5" /> Services</Link><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-mono uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">{service.definition_slug || "Service"} · {service.environment}</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant={statusToVariant(service.status)}>{service.status || "draft"}</Badge><span className="text-sm text-[var(--color-muted-foreground)]">Revision {service.revision?.revision_number || service.definition_version || "—"} · {service.runtime_id}</span></div></div><div className="flex flex-wrap gap-2">{service.status === "draft" || service.status === "failed" ? <Button size="sm" onClick={() => lifecycle.mutate({ kind: "deploy", body: productionOperationBody })} disabled={!!active || lifecycle.isPending}><Deploy className="h-3.5 w-3.5" /> Deploy</Button> : null}<Button size="sm" variant="outline" onClick={() => lifecycle.mutate({ kind: "restart", body: undefined })} disabled={!!active || lifecycle.isPending}><Restart className="h-3.5 w-3.5" /> Restart</Button><Button size="sm" variant="outline" onClick={() => lifecycle.mutate({ kind: service.status === "stopped" ? "start" : "stop", body: service.status === "stopped" ? productionOperationBody : undefined })} disabled={!!active || lifecycle.isPending}>{service.status === "stopped" ? <Play className="h-3.5 w-3.5" /> : <Stop className="h-3.5 w-3.5" />} {service.status === "stopped" ? "Start" : "Stop"}</Button><Button size="sm" variant="destructive" onClick={() => setConfirm(true)} disabled={!!active || lifecycle.isPending}><Trash className="h-3.5 w-3.5" /> Destroy</Button></div></div></div><Tabs tabs={[{ id: "overview", label: "Overview" }, { id: "activity", label: "Activity & logs" }]} active={tab} onChange={setTab} id="service-detail" ariaLabel="Bagian detail layanan" />{tab === "overview" ? <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">Endpoint dan health</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{endpoint ? <div className="flex items-center justify-between gap-3 rounded-md bg-[var(--color-muted)]/50 p-3"><a className="min-w-0 truncate text-[var(--color-primary)]" href={endpoint} target="_blank" rel="noreferrer">{endpoint}</a><Button size="sm" variant="ghost" onClick={() => void copyEndpoint()} aria-label="Salin endpoint"><Copy className="h-3.5 w-3.5" /></Button></div> : <p className="text-[var(--color-muted-foreground)]">Endpoint muncul setelah runtime melaporkan deployment sehat.</p>}<div className="grid grid-cols-2 gap-3 text-xs"><div><span className="text-[var(--color-muted-foreground)]">Status observed</span><div className="mt-1 font-medium">{service.status}</div></div><div><span className="text-[var(--color-muted-foreground)]">Health</span><div className="mt-1 font-medium">{endpoint ? "Dilaporkan runtime" : "Menunggu pemeriksaan"}</div></div></div></CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Konfigurasi desired</CardTitle></CardHeader><CardContent className="space-y-2 text-xs"><p>Revision {service.revision?.revision_number || "—"} immutable. Update membuat revision baru.</p><p className="text-[var(--color-muted-foreground)]">Nilai secret di-redact; hanya referensi yang disimpan.</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setUpdateSpec(JSON.stringify(service.revision?.spec || {}, null, 2)); setUpdateOpen(true); }}>Update revision</Button><Button size="sm" variant="outline" onClick={() => setRollbackOpen(true)} disabled={!!active || rollback.isPending || (service.revision?.revision_number || 1) <= 1}><Rollback className="h-3.5 w-3.5" /> Rollback</Button></div></CardContent></Card></div> : operationsQ.isError ? <StateView state="error" title="Aktivitas operasi tidak tersedia" message={(operationsQ.error as Error).message} onRetry={() => void operationsQ.refetch()} /> : <ServiceOperationPanel projectId={projectId} serviceId={serviceId} operation={latest} onRetry={retryOperation} onChanged={() => { void operationsQ.refetch(); void serviceQ.refetch(); }} />}<ConfirmDialog open={confirm} title="Hapus layanan ini?" description="Tindakan ini tidak dapat dibatalkan untuk resource runtime dan endpoint." confirmLabel="Hapus layanan" variant="destructive" onConfirm={destroy} onCancel={() => setConfirm(false)} />{updateOpen && <ConfirmDialog open={updateOpen} title="Update revision" description="Masukkan JSON spec baru. Secret harus tetap berupa secret_ref." confirmLabel="Simpan revision" busy={update.isPending} onConfirm={() => { try { JSON.parse(updateSpec); update.mutate(); } catch { toast.error("Spec harus berupa JSON valid"); } }} onCancel={() => setUpdateOpen(false)}><textarea className="min-h-48 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-3 font-mono text-xs" value={updateSpec} onChange={(event) => setUpdateSpec(event.target.value)} aria-label="Spec revision baru" /></ConfirmDialog>}{rollbackOpen && <ConfirmDialog open={rollbackOpen} title="Rollback ke revision sebelumnya?" description="Rollback membuat revision baru dari snapshot immutable sebelumnya dan mencatat operasi serta audit." confirmLabel="Konfirmasi rollback" busy={rollback.isPending} onConfirm={() => rollback.mutate()} onCancel={() => setRollbackOpen(false)}><p className="text-sm">Revision aktif: {service.revision?.revision_number || "—"}. Backend akan memilih revision sebelumnya dalam project dan tenant yang sama.</p></ConfirmDialog>}</div>;
}
