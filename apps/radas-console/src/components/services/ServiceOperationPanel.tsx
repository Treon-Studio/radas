import { useEffect, useMemo, useState } from "react";
import { RiCheckLine as Check, RiCloseLine as Close, RiLoader4Line as Loader, RiStopCircleLine as Stop } from "@remixicon/react";
import { api } from "@/lib/api";
import { Badge, statusToVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ServiceOperation = { id: string; kind?: string; status?: string; error_message?: string; created_at?: string; started_at?: string; finished_at?: string; endpoint?: string | null; health?: unknown; poll_url?: string };
type Event = { event?: string; message?: string; created_at?: string; details?: Record<string, unknown> };
type Props = { projectId: string; serviceId: string; operation?: ServiceOperation | null; onChanged?: () => void };

const terminal = new Set(["succeeded", "failed", "canceled"]);

export function ServiceOperationPanel({ projectId, serviceId, operation: initial, onChanged }: Props) {
  const [operation, setOperation] = useState(initial || null);
  const [events, setEvents] = useState<Event[]>([]);
  const [canceling, setCanceling] = useState(false);
  const active = !!operation && !terminal.has(String(operation.status || "").toLowerCase());
  useEffect(() => setOperation(initial || null), [initial]);
  useEffect(() => {
    if (!operation?.id || !active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await api<{ operation?: ServiceOperation }>("GET", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/operations/${encodeURIComponent(operation.id)}`);
        const next = result.operation || null;
        if (!stopped && next) setOperation(next);
        const eventResult = await api<{ events?: Event[] }>("GET", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/operations/${encodeURIComponent(operation.id)}/events?limit=100`);
        if (!stopped) setEvents(eventResult.events || []);
        if (!stopped && next && !terminal.has(String(next.status || "").toLowerCase())) timer = setTimeout(poll, 3000);
        else if (!stopped) onChanged?.();
      } catch { if (!stopped) timer = setTimeout(poll, 5000); }
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [active, operation?.id, projectId, serviceId, onChanged]);
  const status = String(operation?.status || "pending").toLowerCase();
  const progressLabel = useMemo(() => status === "queued" ? "Queued for a runtime worker" : status === "running" ? "Runtime operation in progress" : status === "succeeded" ? "Operation completed" : status === "failed" ? "Operation failed" : status === "canceled" ? "Operation canceled" : "Preparing operation", [status]);
  if (!operation) return <Card><CardContent className="p-5 text-sm text-[var(--color-muted-foreground)]">No service operation has been requested yet.</CardContent></Card>;
  const cancel = async () => { setCanceling(true); try { const result = await api<{ operation?: ServiceOperation }>("POST", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/operations/${encodeURIComponent(operation.id)}/cancel`, {}); setOperation(result.operation || { ...operation, status: "canceled" }); onChanged?.(); } finally { setCanceling(false); } };
  return <Card><CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><CardTitle className="text-sm">Latest operation</CardTitle><Badge variant={statusToVariant(status)}>{status}</Badge></div><p className="text-xs text-[var(--color-muted-foreground)]">{operation.kind || "service operation"} · {progressLabel}</p></CardHeader><CardContent className="space-y-4 pt-0"><div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">{active ? <Loader className="h-4 w-4 animate-spin" /> : status === "succeeded" ? <Check className="h-4 w-4 text-[var(--color-success)]" /> : <Close className="h-4 w-4 text-[var(--color-destructive)]" />}<span>{operation.error_message || progressLabel}</span></div>{active && <Button type="button" size="sm" variant="outline" onClick={() => void cancel()} disabled={canceling}><Stop className="h-3.5 w-3.5" /> {canceling ? "Canceling…" : "Cancel operation"}</Button>}{events.length > 0 && <div className="max-h-48 space-y-2 overflow-auto rounded-md bg-[var(--color-muted)]/50 p-3 font-mono text-xs">{events.map((event, index) => <div key={`${event.created_at || "event"}-${index}`} className="flex gap-2"><span className="text-[var(--color-muted-foreground)]">{event.created_at ? new Date(event.created_at).toLocaleTimeString() : ""}</span><span>{event.message || event.event || "Event"}</span></div>)}</div>}</CardContent></Card>;
}
