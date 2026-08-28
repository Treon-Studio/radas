import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  RiTimerLine as Timer,
  RiRefreshLine as Refresh,
  RiPlayLine as Play,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { QueryStateView } from "@/components/system/QueryStateView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, apiErrorTitle, newIdempotencyKey } from "@/lib/api";
import { getCurrentProjectId } from "@/lib/project";

export const Route = createFileRoute("/system/retry-policy")({ component: RetryPolicyPage });

type RetryPolicy = {
  max_retries?: number;
  backoff_seconds?: number;
  stacks?: Record<string, RetryPolicy>;
};

export function RetryPolicyPage() {
  const qc = useQueryClient();
  const projectId = getCurrentProjectId();
  const [stackScope, setStackScope] = useState("");
  const [maxRetries, setMaxRetries] = useState("0");
  const [backoffSeconds, setBackoffSeconds] = useState("300");

  // Build paths from live localStorage so a tenant switch (X-Project-Id) is
  // honoured by the very next fetch, even before React re-renders.
  const path = () => {
    const base = `/api/retry-policy/${encodeURIComponent(getCurrentProjectId() ?? "")}`;
    const stack = stackScope.trim();
    return stack ? `${base}?stack=${encodeURIComponent(stack)}` : base;
  };

  const policyQ = useQuery({
    queryKey: ["retry-policy", projectId, stackScope.trim()],
    queryFn: () => api<{ retry_policy?: RetryPolicy }>("GET", path()),
    enabled: Boolean(projectId),
  });

  const policy = policyQ.data?.retry_policy;
  useEffect(() => {
    if (!policy) return;
    setMaxRetries(String(policy.max_retries ?? 0));
    setBackoffSeconds(String(policy.backoff_seconds ?? 300));
  }, [policy]);

  const saveMut = useMutation({
    mutationFn: (body: { max_retries: number; backoff_seconds: number; stack?: string }) =>
      api<{ success?: boolean; retry_policy?: RetryPolicy }>(
        "PUT",
        `/api/retry-policy/${encodeURIComponent(getCurrentProjectId() ?? "")}`,
        body,
        { headers: { "Idempotency-Key": newIdempotencyKey() } },
      ),
    onSuccess: () => {
      toast.success("Retry policy saved");
      void qc.invalidateQueries({ queryKey: ["retry-policy"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const sweepMut = useMutation({
    mutationFn: () =>
      api<{ retried?: number; skipped_backoff?: number }>("POST", "/api/retry-policy/sweep", undefined, {
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
    onSuccess: (data) => {
      toast.success(`Sweep finished: ${data?.retried ?? 0} retried, ${data?.skipped_backoff ?? 0} in backoff`);
      void qc.invalidateQueries({ queryKey: ["retry-policy"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const submitSave = () => {
    const retries = Number(maxRetries);
    const backoff = Number(backoffSeconds);
    if (!Number.isInteger(retries) || retries < 0 || retries > 10) {
      toast.error("Validation failed: max retries must be an integer between 0 and 10");
      return;
    }
    if (!Number.isInteger(backoff) || backoff < 0) {
      toast.error("Validation failed: backoff seconds must be a non-negative integer");
      return;
    }
    saveMut.mutate({
      max_retries: retries,
      backoff_seconds: backoff,
      stack: stackScope.trim() || undefined,
    });
  };

  const scopedPolicies = Object.entries(policy?.stacks ?? {});

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Timer className="h-5 w-5 text-[var(--color-primary)]" /> Retry Policy
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Failed-execution retry count and backoff for the active project.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => sweepMut.mutate()} disabled={sweepMut.isPending}>
            <Play className="h-4 w-4" /> Run sweep
          </Button>
          <Button variant="outline" size="sm" onClick={() => void policyQ.refetch()}>
            <Refresh className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {!projectId ? (
        <QueryStateView
          empty
          emptyTitle="No project selected"
          emptyMessage="Pick a project in the header to manage its retry policy."
        />
      ) : (
        <>
          <Card>
            <CardHeader className="p-4 pb-2 border-b border-[var(--color-border)]">
              <CardTitle className="text-sm font-semibold">Policy scope</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                Stack (optional — leave empty for project default)
                <Input
                  aria-label="Stack scope"
                  placeholder="stack name"
                  value={stackScope}
                  onChange={(e) => setStackScope(e.target.value)}
                  className="mt-1 max-w-[240px]"
                />
              </label>
              {policy && (
                <Badge variant="default" className="text-[10px] uppercase">
                  current: {policy.max_retries ?? 0} retries / {policy.backoff_seconds ?? 300}s backoff
                </Badge>
              )}
            </CardContent>
          </Card>

          <QueryStateView
            loading={policyQ.isPending}
            error={policyQ.error}
            onRetry={() => void policyQ.refetch()}
            forbiddenMessage="Managing the retry policy requires access to the selected project."
          />

          {policy && (
            <Card>
              <CardHeader className="p-4 pb-2 border-b border-[var(--color-border)]">
                <CardTitle className="text-sm font-semibold">
                  {stackScope.trim() ? `Stack policy: ${stackScope.trim()}` : "Project default policy"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex flex-wrap items-end gap-3">
                <label className="block text-xs text-[var(--color-muted-foreground)]">
                  Max retries (0–10)
                  <Input
                    aria-label="Max retries"
                    type="number"
                    min={0}
                    max={10}
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(e.target.value)}
                    className="mt-1 max-w-[140px]"
                  />
                </label>
                <label className="block text-xs text-[var(--color-muted-foreground)]">
                  Backoff (seconds)
                  <Input
                    aria-label="Backoff seconds"
                    type="number"
                    min={0}
                    value={backoffSeconds}
                    onChange={(e) => setBackoffSeconds(e.target.value)}
                    className="mt-1 max-w-[140px]"
                  />
                </label>
                <Button size="sm" onClick={submitSave} disabled={saveMut.isPending}>
                  Save policy
                </Button>
              </CardContent>
            </Card>
          )}

          {scopedPolicies.length > 0 && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
              <div className="px-3 py-2 text-xs uppercase tracking-wide text-[var(--color-muted-foreground)] bg-[var(--color-muted)]/40">
                Per-stack overrides
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {scopedPolicies.map(([stack, stackPolicy]) => (
                    <tr key={stack} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2.5 font-mono text-xs">{stack}</td>
                      <td className="px-3 py-2.5 text-xs text-[var(--color-muted-foreground)]">
                        {stackPolicy.max_retries ?? 0} retries / {stackPolicy.backoff_seconds ?? 300}s backoff
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
