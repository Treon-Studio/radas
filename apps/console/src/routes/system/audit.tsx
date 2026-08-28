import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RiFileListLine as AuditIcon,
  RiRefreshLine as Refresh,
  RiDownload2Line as Download,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { QueryStateView } from "@/components/system/QueryStateView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { api, apiErrorTitle, newIdempotencyKey } from "@/lib/api";

export const Route = createFileRoute("/system/audit")({ component: AuditPage });

type AuditEntry = {
  id?: string;
  actor_user_id?: string;
  action?: string;
  target_type?: string;
  target_id?: string;
  created_at?: string | number;
  meta?: unknown;
};

type AuditResponse = { success?: boolean; entries?: AuditEntry[]; count?: number };

const LIMITS = [50, 100, 250];

function toMillis(ts?: string | number): number | undefined {
  if (ts === undefined || ts === null || ts === "") return undefined;
  if (typeof ts === "number") return ts < 1e12 ? ts * 1000 : ts;
  const parsed = new Date(ts).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

function fmtDateTime(ts?: string | number): string {
  const ms = toMillis(ts);
  if (ms === undefined) return "—";
  try { return new Date(ms).toLocaleString(); } catch { return "—"; }
}

export function AuditPage() {
  const qc = useQueryClient();
  const [actor, setActor] = useState("");
  const [targetId, setTargetId] = useState("");
  const [limit, setLimit] = useState(100);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [retentionDays, setRetentionDays] = useState("90");

  const path = () => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (actor.trim()) params.set("actor_user_id", actor.trim());
    if (targetId.trim()) params.set("target_id", targetId.trim());
    return `/api/audit-log?${params.toString()}`;
  };

  const auditQ = useQuery({
    queryKey: ["audit-log", { actor: actor.trim(), target: targetId.trim(), limit }],
    queryFn: () => api<AuditResponse>("GET", path()),
  });

  const pruneMut = useMutation({
    mutationFn: (days: number) =>
      api<{ success?: boolean; deleted_count?: number }>("POST", "/api/audit-log/prune",
        { retention_days: days }, { headers: { "Idempotency-Key": newIdempotencyKey() } }),
    onSuccess: (data) => {
      toast.success(`Pruned ${data?.deleted_count ?? 0} audit entries`);
      setPruneOpen(false);
      void qc.invalidateQueries({ queryKey: ["audit-log"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const exportCsv = async () => {
    try {
      const csv = await api<string>("GET", "/api/audit-log/export?format=csv&limit=1000");
      const blob = new Blob([typeof csv === "string" ? csv : JSON.stringify(csv)], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "audit-export.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(apiErrorTitle(error));
    }
  };

  const submitPrune = () => {
    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days < 1) {
      toast.error("Validation failed: retention days must be a positive integer");
      return;
    }
    pruneMut.mutate(days);
  };

  const entries = auditQ.data?.entries ?? [];

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <AuditIcon className="h-5 w-5 text-[var(--color-primary)]" /> Audit Log
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Tenant-scoped record of privileged actions (owner/admin only).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void auditQ.refetch()}>
            <Refresh className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setPruneOpen(true)}>
            Prune…
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Input
            aria-label="Actor filter"
            placeholder="actor_user_id"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className="max-w-xs"
          />
          <Input
            aria-label="Target filter"
            placeholder="target_id"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            Limit
            <select
              aria-label="Limit"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="h-8 border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-xs font-mono"
            >
              {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </CardContent>
      </Card>

      <QueryStateView
        loading={auditQ.isPending}
        error={auditQ.error}
        empty={!auditQ.isPending && !auditQ.error && entries.length === 0}
        onRetry={() => void auditQ.refetch()}
        emptyTitle="No audit entries"
        emptyMessage="Privileged actions will appear here once recorded."
        forbiddenMessage="Audit log access requires the owner or admin role in this organization."
      />

      {entries.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)]/40 text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium">Time</th>
                  <th className="text-left px-3 py-2.5 font-medium">Actor</th>
                  <th className="text-left px-3 py-2.5 font-medium">Action</th>
                  <th className="text-left px-3 py-2.5 font-medium">Target</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={entry.id ?? index} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--color-muted-foreground)]">
                      {fmtDateTime(entry.created_at)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs truncate max-w-[200px]">
                      {entry.actor_user_id || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="default" className="text-[10px] uppercase">{entry.action || "—"}</Badge>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs truncate max-w-[280px]">
                      {[entry.target_type, entry.target_id].filter(Boolean).join(":") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-xs text-[var(--color-muted-foreground)] border-t border-[var(--color-border)]">
            {entries.length} of {auditQ.data?.count ?? entries.length} entries
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pruneOpen}
        title="Prune audit log"
        description={`Permanently delete audit entries older than ${retentionDays} days. This cannot be undone.`}
        confirmLabel="Prune entries"
        variant="destructive"
        busy={pruneMut.isPending}
        onConfirm={submitPrune}
        onCancel={() => setPruneOpen(false)}
      >
        <label className="block text-xs text-[var(--color-muted-foreground)]">
          Retention (days)
          <Input
            aria-label="Retention days"
            type="number"
            min={1}
            value={retentionDays}
            onChange={(e) => setRetentionDays(e.target.value)}
            className="mt-1"
          />
        </label>
      </ConfirmDialog>
    </div>
  );
}
