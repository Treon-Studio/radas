import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, unwrapData } from "@/lib/api";

type Stage = { name: string; status?: string };
type Pipeline = { id: string; source_revision?: string | null; stages?: Stage[] };
type Run = { id: string; status: string; source_revision: string; target_environment: string; approved_by?: string | null };
type Response = { data?: { pipeline?: Pipeline | null; runs?: Run[] }; pipeline?: Pipeline | null; runs?: Run[] };

export function ServicePipelinePanel({ projectId, serviceId }: { projectId: string; serviceId: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => { setLoading(true); try { setData(await api<Response>("GET", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/pipeline`)); } catch (error) { toast.error(error instanceof Error ? error.message : "Pipeline tidak tersedia"); } finally { setLoading(false); } };
  const payload = unwrapData<Response>(data) || data;
  const pipeline = payload?.pipeline;
  const latest = payload?.runs?.[0];
  const run = async () => { try { await api("POST", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/pipeline/run`, { target_environment: "staging" }, { headers: { "Idempotency-Key": `pipeline-${serviceId}-staging` } }); toast.success("Pipeline masuk antrean"); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : "Pipeline gagal dijalankan"); } };
  return <Card data-testid="service-pipeline-panel"><CardHeader><CardTitle className="text-sm">Service pipeline</CardTitle></CardHeader><CardContent className="space-y-3 text-xs">{!pipeline ? <><p className="text-[var(--color-muted-foreground)]">Pipeline belum dikonfigurasi untuk service ini.</p><Button size="sm" onClick={() => void load()} disabled={loading}>Muat pipeline</Button></> : <><p>Source revision: <code>{pipeline.source_revision || "—"}</code></p><div className="flex flex-wrap gap-1">{(pipeline.stages || []).map((stage) => <Badge key={stage.name}>{stage.name}: {stage.status || "pending"}</Badge>)}</div>{latest && <p>Run {latest.id}: <strong>{latest.status}</strong> → {latest.target_environment}</p>}<Button size="sm" onClick={() => void run()}>Run pipeline</Button></>}</CardContent></Card>;
}
