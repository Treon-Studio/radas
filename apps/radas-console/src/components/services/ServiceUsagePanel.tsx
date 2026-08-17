import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, unwrapData } from "@/lib/api";

type Usage = { totals?: { cpu_millicores?: number; memory_mb?: number; storage_gb?: number; running_seconds?: number }; count?: number };
export function ServiceUsagePanel({ projectId, serviceId }: { projectId: string; serviceId: string }) {
  const [usage, setUsage] = useState<Usage | null>(null); const [loading, setLoading] = useState(false);
  const load = async () => { setLoading(true); try { const result = await api<{ data?: Usage }>("GET", `/api/projects/${encodeURIComponent(projectId)}/usage`); setUsage(unwrapData<Usage>(result) || null); } catch (error) { toast.error(error instanceof Error ? error.message : "Usage tidak tersedia"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [projectId, serviceId]);
  const totals = usage?.totals;
  return <Card data-testid="service-usage-panel"><CardHeader><CardTitle className="text-sm">Resource usage</CardTitle></CardHeader><CardContent className="space-y-3 text-xs">{!usage ? <p className="text-[var(--color-muted-foreground)]">Belum ada usage snapshot.</p> : <><div className="grid grid-cols-2 gap-2"><Badge>CPU {totals?.cpu_millicores || 0}m</Badge><Badge>Memory {totals?.memory_mb || 0} MB</Badge><Badge>Storage {totals?.storage_gb || 0} GB</Badge><Badge>Running {Math.round(totals?.running_seconds || 0)}s</Badge></div><p className="text-[var(--color-muted-foreground)]">{usage.count || 0} snapshot billing-ready</p></>}<Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>{loading ? "Memuat…" : "Refresh usage"}</Button></CardContent></Card>;
}
