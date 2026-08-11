import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RiSaveLine as Save } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type Quota = { max_stacks: number; max_vms: number; max_cost_monthly: number; usage?: { stacks: number } };

export function QuotaCard() {
  const qc = useQueryClient();
  const pid = window.localStorage.getItem("current_project_id") || "";
  const [stacks, setStacks] = useState("10");
  const [vms, setVms] = useState("20");
  const [cost, setCost] = useState("1000");

  const q = useQuery({
    enabled: !!pid,
    queryKey: ["quota", pid],
    queryFn: () => api<{ configured: boolean; quota?: Quota }>("GET", `/api/quota/${encodeURIComponent(pid)}`),
  });
  const quota = q.data?.quota;

  const save = async () => {
    if (!pid) return toast.error("Select a project first");
    await api("PUT", `/api/quota/${encodeURIComponent(pid)}`, {
      max_stacks: Number(stacks), max_vms: Number(vms), max_cost_monthly: Number(cost),
    });
    toast.success("Quota saved");
    qc.invalidateQueries({ queryKey: ["quota", pid] });
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Project Quota</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {quota ? (
          <div className="text-sm space-y-1">
            <div>Stacks: <b>{quota.usage?.stacks ?? 0}</b> / {quota.max_stacks || "∞"}</div>
            <div>Max VMs: <b>{quota.max_vms || "∞"}</b></div>
            <div>Max cost/mo: <b>${quota.max_cost_monthly || "∞"}</b></div>
          </div>
        ) : (
          <div className="text-sm text-[var(--color-muted-foreground)]">No quota configured (unlimited).</div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Input type="number" value={stacks} onChange={(e) => setStacks(e.target.value)} placeholder="Max stacks" title="Max stacks" />
          <Input type="number" value={vms} onChange={(e) => setVms(e.target.value)} placeholder="Max VMs" title="Max VMs" />
          <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Max $/mo" title="Max $/mo" />
        </div>
        <Button size="sm" variant="outline" onClick={save}><Save className="h-4 w-4" /> Save quota</Button>
      </CardContent>
    </Card>
  );
}
