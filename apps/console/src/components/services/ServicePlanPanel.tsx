import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, unwrapData } from "@/lib/api";
export function ServicePlanPanel({ projectId, serviceId }: { projectId: string; serviceId: string }) {
  const [plan, setPlan] = useState<{ fingerprint?: string; changes?: unknown[] } | null>(null); const [loading, setLoading] = useState(false);
  const createPlan = async () => { setLoading(true); try { const result = await api<{ data?: { plan?: { data?: { fingerprint?: string; changes?: unknown[] } } } }>("POST", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/plan`); setPlan(unwrapData(result)?.plan?.data || null); toast.success("Plan berhasil dibuat"); } catch (error) { toast.error(error instanceof Error ? error.message : "Plan gagal dibuat"); } finally { setLoading(false); } };
  const apply = async () => { if (!plan?.fingerprint) return; try { await api("POST", `/api/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(serviceId)}/apply-plan`, { plan_fingerprint: plan.fingerprint }, { headers: { "Idempotency-Key": `plan-${serviceId}-${plan.fingerprint}` } }); toast.success("Plan masuk antrean apply"); } catch (error) { toast.error(error instanceof Error ? error.message : "Apply gagal"); } };
  return <Card data-testid="service-plan-panel"><CardHeader><CardTitle className="text-sm">Plan & apply</CardTitle></CardHeader><CardContent className="space-y-3 text-xs">{plan ? <><p>Fingerprint: <code>{plan.fingerprint}</code></p><p>{plan.changes?.length || 0} planned change(s)</p><Button size="sm" onClick={() => void apply()}>Apply plan</Button></> : <p className="text-[var(--color-muted-foreground)]">Buat plan sebelum apply provider runtime.</p>}<Button size="sm" variant="outline" onClick={() => void createPlan()} disabled={loading}>{loading ? "Membuat…" : "Buat plan"}</Button></CardContent></Card>;
}
