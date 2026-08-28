import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RiWebhookLine as Webhook,
  RiAddLine as Plus,
  RiRefreshLine as Refresh,
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
import { getCurrentProjectId } from "@/lib/project";

export const Route = createFileRoute("/system/inbound-webhooks")({ component: InboundWebhooksPage });

type InboundWebhook = {
  id: string;
  name: string;
  stack: string;
  action: string;
  project_id?: string;
  created_at?: number;
};

const ACTIONS = ["plan", "apply", "destroy", "refresh", "validate", "fmt"] as const;

/** Allowlist mapping — a `secret` returned by any server version is dropped here. */
function toWebhook(raw: Record<string, unknown>): InboundWebhook | null {
  if (typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  return {
    id: raw.id,
    name: raw.name,
    stack: typeof raw.stack === "string" ? raw.stack : "",
    action: typeof raw.action === "string" ? raw.action : "plan",
    project_id: typeof raw.project_id === "string" ? raw.project_id : undefined,
    created_at: typeof raw.created_at === "number" ? raw.created_at : undefined,
  };
}

export function InboundWebhooksPage() {
  const qc = useQueryClient();
  const projectId = getCurrentProjectId();
  const [name, setName] = useState("");
  const [stack, setStack] = useState("");
  const [action, setAction] = useState<string>("plan");
  const [secret, setSecret] = useState("");
  const [deleting, setDeleting] = useState<InboundWebhook | null>(null);

  const hooksQ = useQuery({
    queryKey: ["inbound-webhooks", projectId],
    queryFn: () => api<{ inbound_webhooks?: Record<string, unknown>[] }>("GET", "/api/inbound-webhooks"),
    enabled: Boolean(projectId),
    select: (data) => (data.inbound_webhooks ?? [])
      .map(toWebhook)
      .filter((w): w is InboundWebhook => w !== null),
  });

  const createMut = useMutation({
    mutationFn: (body: { name: string; stack: string; action: string; secret?: string }) =>
      api<{ success?: boolean; inbound_webhook?: Record<string, unknown> }>(
        "POST", "/api/inbound-webhooks",
        { ...body, project_id: getCurrentProjectId() ?? "" },
        { headers: { "Idempotency-Key": newIdempotencyKey() } },
      ),
    onSuccess: () => {
      // The server redacts the secret; clear the input so it never lingers.
      setSecret("");
      setName("");
      setStack("");
      toast.success("Webhook created — the secret is write-only and never shown again");
      void qc.invalidateQueries({ queryKey: ["inbound-webhooks"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api<{ success?: boolean }>(
        "DELETE", `/api/inbound-webhooks/${encodeURIComponent(id)}`, undefined,
        { headers: { "Idempotency-Key": newIdempotencyKey() } },
      ),
    onSuccess: () => {
      toast.success("Webhook deleted");
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ["inbound-webhooks"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const submitCreate = () => {
    if (!projectId) {
      toast.error("Select a project first");
      return;
    }
    if (!name.trim() || !stack.trim()) {
      toast.error("Validation failed: name and stack are required");
      return;
    }
    createMut.mutate({
      name: name.trim(),
      stack: stack.trim(),
      action,
      secret: secret.trim() || undefined,
    });
  };

  const hooks = hooksQ.data ?? [];
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Webhook className="h-5 w-5 text-[var(--color-primary)]" /> Inbound Webhooks
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            External systems (GitHub/GitLab) POST to these URLs to trigger stack actions.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void hooksQ.refetch()}>
          <Refresh className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {!projectId ? (
        <QueryStateView
          empty
          emptyTitle="No project selected"
          emptyMessage="Pick a project in the header to manage its inbound webhooks."
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                Name
                <Input
                  aria-label="Webhook name"
                  placeholder="deploy-main"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 max-w-[200px]"
                />
              </label>
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                Stack
                <Input
                  aria-label="Webhook stack"
                  placeholder="stack name"
                  value={stack}
                  onChange={(e) => setStack(e.target.value)}
                  className="mt-1 max-w-[200px]"
                />
              </label>
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                Action
                <select
                  aria-label="Webhook action"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="mt-1 h-10 border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-sm font-mono"
                >
                  {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                HMAC secret (optional, write-only)
                <Input
                  aria-label="Webhook secret"
                  type="password"
                  placeholder="never displayed again"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="mt-1 max-w-[240px]"
                  autoComplete="new-password"
                />
              </label>
              <Button size="sm" onClick={submitCreate} disabled={createMut.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Create webhook
              </Button>
            </CardContent>
          </Card>

          <QueryStateView
            loading={hooksQ.isPending}
            error={hooksQ.error}
            empty={!hooksQ.isPending && !hooksQ.error && hooks.length === 0}
            onRetry={() => void hooksQ.refetch()}
            emptyTitle="No inbound webhooks"
            emptyMessage="Create a webhook above to let external systems trigger stack actions."
          />

          {hooks.length > 0 && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-muted)]/40 text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-medium">Name</th>
                      <th className="text-left px-3 py-2.5 font-medium">Stack</th>
                      <th className="text-left px-3 py-2.5 font-medium">Action</th>
                      <th className="text-left px-3 py-2.5 font-medium">Trigger URL</th>
                      <th className="text-right px-3 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hooks.map((hook) => (
                      <tr key={hook.id} className="border-t border-[var(--color-border)]">
                        <td className="px-3 py-2.5 font-medium">{hook.name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{hook.stack}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="cyan" className="text-[10px] uppercase">{hook.action}</Badge>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs truncate max-w-[320px]" title={`POST ${origin}/api/webhooks/inbound/${hook.name}`}>
                          POST /api/webhooks/inbound/{hook.name}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleting(hook)}
                            aria-label={`Delete webhook ${hook.name}`}
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
            title="Delete inbound webhook"
            description={`External calls to /api/webhooks/inbound/${deleting?.name ?? ""} will stop being accepted. This cannot be undone.`}
            confirmLabel="Delete webhook"
            variant="destructive"
            busy={deleteMut.isPending}
            onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
            onCancel={() => setDeleting(null)}
          />
        </>
      )}
    </div>
  );
}
