import { useEffect, useMemo, useState } from "react";
import { RiCheckLine as Check, RiCloseLine as Close, RiLoader4Line as Loader, RiStopCircleLine as Stop } from "@remixicon/react";
import { api, isForbidden, unwrapData, unwrapOperation, ApiError } from "@/lib/api";
import { Badge, statusToVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StateView } from "@/components/ui/StateView";

export type ServiceOperation = { id: string; kind?: string; status?: string; error_code?: string; error_message?: string; created_at?: string; started_at?: string; finished_at?: string; endpoint?: string | null; health?: unknown; result?: Record<string, unknown>; poll_url?: string };
type Event = { event?: string; message?: string; created_at?: string; details?: Record<string, unknown> };
type Props = { projectId: string; serviceId: string; operation?: ServiceOperation | null; onChanged?: () => void };
const terminal = new Set(["succeeded", "failed", "canceled"]);

type OperationResponse = { operation?: ServiceOperation; data?: { operation?: ServiceOperation } };
type EventsResponse = { events?: Event[] };
function readOperation(response: OperationResponse) { return unwrapOperation(response) || unwrapData<OperationResponse>(response)?.operation || unwrapData<OperationResponse>(response)?.data?.operation || null; }
function readEvents(response: EventsResponse) { return unwrapData<EventsResponse>(response)?.events || response.events || []; }

export function ServiceOperationPanel({ projectId, serviceId, operation: initial, onChanged }: Props) {
  const [operation, setOperation] = useState(initial || null);
  const [events, setEvents] = useState<Event[]>([]);
  const [canceling, setCanceling] = useState(false);
  const [pollError, setPollError] = useState<unknown>(null);
  const active = !!operation && !terminal.has(String(operation.status || "").toLowerCase());
  useEffect(() => setOperation(initial || null), [initial]);
  useEffect(() => {
    if (!operation?.id || !active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await api<OperationResponse>("GET", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/operations/${encodeURIComponent(operation.id)}`);
        const next = readOperation(result);
        const eventResult = await api<EventsResponse>("GET", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/operations/${encodeURIComponent(operation.id)}/events?limit=100`);
        if (stopped) return;
        setPollError(null);
        if (next) setOperation(next);
        setEvents(readEvents(eventResult));
        if (next && !terminal.has(String(next.status || "").toLowerCase())) timer = setTimeout(poll, 2500);
        else onChanged?.();
      } catch (error) {
        if (!stopped) { setPollError(error); timer = setTimeout(poll, 5000); }
      }
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [active, operation?.id, projectId, serviceId, onChanged]);
  if (!operation) return <Card><CardContent className="p-5 text-sm text-[var(--color-muted-foreground)]">Belum ada operasi layanan.</CardContent></Card>;
  const status = String(operation.status || "pending").toLowerCase();
  const progressLabel = useMemo(() => ({ queued: "Menunggu runtime", running: "Operasi runtime berjalan", succeeded: "Operasi selesai", failed: "Operasi gagal", canceled: "Operasi dibatalkan" }[status] || "Menyiapkan operasi"), [status]);
  const cancel = async () => { setCanceling(true); try { const result = await api<OperationResponse>("POST", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/operations/${encodeURIComponent(operation.id)}/cancel`, {}); setOperation(readOperation(result) || { ...operation, status: "canceled" }); onChanged?.(); } catch (error) { setPollError(error); } finally { setCanceling(false); } };
  if (pollError && isForbidden(pollError)) return <Card><CardContent className="p-5"><StateView state="error" title="Akses operasi ditolak" message="Anda tidak memiliki akses ke project ini." /></CardContent></Card>;
  const resultData = operation.result?.data && typeof operation.result.data === "object" ? operation.result.data as Record<string, unknown> : operation.result || {};
  const endpointValue = operation.endpoint || (typeof resultData.endpoint === "string" ? resultData.endpoint : "");
  const endpointLabel = String(endpointValue || "—");
  const health = operation.health ?? resultData.health;
  const hasHealth = health !== undefined && health !== null;
  const healthLabel: string = !hasHealth ? "—" : typeof health === "string" || typeof health === "number" || typeof health === "boolean" ? String(health) : String(JSON.stringify(health));
  return <Card><CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><CardTitle className="text-sm">Operasi terbaru</CardTitle><Badge variant={statusToVariant(status)}>{status}</Badge></div><p className="text-xs text-[var(--color-muted-foreground)]">{operation.kind || "service operation"} · {progressLabel}</p></CardHeader><CardContent className="space-y-4 pt-0"><div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">{active ? <Loader className="h-4 w-4 animate-spin" /> : status === "succeeded" ? <Check className="h-4 w-4 text-[var(--color-success)]" /> : <Close className="h-4 w-4 text-[var(--color-destructive)]" />}<span>{String(operation.error_message || progressLabel)}</span></div>{active && <Button type="button" size="sm" variant="outline" onClick={() => void cancel()} disabled={canceling}><Stop className="h-3.5 w-3.5" /> {canceling ? "Membatalkan…" : "Batalkan operasi"}</Button>}{(endpointValue || hasHealth) && <div className="grid gap-2 rounded-md bg-[var(--color-muted)]/50 p-3 text-xs sm:grid-cols-2"><div><span className="text-[var(--color-muted-foreground)]">Endpoint</span><div className="mt-1 break-all font-medium">{endpointLabel}</div></div><div><span className="text-[var(--color-muted-foreground)]">Health</span><div className="mt-1 font-medium">{healthLabel}</div></div></div>}{pollError != null && !isForbidden(pollError) && <p className="text-xs text-[var(--color-destructive)]">Pembaruan status gagal sementara; mencoba lagi.</p>}{events.length > 0 ? <div className="max-h-48 space-y-2 overflow-auto rounded-md bg-[var(--color-muted)]/50 p-3 font-mono text-xs">{events.map((event, index) => <div key={`${event.created_at || "event"}-${index}`} className="flex gap-2"><span className="text-[var(--color-muted-foreground)]">{event.created_at ? new Date(event.created_at).toLocaleTimeString("id-ID") : ""}</span><span>{String(event.message || event.event || "Event")}</span></div>)}</div> : <p className="text-xs text-[var(--color-muted-foreground)]">Belum ada event operasi.</p>}</CardContent></Card>;
}
