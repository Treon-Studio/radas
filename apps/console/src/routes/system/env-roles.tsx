import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  RiUserStarLine as UserStar,
  RiRefreshLine as Refresh,
  RiAddLine as Plus,
  RiSaveLine as Save,
  RiDeleteBinLine as Trash,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { QueryStateView } from "@/components/system/QueryStateView";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { api, apiErrorTitle, newIdempotencyKey } from "@/lib/api";
import { getCurrentProjectId } from "@/lib/project";

export const Route = createFileRoute("/system/env-roles")({ component: EnvRolesPage });

/** Mapping of environment name → roles allowed to deploy/act in it. */
type EnvRoles = Record<string, string[]>;
type Row = { env: string; roles: string };

function rolesFromInput(input: string): string[] {
  const seen = new Set<string>();
  const roles: string[] = [];
  for (const part of input.split(",")) {
    const role = part.trim();
    if (role && !seen.has(role)) {
      seen.add(role);
      roles.push(role);
    }
  }
  return roles;
}

/**
 * Role-per-environment access control (UC 67): which roles may act on each
 * environment. Saving overwrites the whole mapping, so removing previously
 * configured environments asks for confirmation first.
 */
export function EnvRolesPage() {
  const qc = useQueryClient();
  const projectId = getCurrentProjectId();

  const [rows, setRows] = useState<Row[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingMapping, setPendingMapping] = useState<EnvRoles | null>(null);

  const envRolesQ = useQuery({
    queryKey: ["env-roles", projectId],
    queryFn: () => api<{ env_roles?: EnvRoles }>("GET", "/api/env-roles/_current"),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    if (!envRolesQ.isSuccess) return;
    const mapping = envRolesQ.data?.env_roles ?? {};
    setRows(Object.entries(mapping).map(([env, roles]) => ({
      env,
      roles: Array.isArray(roles) ? roles.join(", ") : "",
    })));
  }, [envRolesQ.data, envRolesQ.isSuccess]);

  const saveMut = useMutation({
    mutationFn: (mapping: EnvRoles) =>
      api<{ success?: boolean; env_roles?: EnvRoles }>("PUT", "/api/env-roles/_current",
        { env_roles: mapping }, { headers: { "Idempotency-Key": newIdempotencyKey() } }),
    onSuccess: () => {
      toast.success("Environment roles saved");
      setConfirmOpen(false);
      setPendingMapping(null);
      void qc.invalidateQueries({ queryKey: ["env-roles"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const submitSave = () => {
    const mapping: EnvRoles = {};
    for (const row of rows) {
      if (!row.env.trim()) {
        toast.error("Validation failed: every row needs an environment name");
        return;
      }
      const roles = rolesFromInput(row.roles);
      if (!roles.length) {
        toast.error(`Validation failed: environment ${row.env.trim()} needs at least one role`);
        return;
      }
      if (mapping[row.env.trim()]) {
        toast.error(`Validation failed: environment ${row.env.trim()} is listed more than once`);
        return;
      }
      mapping[row.env.trim()] = roles;
    }
    const previous = envRolesQ.data?.env_roles ?? {};
    const removed = Object.keys(previous).filter((env) => !(env in mapping));
    if (removed.length > 0) {
      setPendingMapping(mapping);
      setConfirmOpen(true);
      return;
    }
    saveMut.mutate(mapping);
  };

  const removedEnvs = pendingMapping
    ? Object.keys(envRolesQ.data?.env_roles ?? {}).filter((env) => !(env in pendingMapping))
    : [];

  if (!projectId) {
    return (
      <div className="space-y-6">
        <Breadcrumbs />
        <QueryStateView
          empty
          emptyTitle="No project selected"
          emptyMessage="Pick a project in the header to manage its environment roles."
        />
      </div>
    );
  }

  const hasMapping = envRolesQ.isSuccess && Object.keys(envRolesQ.data?.env_roles ?? {}).length > 0;

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <UserStar className="h-5 w-5 text-[var(--color-primary)]" /> Environment Roles
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Restrict which roles can act on each environment. Environments without an entry are unrestricted.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void envRolesQ.refetch()} disabled={envRolesQ.isPending}>
          <Refresh className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <QueryStateView
        loading={envRolesQ.isPending}
        error={envRolesQ.error}
        onRetry={() => void envRolesQ.refetch()}
        empty={envRolesQ.isSuccess && !hasMapping && rows.length === 0}
        emptyTitle="No environment restrictions"
        emptyMessage="Add a row below, for example prod → admin, deployer."
        forbiddenMessage="Environment roles require access to the selected project."
      />

      {envRolesQ.isSuccess && (
        <Card>
          <CardHeader className="p-4 pb-2 border-b border-[var(--color-border)] flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Mapping</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows((current) => [...current, { env: "", roles: "" }])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add environment
              </Button>
              <Button size="sm" onClick={submitSave} disabled={saveMut.isPending || rows.length === 0}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {rows.length === 0 && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Every environment is currently unrestricted. Adding a row limits that environment to the listed roles.
              </p>
            )}
            {rows.map((row, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <label className="block text-xs text-[var(--color-muted-foreground)]">
                  Environment
                  <Input
                    aria-label={`Environment for row ${index + 1}`}
                    placeholder="prod"
                    value={row.env}
                    onChange={(e) => setRows((current) => current.map((r, i) => (i === index ? { ...r, env: e.target.value } : r)))}
                    onKeyDown={(e) => { if (e.key === "Enter") submitSave(); }}
                    className="mt-1 max-w-[160px] font-mono"
                  />
                </label>
                <label className="block text-xs text-[var(--color-muted-foreground)]">
                  Allowed roles (comma-separated)
                  <Input
                    aria-label={`Allowed roles for row ${index + 1}`}
                    placeholder="admin, deployer"
                    value={row.roles}
                    onChange={(e) => setRows((current) => current.map((r, i) => (i === index ? { ...r, roles: e.target.value } : r)))}
                    onKeyDown={(e) => { if (e.key === "Enter") submitSave(); }}
                    className="mt-1 max-w-[320px] font-mono"
                  />
                </label>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove row ${index + 1}`}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Remove environment restrictions"
        description={
          removedEnvs.length === 1
            ? `Saving will remove the restriction for ${removedEnvs[0]} — every role will be able to act on it.`
            : `Saving will remove restrictions for ${removedEnvs.length} environments (${removedEnvs.join(", ")}).`
        }
        confirmLabel="Save and remove"
        variant="destructive"
        busy={saveMut.isPending}
        onConfirm={() => pendingMapping && saveMut.mutate(pendingMapping)}
        onCancel={() => { setConfirmOpen(false); setPendingMapping(null); }}
      />
    </div>
  );
}
