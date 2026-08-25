import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, unwrapData } from "@/lib/api";

type Connection = { id: string; name: string; runtime_id: string; configured?: boolean; healthy?: boolean; capabilities?: Record<string, boolean> };
export function RuntimeConnectionsCard({ orgId }: { orgId: string }) {
  const [connections, setConnections] = useState<Connection[]>([]); const [loading, setLoading] = useState(false);
  const load = async () => { setLoading(true); try { const result = await api<{ data?: { connections?: Connection[] } }>("GET", `/api/orgs/${encodeURIComponent(orgId)}/runtime-connections`); setConnections(unwrapData<{ connections?: Connection[] }>(result)?.connections || []); } catch (error) { toast.error(error instanceof Error ? error.message : "Runtime connections tidak tersedia"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [orgId]);
  return <Card data-testid="runtime-connections-card"><CardHeader><CardTitle className="text-sm">Runtime connections</CardTitle></CardHeader><CardContent className="space-y-3 text-xs">{connections.length === 0 ? <p className="text-[var(--color-muted-foreground)]">Belum ada runtime connection.</p> : connections.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-[var(--color-border)] py-2"><div><strong>{item.name}</strong><p>{item.runtime_id} · {Object.keys(item.capabilities || {}).length} capabilities</p></div><Badge>{item.healthy ? "healthy" : item.configured ? "configured" : "unconfigured"}</Badge></div>)}<Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? "Memuat…" : "Refresh"}</Button></CardContent></Card>;
}
