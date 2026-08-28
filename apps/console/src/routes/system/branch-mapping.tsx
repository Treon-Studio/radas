import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  RiGitBranchLine as Branch,
  RiAddLine as Plus,
  RiRefreshLine as Refresh,
  RiDeleteBinLine as Trash,
  RiSaveLine as Save,
  RiEyeLine as Eye,
  RiShuffleLine as Shuffle,
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

export const Route = createFileRoute("/system/branch-mapping")({ component: BranchMappingPage });

type MappingRule = { pattern: string; environment: string; stack_override?: string };
type ResolveResult = {
  environment: string;
  stack_override?: string | null;
  matched_rule?: MappingRule | null;
};

const ENVIRONMENTS = ["dev", "staging", "prod", "preview", "test"] as const;

export function BranchMappingPage() {
  const qc = useQueryClient();
  const projectId = getCurrentProjectId();
  const [stackInput, setStackInput] = useState("");
  const [activeStack, setActiveStack] = useState("");
  const [rows, setRows] = useState<MappingRule[]>([]);
  const [branch, setBranch] = useState("");

  const stack = activeStack.trim();

  const mappingQ = useQuery({
    queryKey: ["branch-mapping", projectId, stack],
    queryFn: () =>
      api<{ rules?: MappingRule[] }>(
        "GET",
        // Read the tenant from live localStorage so a project switch is
        // honoured by the very next fetch, even before React re-renders.
        `/api/projects/${encodeURIComponent(getCurrentProjectId() ?? "")}/stacks/${encodeURIComponent(stack)}/branch-mapping`,
      ),
    enabled: Boolean(projectId) && Boolean(stack),
  });

  const rules: MappingRule[] = (mappingQ.data?.rules ?? []).map((r) => ({
    pattern: typeof r.pattern === "string" ? r.pattern : "",
    environment: ENVIRONMENTS.find((e) => e === r.environment) ?? "dev",
    stack_override: typeof r.stack_override === "string" ? r.stack_override : undefined,
  }));

  useEffect(() => {
    if (!mappingQ.isSuccess) return;
    setRows(rules);
    // rules is derived from mappingQ.data; it only changes with the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingQ.data, mappingQ.isSuccess]);

  const saveMut = useMutation({
    mutationFn: (payload: { rules: MappingRule[] }) =>
      api<{ success?: boolean }>(
        "PUT",
        `/api/projects/${encodeURIComponent(getCurrentProjectId() ?? "")}/stacks/${encodeURIComponent(stack)}/branch-mapping`,
        { rules: payload.rules },
        { headers: { "Idempotency-Key": newIdempotencyKey() } },
      ),
    onSuccess: () => {
      toast.success("Branch mapping saved");
      void qc.invalidateQueries({ queryKey: ["branch-mapping"] });
    },
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const resolveMut = useMutation({
    mutationFn: (branchName: string) =>
      api<ResolveResult>(
        "POST",
        `/api/projects/${encodeURIComponent(getCurrentProjectId() ?? "")}/stacks/${encodeURIComponent(stack)}/resolve-branch`,
        { branch: branchName },
        { headers: { "Idempotency-Key": newIdempotencyKey() } },
      ),
    onError: (error) => toast.error(apiErrorTitle(error)),
  });

  const submitSave = () => {
    for (const row of rows) {
      if (!row.pattern.trim()) {
        toast.error("Validation failed: every rule needs a non-empty pattern (regex)");
        return;
      }
      if (!ENVIRONMENTS.find((e) => e === row.environment)) {
        toast.error(`Validation failed: unknown environment ${row.environment}`);
        return;
      }
    }
    saveMut.mutate({ rules: rows });
  };

  const submitResolve = () => {
    if (!branch.trim()) {
      toast.error("Validation failed: branch required");
      return;
    }
    resolveMut.mutate(branch.trim());
  };

  const updateRow = (index: number, patch: Partial<MappingRule>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const resolution = resolveMut.data;
  const disabled = !projectId;

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Branch className="h-5 w-5 text-[var(--color-primary)]" /> Branch Mapping
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Map VCS branches to environments (with optional stack override) per stack.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void mappingQ.refetch()} disabled={disabled || !stack}>
          <Refresh className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {disabled ? (
        <QueryStateView
          empty
          emptyTitle="No project selected"
          emptyMessage="Pick a project in the header to manage branch mappings."
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <label className="block text-xs text-[var(--color-muted-foreground)]">
                Stack
                <Input
                  aria-label="Stack name"
                  placeholder="stack name"
                  value={stackInput}
                  onChange={(e) => setStackInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && stackInput.trim()) setActiveStack(stackInput.trim()); }}
                  className="mt-1 max-w-[240px]"
                />
              </label>
              <Button
                size="sm"
                onClick={() => setActiveStack(stackInput.trim())}
                disabled={!stackInput.trim()}
              >
                Load rules
              </Button>
              {stack && <Badge variant="default" className="text-[10px] uppercase font-mono">{stack}</Badge>}
            </CardContent>
          </Card>

          {stack && (
            <>
              <QueryStateView
                loading={mappingQ.isPending}
                error={mappingQ.error}
                empty={mappingQ.isSuccess && rules.length === 0 && rows.length === 0}
                onRetry={() => void mappingQ.refetch()}
                emptyTitle="No mapping rules for this stack"
                emptyMessage="Add a rule below, for example main → prod."
                forbiddenMessage="Branch mapping requires access to the selected project."
              />

              {(rows.length > 0 || (mappingQ.isSuccess && rules.length === 0)) && (
                <Card>
                  <CardHeader className="p-4 pb-2 border-b border-[var(--color-border)] flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Rules</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRows((current) => [...current, { pattern: "", environment: "dev" }])}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Add rule
                      </Button>
                      <Button size="sm" onClick={submitSave} disabled={saveMut.isPending}>
                        <Save className="h-4 w-4 mr-1" /> Save
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    {rows.map((row, index) => (
                      <div key={index} className="flex flex-wrap items-end gap-2">
                        <label className="block text-xs text-[var(--color-muted-foreground)]">
                          Pattern (regex)
                          <Input
                            aria-label={`Pattern for rule ${index + 1}`}
                            placeholder="^main$"
                            value={row.pattern}
                            onChange={(e) => updateRow(index, { pattern: e.target.value })}
                            className="mt-1 max-w-[220px] font-mono"
                          />
                        </label>
                        <label className="block text-xs text-[var(--color-muted-foreground)]">
                          Environment
                          <select
                            aria-label={`Environment for rule ${index + 1}`}
                            value={row.environment}
                            onChange={(e) => updateRow(index, { environment: e.target.value })}
                            className="mt-1 h-10 border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-sm font-mono"
                          >
                            {ENVIRONMENTS.map((env) => <option key={env} value={env}>{env}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-[var(--color-muted-foreground)]">
                          Stack override (optional)
                          <Input
                            aria-label={`Stack override for rule ${index + 1}`}
                            placeholder="same stack"
                            value={row.stack_override ?? ""}
                            onChange={(e) => updateRow(index, { stack_override: e.target.value || undefined })}
                            className="mt-1 max-w-[200px] font-mono"
                          />
                        </label>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                          aria-label={`Remove rule ${index + 1}`}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="p-4 pb-2 border-b border-[var(--color-border)]">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Eye className="h-4 w-4 text-[var(--color-muted-foreground)]" /> Resolve preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block text-xs text-[var(--color-muted-foreground)]">
                      Branch
                      <Input
                        aria-label="Branch to resolve"
                        placeholder="feature/login"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") submitResolve(); }}
                        className="mt-1 max-w-[240px] font-mono"
                      />
                    </label>
                    <Button size="sm" onClick={submitResolve} disabled={resolveMut.isPending}>
                      <Shuffle className="h-4 w-4 mr-1" /> Resolve
                    </Button>
                  </div>
                  {resolution && (
                    <div
                      data-testid="resolve-preview"
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3 text-sm space-y-1.5 font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                          Matched environment
                        </span>
                        <Badge variant="success" className="text-[10px] uppercase">{resolution.environment}</Badge>
                      </div>
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        Stack override: {resolution.stack_override || "none (uses this stack)"}
                      </div>
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        {resolution.matched_rule
                          ? `Matched rule: ${resolution.matched_rule.pattern}`
                          : "No rule matched — default environment dev applies."}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
