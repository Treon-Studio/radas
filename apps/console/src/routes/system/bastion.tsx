import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  RiServerLine as Server,
  RiRefreshLine as Refresh,
  RiSaveLine as Save,
  RiDeleteBinLine as Trash,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { QueryStateView } from "@/components/system/QueryStateView";
import { SecretInput } from "@/components/system/SecretInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { api, apiErrorTitle, newIdempotencyKey } from "@/lib/api";
import { getCurrentProjectId } from "@/lib/project";

export const Route = createFileRoute("/system/bastion")({ component: BastionPage });

type BastionConfig = {
  host?: string;
  user?: string;
  port?: number;
  ssh_key?: string;
  updated_at?: number;
};

type BastionResponse = { configured?: boolean; bastion?: BastionConfig };

/**
 * Bastion / jump-host proxy for Ansible runs. The SSH private-key path is a
 * credential: it is only ever sent in the PUT request body — never in a URL,
 * query string, or query key.
 */
export function BastionPage() {
  const qc = useQueryClient();
  const projectId = getCurrentProjectId();

  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [port, setPort] = useState("22");
  const [sshKey, setSshKey] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const bastionQ = useQuery({
    queryKey: ["bastion", projectId],
    queryFn: () =>
      api<BastionResponse>(
        "GET",
        // Read the tenant from live localStorage so a project switch is
        // honoured by the very next fetch, even before React re-renders.
        // A literal "_current" placeholder would 403 — api() only rewrites
        // "/_current/" segments, so resolve the id here.
        `/api/bastion/${encodeURIComponent(getCurrentProjectId() ?? "")}`,
      ),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    if (!bastionQ.isSuccess) return;
    const cfg = bastionQ.data?.bastion ?? {};
    setHost(typeof cfg.host === "string" ? cfg.host : "");
    setUser(typeof cfg.user === "string" ? cfg.user : "");
    setPort(String(cfg.port ?? 22));
    setSshKey(typeof cfg.ssh_key === "string" ? cfg.ssh_key : "");
  }, [bastionQ.data, bastionQ.isSuccess]);

  const saveMut = useMutation({
    mutationFn: (payload: { host: string; user: string; port: number; ssh_key: string }) =>
      api<{ success?: boolean; bastion?: BastionConfig }>(
        "PUT",
        `/api/bastion/${encodeURIComponent(getCurrentProjectId() ?? "")}`,
        payload,
        { headers: { "Idempotency-Key": newIdempotencyKey() } },
      ),
    onSuccess: () => {
      toast.success("Bastion configuration saved");
      void qc.invalidateQueries({ queryKey: ["bastion"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const deleteMut = useMutation({
    mutationFn: () =>
      api<{ success?: boolean }>(
        "DELETE",
        `/api/bastion/${encodeURIComponent(getCurrentProjectId() ?? "")}`,
        undefined,
        { headers: { "Idempotency-Key": newIdempotencyKey() } },
      ),
    onSuccess: () => {
      toast.success("Bastion configuration removed");
      setDeleteOpen(false);
      void qc.invalidateQueries({ queryKey: ["bastion"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const submitSave = () => {
    if (!host.trim() || !user.trim()) {
      toast.error("Validation failed: host and user are required");
      return;
    }
    const portNumber = Number(port);
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      toast.error("Validation failed: port must be an integer between 1 and 65535");
      return;
    }
    saveMut.mutate({ host: host.trim(), user: user.trim(), port: portNumber, ssh_key: sshKey });
  };

  if (!projectId) {
    return (
      <div className="space-y-6">
        <Breadcrumbs />
        <QueryStateView
          empty
          emptyTitle="No project selected"
          emptyMessage="Pick a project in the header to configure its bastion host."
        />
      </div>
    );
  }

  const configured = bastionQ.isSuccess && Boolean(bastionQ.data?.configured);

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Server className="h-5 w-5 text-[var(--color-primary)]" /> Bastion Host
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Jump-host proxy (ProxyJump) applied to Ansible runs for this project.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void bastionQ.refetch()} disabled={bastionQ.isPending}>
          <Refresh className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <QueryStateView
        loading={bastionQ.isPending}
        error={bastionQ.error}
        onRetry={() => void bastionQ.refetch()}
        empty={bastionQ.isSuccess && !configured}
        emptyTitle="Bastion not configured"
        emptyMessage="Configure a bastion below to route Ansible SSH traffic through a jump host."
        forbiddenMessage="Bastion configuration requires access to the selected project."
      />

      {bastionQ.isSuccess && (
        <Card>
          <CardHeader className="p-4 pb-2 border-b border-[var(--color-border)] flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">SSH jump host</CardTitle>
            {configured && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash className="h-4 w-4 mr-1" /> Remove…
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                Host
                <Input
                  aria-label="Bastion host"
                  placeholder="bastion.example.com"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitSave(); }}
                  className="mt-1 max-w-[240px] font-mono"
                />
              </label>
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                User
                <Input
                  aria-label="Bastion user"
                  placeholder="ops"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitSave(); }}
                  className="mt-1 max-w-[160px] font-mono"
                />
              </label>
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                Port
                <Input
                  aria-label="Bastion port"
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitSave(); }}
                  className="mt-1 max-w-[110px] font-mono"
                />
              </label>
            </div>
            <label className="block text-xs text-[var(--color-muted-foreground)]">
              SSH private key path (optional, sent only in the request body)
              <SecretInput
                aria-label="SSH private key path"
                placeholder="~/.ssh/bastion_ed25519"
                value={sshKey}
                onChange={(e) => setSshKey(e.target.value)}
                className="mt-1 max-w-[420px]"
              />
            </label>
            <div>
              <Button size="sm" onClick={submitSave} disabled={saveMut.isPending}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Remove bastion configuration"
        description="Ansible runs will connect directly to targets without a jump host. This cannot be undone."
        confirmLabel="Remove bastion"
        variant="destructive"
        busy={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
