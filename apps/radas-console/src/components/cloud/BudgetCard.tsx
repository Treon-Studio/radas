import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RiMoneyDollarCircleLine as DollarSign, RiRefreshLine as RefreshCw } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type Budget = { amount: number; currency: string; alert_at_pct: number };

export function BudgetCard() {
  const qc = useQueryClient();
  const pid = window.localStorage.getItem("current_project_id") || "";
  const [amount, setAmount] = useState("100");
  const [pct, setPct] = useState("80");

  const q = useQuery({
    enabled: !!pid,
    queryKey: ["budget", pid],
    queryFn: () => api<{ configured: boolean; budget?: Budget }>("GET", `/api/budget/${encodeURIComponent(pid)}`),
  });
  const budget = q.data?.budget;

  const save = async () => {
    if (!pid) return toast.error("Select a project first");
    await api("PUT", `/api/budget/${encodeURIComponent(pid)}`, {
      amount: Number(amount), alert_at_pct: Number(pct), currency: "USD",
    });
    toast.success("Budget saved");
    qc.invalidateQueries({ queryKey: ["budget", pid] });
  };

  const check = async () => {
    if (!pid) return;
    const res = await api<{ spend: number; usage_pct: number; alerted: boolean }>(
      "POST", `/api/budget/${encodeURIComponent(pid)}/check`, {});
    toast.info(`Usage ${res.usage_pct}% · spend $${res.spend}${res.alerted ? " · ALERT" : ""}`);
    qc.invalidateQueries({ queryKey: ["budget", pid] });
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Budget</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {budget ? (
          <div className="text-sm space-y-1">
            <div>Limit: <b>{budget.amount} {budget.currency}</b></div>
            <div>Alert at: <b>{budget.alert_at_pct}%</b></div>
          </div>
        ) : (
          <div className="text-sm text-[var(--color-muted-foreground)]">No budget configured.</div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (USD)" />
          <Input type="number" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Alert at %" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={save} className="flex-1">Save</Button>
          <Button size="sm" variant="outline" onClick={check}><RefreshCw className="h-4 w-4" /> Check</Button>
        </div>
      </CardContent>
    </Card>
  );
}
