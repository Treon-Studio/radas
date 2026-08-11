import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RiCheckLine as Check, RiCloseLine as X, RiTimeLine as Clock } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type Approval = { id: string; stack: string; action: string; status: string; requested_by?: string; note?: string };

export function ApprovalPanel({ stackId }: { stackId: string }) {
  const qc = useQueryClient();
  const pid = window.localStorage.getItem("current_project_id") || "";

  const q = useQuery({
    enabled: !!pid,
    queryKey: ["approvals", pid],
    queryFn: () => api<{ approvals: Approval[] }>("GET", `/api/approvals?project_id=${encodeURIComponent(pid)}`),
  });
  const mine = (q.data?.approvals ?? []).filter((a) => a.stack === stackId);
  const pending = mine.filter((a) => a.status === "pending");
  const decided = mine.filter((a) => a.status !== "pending");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["approvals", pid] });

  const request = async () => {
    await api("POST", "/api/approvals", { stack: stackId, action: "apply", project_id: pid });
    toast.success("Approval requested");
    invalidate();
  };
  const decide = async (id: string, status: "approved" | "rejected") => {
    await api("POST", `/api/approvals/${id}/${status}`, {});
    toast.success(status === "approved" ? "Approved" : "Rejected");
    invalidate();
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Approvals</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {pending.length === 0 && decided.length === 0 && (
          <div className="text-sm text-[var(--color-muted-foreground)]">No approvals for this stack.</div>
        )}
        {pending.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
            <div className="text-sm">
              <Badge variant="warning" className="text-[10px] mr-2">pending</Badge>
              <span className="font-mono">{a.action}</span>
              {a.note && <span className="text-xs text-[var(--color-muted-foreground)] ml-2">— {a.note}</span>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => decide(a.id, "approved")}><Check className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="outline" onClick={() => decide(a.id, "rejected")}><X className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
        {decided.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
            <Badge variant={a.status === "approved" ? "success" : "destructive"} className="text-[10px]">{a.status}</Badge>
            <span className="font-mono">{a.action}</span>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={request} disabled={!pid}>
          Request approval (apply)
        </Button>
      </CardContent>
    </Card>
  );
}
