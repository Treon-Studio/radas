import { useQuery } from "@tanstack/react-query";
import { RiShieldCheckLine as ShieldCheck, RiCheckLine as Check, RiCloseLine as X } from "@remixicon/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type Check = { id: string; label: string; ok: boolean; detail?: string };
type Score = { score: number; max: number; checks: Check[] };

export function ComplianceCard() {
  const pid = window.localStorage.getItem("current_project_id") || "";
  const q = useQuery({
    enabled: !!pid,
    queryKey: ["compliance", pid],
    queryFn: () => api<Score>("GET", `/api/compliance/scorecard?project_id=${encodeURIComponent(pid)}`),
  });

  const score = q.data?.score ?? 0;
  const checks = q.data?.checks ?? [];

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Compliance
          {q.data && (
            <Badge variant={score >= 80 ? "success" : score >= 50 ? "warning" : "destructive"} className="text-[10px]">
              {score}/{q.data.max}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1.5">
        {checks.map((c) => (
          <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              {c.ok ? <Check className="h-4 w-4 text-[var(--color-success)]" /> : <X className="h-4 w-4 text-[var(--color-destructive)]" />}
              {c.label}
            </span>
            {c.detail && <span className="text-xs text-[var(--color-muted-foreground)]">{c.detail}</span>}
          </div>
        ))}
        {!q.data && <div className="text-sm text-[var(--color-muted-foreground)]">Loading…</div>}
      </CardContent>
    </Card>
  );
}
