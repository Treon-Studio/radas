import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  RiFileAddLine as FileAdd,
  RiGithubLine as Github,
  RiKey2Line as Key,
  RiLoader4Line as Loader,
  RiPlayLine as Play,
  RiRefreshLine as Refresh,
  RiPlugLine as Plug,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { GithubRunDetail, isActiveGithubRunStatus } from "@/components/system/GithubRunDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StateView } from "@/components/ui/StateView";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/system/github-actions")({ component: GithubActionsPage });

const RUNS_PER_PAGE = 20;

type Repo = {
  name: string;
  full_name: string;
  default_branch: string;
  visibility: string;
  description: string | null;
};

type Workflow = { id: number; name: string; path: string; state: string };
type Run = {
  id: number;
  name: string;
  head_branch: string;
  head_sha?: string;
  event: string;
  status: string;
  conclusion: string | null;
  run_number: number;
  display_title: string;
  created_at?: string;
  updated_at?: string;
};
type Template = { id: string; name: string; file: string; desc: string };
type Secret = { name: string; created_at?: string; updated_at?: string; visibility?: string };
type Statistics = {
  days: number;
  total_runs: number;
  completed_runs: number;
  success_count: number;
  success_rate: number | null;
  average_duration_seconds: number | null;
  p95_duration_seconds: number | null;
  flaky_groups: number;
};
type ActionResponse = { message?: string; path?: string };

type RunFilters = {
  status: string;
  event: string;
  branch: string;
  since: string;
  page: number;
};

const DEFAULT_FILTERS: RunFilters = { status: "", event: "", branch: "", since: "", page: 1 };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function statusVariant(run: Run) {
  const value = run.status === "completed" ? run.conclusion : run.status;
  if (value === "success") return "success" as const;
  if (["failure", "timed_out", "action_required"].includes(value || "")) return "destructive" as const;
  if (isActiveGithubRunStatus(value)) return "warning" as const;
  return "default" as const;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", `${remainingSeconds}s`]
    .filter(Boolean)
    .join(" ");
}

function formatTimestamp(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("id-ID");
}

function buildRunsPath(basePath: string, filters: RunFilters): string {
  const params = new URLSearchParams({ per_page: String(RUNS_PER_PAGE), page: String(filters.page) });
  if (filters.status) params.set("status", filters.status);
  if (filters.event) params.set("event", filters.event);
  if (filters.branch.trim()) params.set("branch", filters.branch.trim());
  if (filters.since) params.set("since", `>=${filters.since}T00:00:00Z`);
  return `${basePath}/runs?${params.toString()}`;
}

