import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, unwrapData } from "@/lib/api";

type Health = { current?: { status?: string; observed_at?: number | null }; endpoint?: unknown; provider_ref?: unknown };
type Timeline = { id: string; kind?: string; status?: string; created_at?: number };
type Response = { data?: { health?: Health; timeline?: Timeline[] }; health?: Health; timeline?: Timeline[] };

export function ServiceHealthPanel({ projectId, serviceId }: { projectId: string; serviceId: string }) {
  const [data, setData] = useState<Response | null>(null); const [loading, setLoading] = useState(false);
  const load = async () => { setLoading(true); try { setData(await api<Response>("GET", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/observability`)); } catch (error) { toast.error(error instanceof Error ? error.message : "Observability tidak tersedia"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [projectId, serviceId]);
  const value = unwrapData<Response>(data) || data; const health = value?.health; const status = health?.current?.status || "unknown";
  return <Card data-testid="service-health-panel"><CardHeader><CardTitle className="text-sm">Health & timeline</CardTitle></CardHeader><CardContent className="space-y-3 text-xs"><div className="flex items-center gap-2"><span>Status</span><Badge>{status}</Badge><span className="text-[var(--color-muted-foreground)]">{health?.current?.observed_at ? new Date(health.current.observed_at * 1000).toLocaleString("id-ID") : "Belum ada observasi"}</span></div><div><span className="text-[var(--color-muted-foreground)]">Endpoint</span><p className="break-all">{health?.endpoint ? JSON.stringify(health.endpoint) : "—"}</p></div>{(value?.timeline || []).length ? <div className="space-y-1">{value?.timeline?.map((item) => <div key={item.id} className="flex justify-between border-b border-[var(--color-border)] py-1"><span>{item.kind}</span><Badge>{item.status}</Badge></div>)}</div> : <p className="text-[var(--color-muted-foreground)]">Belum ada deployment timeline.</p>}<Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? "Memuat…" : "Refresh"}</Button></CardContent></Card>;
}
