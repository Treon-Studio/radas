import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RiRobotLine as Robot,
  RiAddLine as Plus,
  RiRefreshLine as Refresh,
  RiPlayLine as Play,
  RiDeleteBinLine as Trash,
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

export const Route = createFileRoute("/system/automation")({ component: AutomationPage });

type AutomationRule = {
  id: string;
  kind?: string;
  enabled?: boolean;
  stack?: string;
  action?: string;
  hour?: number;
  days?: number[] | string;
  start_hour?: number;
  end_hour?: number;
  created_at?: number;
};

const KINDS = ["maintenance", "auto_stop", "remediate", "auto_scale"] as const;

export function AutomationPage() {
  const qc = useQueryClient();
  const [newKind, setNewKind] = useState<string>("maintenance");
  const [newStack, setNewStack] = useState("");
  const [deleting, setDeleting] = useState<AutomationRule | null>(null);

  const rulesQ = useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => api<{ rules?: AutomationRule[] }>("GET", "/api/automation/rules"),
  });
  const maintenanceQ = useQuery({
    queryKey: ["automation-maintenance"],
    queryFn: () => api<{ active?: boolean }>("GET", "/api/automation/maintenance"),
  });

  const createMut = useMutation({
    mutationFn: (body: { kind: string; stack?: string; enabled: boolean }) =>
      api<{ success?: boolean; rule?: AutomationRule }>("POST", "/api/automation/rules", body, {
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
    onSuccess: () => {
      toast.success("Automation rule created");
      setNewStack("");
      void qc.invalidateQueries({ queryKey: ["automation-rules"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const toggleMut = useMutation({
    mutationFn: (rule: AutomationRule) =>
      api<{ success?: boolean; rule?: AutomationRule }>(
        "PATCH", `/api/automation/rules/${encodeURIComponent(rule.id)}`,
        { enabled: !rule.enabled },
        { headers: { "Idempotency-Key": newIdempotencyKey() } },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automation-rules"] }),
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api<{ success?: boolean }>("DELETE", `/api/automation/rules/${encodeURIComponent(id)}`, undefined, {
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
    onSuccess: () => {
      toast.success("Automation rule deleted");
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ["automation-rules"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const runNowMut = useMutation({
    mutationFn: () =>
      api<{ queued?: number }>("POST", "/api/automation/rules/run-now", undefined, {
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
    onSuccess: (data) => toast.success(`Rule run queued (${data?.queued ?? 0})`),
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const submitCreate = () => {
    createMut.mutate({ kind: newKind, stack: newStack.trim() || undefined, enabled: true });
  };

  const rules = rulesQ.data?.rules ?? [];

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Robot className="h-5 w-5 text-[var(--color-primary)]" /> Automation Rules
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Scheduled maintenance windows, auto-stop, remediation and auto-scale rules.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {maintenanceQ.data && (
            <Badge variant={maintenanceQ.data.active ? "warning" : "default"} className="text-[10px] uppercase">
              Maintenance {maintenanceQ.data.active ? "active" : "inactive"}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => runNowMut.mutate()} disabled={runNowMut.isPending}>
            <Play className="h-4 w-4" /> Run rules now
          </Button>
          <Button variant="outline" size="sm" onClick={() => void rulesQ.refetch()}>
            <Refresh className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <label className="block text-xs text-[var(--color-muted-foreground)]">
            Kind
            <select
              aria-label="Rule kind"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
              className="mt-1 h-10 border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-sm font-mono"
            >
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="block text-xs text-[var(--color-muted-foreground)]">
            Stack (optional)
            <Input
              aria-label="Stack"
              placeholder="stack name"
              value={newStack}
              onChange={(e) => setNewStack(e.target.value)}
              className="mt-1 max-w-[220px]"
            />
          </label>
          <Button size="sm" onClick={submitCreate} disabled={createMut.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add rule
          </Button>
        </CardContent>
      </Card>

      <QueryStateView
        loading={rulesQ.isPending}
        error={rulesQ.error}
        empty={!rulesQ.isPending && !rulesQ.error && rules.length === 0}
        onRetry={() => void rulesQ.refetch()}
        emptyTitle="No automation rules"
        emptyMessage="Create your first rule above — for example a nightly maintenance window."
      />

      {rules.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-muted)]/40 text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium">Kind</th>
                  <th className="text-left px-3 py-2.5 font-medium">Stack</th>
                  <th className="text-left px-3 py-2.5 font-medium">Status</th>
                  <th className="text-right px-3 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2.5">
                      <Badge variant="cyan" className="text-[10px] uppercase">{rule.kind || "—"}</Badge>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{rule.stack || "all"}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={rule.enabled ? "success" : "default"} className="text-[10px] uppercase">
                        {rule.enabled ? "enabled" : "disabled"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right space-x-2 whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleMut.mutate(rule)}
                        disabled={toggleMut.isPending}
                      >
                        {rule.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleting(rule)}
                        aria-label={`Delete rule ${rule.kind ?? rule.id}`}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete automation rule"
        description={`Delete the ${deleting?.kind ?? ""} rule${deleting?.stack ? ` for stack ${deleting.stack}` : ""}? This cannot be undone.`}
        confirmLabel="Delete rule"
        variant="destructive"
        busy={deleteMut.isPending}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