function GithubActionsPage() {
  const queryClient = useQueryClient();
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [workflowFile, setWorkflowFile] = useState("");
  const [ref, setRef] = useState("main");
  const [inputs, setInputs] = useState("");
  const [template, setTemplate] = useState("tofu-apply");
  const [branch, setBranch] = useState("main");
  const [filters, setFilters] = useState<RunFilters>(DEFAULT_FILTERS);
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretToDelete, setSecretToDelete] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["gh-status"],
    queryFn: () => api<{ configured: boolean; owner: string }>("GET", "/api/github/status"),
  });
  const repoQuery = useQuery({
    queryKey: ["gh-repos"],
    queryFn: () => api<{ repos: Repo[] }>("GET", "/api/github/repos"),
    enabled: Boolean(statusQuery.data?.configured),
  });
  const templateQuery = useQuery({
    queryKey: ["gh-templates"],
    queryFn: () => api<{ templates: Template[] }>("GET", "/api/github/workflow-templates"),
  });

  const repos = useMemo(() => repoQuery.data?.repos ?? [], [repoQuery.data]);
  const [owner = "", repoName = ""] = selectedRepo.split("/");
  const basePath = owner && repoName
    ? `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`
    : "";

  useEffect(() => {
    setSelectedRunId(null);
    setFilters(DEFAULT_FILTERS);
  }, [selectedRepo]);

  const workflowQuery = useQuery({
    queryKey: ["gh-workflows", owner, repoName],
    queryFn: () => api<{ workflows: Workflow[] }>("GET", `${basePath}/workflows`),
    enabled: Boolean(basePath),
  });
  const runsQuery = useQuery({
    queryKey: ["gh-runs", owner, repoName, filters],
    queryFn: () => api<{ runs: Run[] }>("GET", buildRunsPath(basePath, filters)),
    enabled: Boolean(basePath),
    refetchInterval: (query) => (query.state.data?.runs ?? []).some((run) => isActiveGithubRunStatus(run.status))
      ? 15_000
      : false,
  });
  const statisticsQuery = useQuery({
    queryKey: ["gh-statistics", owner, repoName],
    queryFn: () => api<Statistics>("GET", `${basePath}/statistics?days=7`),
    enabled: Boolean(basePath),
    refetchInterval: 30_000,
  });
  const secretsQuery = useQuery({
    queryKey: ["gh-secrets", owner, repoName],
    queryFn: () => api<{ secrets: Secret[] }>("GET", `${basePath}/secrets`),
    enabled: Boolean(basePath),
  });

  const refreshRepository = async () => {
    if (!owner || !repoName) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["gh-workflows", owner, repoName] }),
      queryClient.invalidateQueries({ queryKey: ["gh-runs", owner, repoName] }),
      queryClient.invalidateQueries({ queryKey: ["gh-statistics", owner, repoName] }),
      queryClient.invalidateQueries({ queryKey: ["gh-secrets", owner, repoName] }),
    ]);
  };

  const dispatchMutation = useMutation({
    mutationFn: () => {
      let parsedInputs: Record<string, unknown> | undefined;
      if (inputs.trim()) {
        const parsed: unknown = JSON.parse(inputs);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Inputs harus berupa JSON object");
        }
        parsedInputs = parsed as Record<string, unknown>;
      }
      return api<ActionResponse>("POST", `${basePath}/dispatch`, {
        workflow_file: workflowFile || workflowQuery.data?.workflows[0]?.path.split("/").pop(),
        ref,
        inputs: parsedInputs,
      });
    },
    onSuccess: async (response) => {
      toast.success(response.message || "Workflow dispatched");
      await refreshRepository();
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Dispatch gagal")),
  });

  const scaffoldMutation = useMutation({
    mutationFn: () => api<ActionResponse>("POST", `${basePath}/scaffold`, { template, branch }),
    onSuccess: async (response) => {
      toast.success(`Workflow dibuat: ${response.path || "repository updated"}`);
      await refreshRepository();
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Scaffold gagal")),
  });

  const secretMutation = useMutation({
    mutationFn: () => api<ActionResponse>("POST", `${basePath}/secrets`, {
      name: secretName.trim().toUpperCase(),
      value: secretValue,
    }),
    onSuccess: async (response) => {
      toast.success(response.message || "Secret saved");
      setSecretName("");
      setSecretValue("");
      await queryClient.invalidateQueries({ queryKey: ["gh-secrets", owner, repoName] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Secret gagal disimpan")),
  });

  const deleteSecretMutation = useMutation({
    mutationFn: (name: string) => api<ActionResponse>("DELETE", `${basePath}/secrets/${encodeURIComponent(name)}`),
    onSuccess: async () => {
      toast.success("Secret deleted");
      setSecretToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["gh-secrets", owner, repoName] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Secret gagal dihapus")),
  });

  const configured = Boolean(statusQuery.data?.configured);
  const runs = runsQuery.data?.runs ?? [];
  const statistics = statisticsQuery.data;

  const updateFilter = (key: keyof Omit<RunFilters, "page">, value: string) => {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
    setSelectedRunId(null);
  };

  const selectRepository = (fullName: string) => {
    setSelectedRepo(fullName);
    const repository = repos.find((item) => item.full_name === fullName);
    if (repository?.default_branch) {
      setRef(repository.default_branch);
      setBranch(repository.default_branch);
    }
    setWorkflowFile("");
  };

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "System" }, { label: "GitHub Actions" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-mono text-lg font-semibold">
            <Github className="h-5 w-5" /> GitHub Actions
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Kelola repositories, workflows, runs, secrets & self-hosted runners dari console.
          </p>
        </div>
        <Badge variant={configured ? "success" : "destructive"}>
          {configured ? `connected ${statusQuery.data?.owner ?? ""}` : "not configured"}
        </Badge>
      </div>

      {!configured && !statusQuery.isPending && (
        <Card>
          <CardContent className="py-4 text-sm">
            <div className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
              <Plug className="h-4 w-4 shrink-0" />
              <span>
                Koneksi GitHub belum tersedia. Pasang <code className="font-mono">gh</code> CLI ber-auth di server,
                atau set env <code className="font-mono">GH_TOKEN</code>.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Repository</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          {statusQuery.isLoading && <StateView state="loading" title="Memuat koneksi GitHub… / Loading GitHub connection…" />}
          {statusQuery.isError && <StateView state="error" title="Status GitHub gagal dimuat / Could not load GitHub status" message={errorMessage(statusQuery.error, "Coba lagi / Please try again")} onRetry={() => void statusQuery.refetch()} />}
          {configured && repoQuery.isLoading && <StateView state="loading" title="Memuat repositories… / Loading repositories…" />}
          {configured && repoQuery.isError && <StateView state="error" title="Repositories gagal dimuat / Could not load repositories" message={errorMessage(repoQuery.error, "Coba lagi / Please try again")} onRetry={() => void repoQuery.refetch()} />}
          {configured && !repoQuery.isLoading && !repoQuery.isError && repos.length === 0 && <StateView state="empty" title="Belum ada repository / No repositories found" message="Tidak ada repository yang tersedia untuk akun ini. / No repositories are available for this account." />}
          <Select
            value={selectedRepo}
            onChange={selectRepository}
            placeholder={repoQuery.isPending ? "Memuat repositories…" : "Pilih repository…"}
            label="Repository"
            className="w-72"
            disabled={!configured || repoQuery.isPending || repoQuery.isError}
            options={repos.map((repository) => ({
              value: repository.full_name,
              label: repository.full_name,
              description: `${repository.visibility} · ${repository.default_branch}`,
            }))}
          />
          {selectedRepo && (
            <Button className="self-end" size="sm" variant="outline" onClick={() => void refreshRepository()} disabled={workflowQuery.isFetching || runsQuery.isFetching || statisticsQuery.isFetching || secretsQuery.isFetching}>
              <Refresh className="h-3.5 w-3.5" /> {workflowQuery.isFetching || runsQuery.isFetching || statisticsQuery.isFetching || secretsQuery.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          )}
        </CardContent>
      </Card>

      {selectedRepo && repoName && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Workflows</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 pt-0 text-sm">
                {workflowQuery.isPending && <StateView state="loading" title="Memuat workflows…" />}
                {workflowQuery.isError && (
                  <StateView
                    state="error"
                    title="Workflows gagal dimuat"
                    message={errorMessage(workflowQuery.error, "Unknown error")}
                    onRetry={() => void workflowQuery.refetch()}
                  />
                )}
                {!workflowQuery.isPending && !workflowQuery.isError && (workflowQuery.data?.workflows ?? []).length === 0 && (
                  <StateView state="empty" title="Belum ada workflow" message="Scaffold workflow dari template di sebelah." />
                )}
                {(workflowQuery.data?.workflows ?? []).map((workflow) => (
                  <div key={workflow.id} className="flex items-center gap-2 border-b border-[var(--color-border)] py-1.5 last:border-0">
                    <span className="truncate">{workflow.name}</span>
                    <code className="min-w-0 flex-1 truncate text-[10px] text-[var(--color-muted-foreground)]">{workflow.path}</code>
                    <Badge variant={workflow.state === "active" ? "success" : "default"}>{workflow.state}</Badge>
                  </div>
                ))}
                {workflowQuery.data?.workflows.length ? (
                  <div className="space-y-2 pt-2">
                    <div className="text-xs text-[var(--color-muted-foreground)]">Dispatch manual</div>
                    <div className="flex gap-2">
                      <Select
                        value={workflowFile}
                        onChange={setWorkflowFile}
                        placeholder="Workflow file…"
                        className="flex-1"
                        options={workflowQuery.data.workflows.map((workflow) => {
                          const file = workflow.path.split("/").pop() ?? "";
                          return { value: file, label: file };
                        })}
                      />
                      <Input aria-label="Git ref" value={ref} onChange={(event) => setRef(event.target.value)} className="w-28" placeholder="ref" />
                    </div>
                    <Input
                      aria-label="Workflow inputs JSON"
                      value={inputs}
                      onChange={(event) => setInputs(event.target.value)}
                      placeholder='inputs JSON opsional, contoh: {"env":"staging"}'
                      className="font-mono text-xs"
                    />
                    <Button size="sm" onClick={() => dispatchMutation.mutate()} disabled={dispatchMutation.isPending || !workflowFile || !ref.trim()}>
                      {dispatchMutation.isPending ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      {dispatchMutation.isPending ? "Dispatching…" : "Dispatch"}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Scaffold workflow template</CardTitle></CardHeader>
              <CardContent className="space-y-2 pt-0">
                <Select
                  value={template}
                  onChange={setTemplate}
                  label="Template"
                  options={(templateQuery.data?.templates ?? []).map((item) => ({ value: item.id, label: item.name }))}
                />
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  {(templateQuery.data?.templates ?? []).find((item) => item.id === template)?.desc}
                </div>
                <div className="flex items-end gap-2">
                  <label className="block text-xs text-[var(--color-muted-foreground)]">
                    Branch
                    <Input value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-1 w-36 text-xs" placeholder="branch" />
                  </label>
                  <Button size="sm" onClick={() => scaffoldMutation.mutate()} disabled={scaffoldMutation.isPending || !branch.trim()}>
                    {scaffoldMutation.isPending ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <FileAdd className="h-3.5 w-3.5" />}
                    {scaffoldMutation.isPending ? "Committing…" : "Commit workflow"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm"><Key className="h-4 w-4" /> Repository secrets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_auto]">
                <Input
                  aria-label="Secret name"
                  value={secretName}
                  onChange={(event) => setSecretName(event.target.value.toUpperCase())}
                  placeholder="SECRET_NAME"
                  autoComplete="off"
                  className="font-mono"
                />
                <Input
                  aria-label="Secret value"
                  type="password"
                  value={secretValue}
                  onChange={(event) => setSecretValue(event.target.value)}
                  placeholder="Secret value"
                  autoComplete="new-password"
                />
                <Button
                  size="sm"
                  onClick={() => secretMutation.mutate()}
                  disabled={secretMutation.isPending || !secretName.trim() || !secretValue}
                >
                  {secretMutation.isPending ? "Saving…" : "Save secret"}
                </Button>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Nilai secret dikirim ke GitHub dan tidak dapat dibaca kembali.</p>
              {secretsQuery.isPending && <StateView state="loading" title="Memuat secrets…" />}
              {secretsQuery.isError && (
                <StateView
                  state="error"
                  title="Secrets gagal dimuat"
                  message={errorMessage(secretsQuery.error, "Unknown error")}
                  onRetry={() => void secretsQuery.refetch()}
                />
              )}
              {!secretsQuery.isPending && !secretsQuery.isError && (secretsQuery.data?.secrets ?? []).length === 0 && (
                <div className="text-xs text-[var(--color-muted-foreground)]">Belum ada repository secret.</div>
              )}
              {(secretsQuery.data?.secrets ?? []).map((secret) => (
                <div key={secret.name} className="flex items-center gap-2 border-t border-[var(--color-border)] pt-2 text-sm">
                  <code className="min-w-0 flex-1 truncate">{secret.name}</code>
                  <span className="hidden text-xs text-[var(--color-muted-foreground)] sm:inline">Updated {formatTimestamp(secret.updated_at)}</span>
                  <Button size="sm" variant="ghost" onClick={() => setSecretToDelete(secret.name)}>Delete</Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <section aria-labelledby="github-run-statistics" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 id="github-run-statistics" className="text-sm font-semibold">Run statistics</h2>
              <span className="text-xs text-[var(--color-muted-foreground)]">Last 7 days</span>
            </div>
            {statisticsQuery.isPending && <Card><CardContent><StateView state="loading" title="Memuat statistics…" /></CardContent></Card>}
            {statisticsQuery.isError && (
              <Card><CardContent><StateView state="error" title="Statistics gagal dimuat" message={errorMessage(statisticsQuery.error, "Unknown error")} onRetry={() => void statisticsQuery.refetch()} /></CardContent></Card>
            )}
            {statistics && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card><CardContent className="py-4"><div className="text-xs text-[var(--color-muted-foreground)]">Success rate</div><div className="mt-1 font-mono text-2xl font-semibold">{statistics.success_rate == null ? "—" : `${(statistics.success_rate * 100).toFixed(1)}%`}</div><div className="text-xs text-[var(--color-muted-foreground)]">{statistics.success_count}/{statistics.completed_runs} completed</div></CardContent></Card>
                <Card><CardContent className="py-4"><div className="text-xs text-[var(--color-muted-foreground)]">Average duration</div><div className="mt-1 font-mono text-2xl font-semibold">{formatDuration(statistics.average_duration_seconds)}</div><div className="text-xs text-[var(--color-muted-foreground)]">{statistics.total_runs} total runs</div></CardContent></Card>
                <Card><CardContent className="py-4"><div className="text-xs text-[var(--color-muted-foreground)]">p95 duration</div><div className="mt-1 font-mono text-2xl font-semibold">{formatDuration(statistics.p95_duration_seconds)}</div><div className="text-xs text-[var(--color-muted-foreground)]">95th percentile</div></CardContent></Card>
                <Card><CardContent className="py-4"><div className="text-xs text-[var(--color-muted-foreground)]">Flaky groups</div><div className="mt-1 font-mono text-2xl font-semibold">{statistics.flaky_groups}</div><div className="text-xs text-[var(--color-muted-foreground)]">mixed success/failure attempts</div></CardContent></Card>
              </div>
            )}
          </section>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                Workflow runs
                <span className="ml-auto text-[10px] font-normal text-[var(--color-muted-foreground)]">auto-refresh 15s while active</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <Select
                  value={filters.status}
                  onChange={(value) => updateFilter("status", value)}
                  label="Status"
                  options={[
                    { value: "", label: "All statuses" },
                    { value: "queued", label: "Queued" },
                    { value: "in_progress", label: "In progress" },
                    { value: "completed", label: "Completed" },
                    { value: "success", label: "Success" },
                    { value: "failure", label: "Failure" },
                    { value: "cancelled", label: "Cancelled" },
                  ]}
                />
                <Select
                  value={filters.event}
                  onChange={(value) => updateFilter("event", value)}
                  label="Event"
                  options={[
                    { value: "", label: "All events" },
                    { value: "push", label: "Push" },
                    { value: "pull_request", label: "Pull request" },
                    { value: "workflow_dispatch", label: "Workflow dispatch" },
                    { value: "schedule", label: "Schedule" },
                    { value: "workflow_call", label: "Workflow call" },
                  ]}
                />
                <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  Branch
                  <Input value={filters.branch} onChange={(event) => updateFilter("branch", event.target.value)} placeholder="All branches" className="mt-1" />
                </label>
                <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  Since
                  <Input type="date" value={filters.since} onChange={(event) => updateFilter("since", event.target.value)} className="mt-1" />
                </label>
                <Select
                  value={String(filters.page)}
                  onChange={(value) => {
                    setFilters((current) => ({ ...current, page: Number(value) }));
                    setSelectedRunId(null);
                  }}
                  label="Page"
                  options={Array.from({ length: Math.max(5, filters.page + 1) }, (_, index) => ({ value: String(index + 1), label: `Page ${index + 1}` }))}
                />
              </div>

              {runsQuery.isPending && <StateView state="loading" title="Memuat workflow runs…" />}
              {runsQuery.isError && (
                <StateView
                  state="error"
                  title="Workflow runs gagal dimuat"
                  message={errorMessage(runsQuery.error, "Unknown error")}
                  onRetry={() => void runsQuery.refetch()}
                />
              )}
              {!runsQuery.isPending && !runsQuery.isError && runs.length === 0 && (
                <StateView state="empty" title="Tidak ada workflow run" message="Coba ubah filters atau dispatch workflow baru." />
              )}
              {runs.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--color-muted)]/50 text-xs text-[var(--color-muted-foreground)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Run</th>
                        <th className="px-3 py-2 font-medium">Event</th>
                        <th className="px-3 py-2 font-medium">Branch / SHA</th>
                        <th className="px-3 py-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => {
                        const selected = selectedRunId === run.id;
                        return (
                          <tr
                            key={run.id}
                            aria-selected={selected}
                            onClick={() => setSelectedRunId(run.id)}
                            className={cn(
                              "cursor-pointer border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-muted)]/40",
                              selected && "bg-[var(--color-accent)]/10",
                            )}
                          >
                            <td className="px-3 py-2"><Badge variant={statusVariant(run)}>{run.status === "completed" ? (run.conclusion || "completed") : run.status}</Badge></td>
                            <td className="max-w-xs px-3 py-2">
                              <button type="button" className="block w-full truncate text-left font-medium focus-visible:outline-none focus-visible:underline" onClick={() => setSelectedRunId(run.id)}>
                                {run.display_title || run.name}
                              </button>
                              <span className="text-[10px] text-[var(--color-muted-foreground)]">#{run.run_number}</span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{run.event}</td>
                            <td className="px-3 py-2"><div className="max-w-48 truncate">{run.head_branch || "—"}</div><code className="text-[10px] text-[var(--color-muted-foreground)]">{run.head_sha || ""}</code></td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--color-muted-foreground)]">{formatTimestamp(run.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={filters.page <= 1 || runsQuery.isFetching}
                  onClick={() => {
                    setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }));
                    setSelectedRunId(null);
                  }}
                >
                  Previous
                </Button>
                <span className="text-xs text-[var(--color-muted-foreground)]">Page {filters.page}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={runs.length < RUNS_PER_PAGE || runsQuery.isFetching}
                  onClick={() => {
                    setFilters((current) => ({ ...current, page: current.page + 1 }));
                    setSelectedRunId(null);
                  }}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>

          {selectedRunId != null && (
            <GithubRunDetail owner={owner} repo={repoName} runId={selectedRunId} onUpdated={() => void refreshRepository()} />
          )}
        </>
      )}

      <ConfirmDialog
        open={secretToDelete != null}
        title="Delete repository secret?"
        description={secretToDelete ? `${secretToDelete} akan dihapus dari ${selectedRepo}. Workflow yang bergantung pada secret ini dapat gagal.` : undefined}
        confirmLabel="Delete secret"
        cancelLabel="Keep secret"
        variant="destructive"
        busy={deleteSecretMutation.isPending}
        busyLabel="Deleting…"
        onConfirm={() => secretToDelete && deleteSecretMutation.mutate(secretToDelete)}
        onCancel={() => setSecretToDelete(null)}
      />
    </div>
  );
}
