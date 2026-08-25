import { useQuery } from "@tanstack/react-query";
import { RiLineChartLine as TrendingUp, RiStackLine as Layers, RiLightbulbLine as Lightbulb, RiPieChartLine as PieChart } from "@remixicon/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

type Forecast = { base: number; trend?: number; predicted: number[]; method: string };
type Breakdown = { breakdown: { key: string; total: number }[] };
type Rollup = { grand_total: number; projects: { project_id: string; total: number }[] };
type Rightsizing = { recommendations: { stack: string; idle_days: number; suggestion: string }[] };

function Mini({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="col-span-12 lg:col-span-6">
      <CardHeader className="py-2"><CardTitle className="text-sm flex items-center gap-2">{icon} {title}</CardTitle></CardHeader>
      <CardContent className="pt-0 text-sm space-y-1">{children}</CardContent>
    </Card>
  );
}

export function CostInsights() {
  const pid = window.localStorage.getItem("current_project_id") || "";
  const f = useQuery({ enabled: !!pid, queryKey: ["cost-forecast", pid], queryFn: () => api<Forecast>("GET", `/api/cost/forecast?project_id=${encodeURIComponent(pid)}`) });
  const b = useQuery({ enabled: !!pid, queryKey: ["cost-breakdown", pid], queryFn: () => api<Breakdown>("GET", `/api/cost/breakdown?project_id=${encodeURIComponent(pid)}&by=provider`) });
  const r = useQuery({ enabled: !!pid, queryKey: ["cost-rollup"], queryFn: () => api<Rollup>("GET", "/api/cost/rollup") });
  const rz = useQuery({ enabled: !!pid, queryKey: ["cost-rightsizing", pid], queryFn: () => api<Rightsizing>("GET", `/api/cost/rightsizing?project_id=${encodeURIComponent(pid)}`) });

  return (
    <div className="grid grid-cols-12 gap-4">
      <Mini icon={<TrendingUp className="h-4 w-4" />} title="Forecast">
        {f.data ? (
          <>
            <div>Current base: <b>${f.data.base}</b> {f.data.method === "linear" && <>· trend ${f.data.trend}/mo</>}</div>
            <div>Next: {f.data.predicted.map((p, i) => <span key={i} className="mr-2">M{i + 1}: ${p}</span>)}</div>
          </>
        ) : <div className="text-[var(--color-muted-foreground)]">No estimates yet.</div>}
      </Mini>

      <Mini icon={<PieChart className="h-4 w-4" />} title="By provider">
        {(b.data?.breakdown ?? []).map((x) => (
          <div key={x.key} className="flex justify-between"><span>{x.key}</span><b>${x.total}</b></div>
        ))}
        {b.data && b.data.breakdown.length === 0 && <div className="text-[var(--color-muted-foreground)]">No data.</div>}
      </Mini>

      <Mini icon={<Layers className="h-4 w-4" />} title="Rollup (all projects)">
        <div>Grand total: <b>${r.data?.grand_total ?? 0}</b></div>
        {(r.data?.projects ?? []).map((p) => (
          <div key={p.project_id} className="flex justify-between"><span className="font-mono text-xs">{p.project_id.slice(0, 8)}</span><b>${p.total}</b></div>
        ))}
      </Mini>

      <Mini icon={<Lightbulb className="h-4 w-4" />} title="Rightsizing">
        {(rz.data?.recommendations ?? []).map((x) => (
          <div key={x.stack} className="flex justify-between gap-2">
            <span className="font-mono text-xs">{x.stack} <span className="text-[var(--color-muted-foreground)]">({x.idle_days}d idle)</span></span>
            <span className="text-[var(--color-warning)] text-xs">{x.suggestion}</span>
          </div>
        ))}
        {rz.data && rz.data.recommendations.length === 0 && <div className="text-[var(--color-muted-foreground)]">No idle stacks.</div>}
      </Mini>
    </div>
  );
}
