import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  RiBox3Line as Box,
  RiRefreshLine as Refresh,
  RiSaveLine as Save,
  RiFileCopyLine as Copy,
  RiDeleteBinLine as Trash,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { QueryStateView } from "@/components/system/QueryStateView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api, apiErrorTitle, newIdempotencyKey } from "@/lib/api";

export const Route = createFileRoute("/system/provider-mirror")({ component: ProviderMirrorPage });

type MirrorConfig = { enabled?: boolean; dir?: string; updated_at?: number };
type MirrorResponse = { mirror?: MirrorConfig; registry_tfrc?: string };

function copyValue(value: string) {
  const clipboard = (navigator as { clipboard?: { writeText?: (text: string) => Promise<void> } }).clipboard;
  if (!clipboard?.writeText) {
    toast.error("Snippet could not be copied");
    return;
  }
  void clipboard.writeText(value).then(
    () => toast.success("Snippet copied to clipboard"),
    () => toast.error("Snippet could not be copied"),
  );
}

/** OpenTofu provider filesystem-mirror configuration (registry.tfrc.json). */
export function ProviderMirrorPage() {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [dir, setDir] = useState("");
  const [resetOpen, setResetOpen] = useState(false);

  const mirrorQ = useQuery({
    queryKey: ["provider-mirror"],
    queryFn: () => api<MirrorResponse>("GET", "/api/settings/provider-mirror"),
  });

  useEffect(() => {
    if (!mirrorQ.isSuccess) return;
    const cfg = mirrorQ.data?.mirror ?? {};
    setEnabled(cfg.enabled === true);
    setDir(typeof cfg.dir === "string" ? cfg.dir : "");
  }, [mirrorQ.data, mirrorQ.isSuccess]);

  const saveMut = useMutation({
    mutationFn: (payload: { dir: string; enabled: boolean }) =>
      api<MirrorResponse>("PUT", "/api/settings/provider-mirror", payload, {
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
    onSuccess: () => {
      toast.success("Provider mirror saved");
      void qc.invalidateQueries({ queryKey: ["provider-mirror"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const resetMut = useMutation({
    mutationFn: () =>
      api<{ success?: boolean }>("DELETE", "/api/settings/provider-mirror", undefined, {
        headers: { "Idempotency-Key": newIdempotencyKey() },
      }),
    onSuccess: () => {
      toast.success("Provider mirror reset");
      setResetOpen(false);
      void qc.invalidateQueries({ queryKey: ["provider-mirror"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const submitSave = () => {
    if (enabled && !dir.trim()) {
      toast.error("Validation failed: mirror directory is required when the mirror is enabled");
      return;
    }
    saveMut.mutate({ dir: dir.trim(), enabled });
  };

  const tfrc = mirrorQ.data?.registry_tfrc ?? "";
  const unconfigured = mirrorQ.isSuccess && !mirrorQ.data?.mirror?.enabled && !mirrorQ.data?.mirror?.dir;

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Box className="h-5 w-5 text-[var(--color-primary)]" /> Provider Mirror
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Filesystem mirror for OpenTofu provider downloads (offline / air-gapped installs).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void mirrorQ.refetch()} disabled={mirrorQ.isPending}>
          <Refresh className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <QueryStateView
        loading={mirrorQ.isPending}
        error={mirrorQ.error}
        onRetry={() => void mirrorQ.refetch()}
        empty={unconfigured}
        emptyTitle="Provider mirror not configured"
        emptyMessage="Enable the mirror below and point it at a local provider directory."
        forbiddenMessage="Sign in to manage provider mirror settings."
      />

      {mirrorQ.isSuccess && (
        <Card>
          <CardHeader className="p-4 pb-2 border-b border-[var(--color-border)] flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Mirror configuration</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={enabled ? "success" : "default"} className="text-[10px] uppercase">
                {enabled ? "Enabled" : "Disabled"}
              </Badge>
              <Button variant="destructive" size="sm" onClick={() => setResetOpen(true)}>
                <Trash className="h-4 w-4 mr-1" /> Reset…
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                <Switch
                  aria-label="Mirror enabled"
                  checked={enabled}
                  onChange={setEnabled}
                />
                Mirror enabled
              </label>
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                Mirror directory
                <Input
                  aria-label="Mirror directory"
                  placeholder="/srv/tofu-providers"
                  value={dir}
                  onChange={(e) => setDir(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitSave(); }}
                  className="mt-1 max-w-[320px] font-mono"
                />
              </label>
              <Button size="sm" onClick={submitSave} disabled={saveMut.isPending}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
            {tfrc && (
              <div>
                <div className="flex items-center justify-between max-w-[560px]">
                  <span className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    registry.tfrc.json snippet
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    aria-label="Copy registry.tfrc.json snippet"
                    onClick={() => copyValue(tfrc)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <pre
                  data-testid="registry-tfrc"
                  className="mt-1 max-w-[560px] overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3 text-xs font-mono whitespace-pre"
                >
                  {tfrc}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={resetOpen}
        title="Reset provider mirror"
        description="Disables the mirror and clears the configured directory. OpenTofu will download providers directly again."
        confirmLabel="Reset mirror"
        variant="destructive"
        busy={resetMut.isPending}
        onConfirm={() => resetMut.mutate()}
        onCancel={() => setResetOpen(false)}
      />
    </div>
  );
}
