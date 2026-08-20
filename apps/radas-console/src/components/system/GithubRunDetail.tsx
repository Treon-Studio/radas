import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RiExternalLinkLine as ExternalLink,
  RiFileCopyLine as Copy,
  RiLoader4Line as Loader,
  RiRefreshLine as Refresh,
  RiStopCircleLine as Stop,
} from "@remixicon/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { StateView } from "@/components/ui/StateView";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 3_000;
const MAX_LOG_CHARACTERS = 80_000;
const MAX_LOG_LINES = 5_000;

export const ACTIVE_GITHUB_RUN_STATUSES = new Set([
  "queued",
  "in_progress",
  "waiting",
  "pending",
  "requested",
]);

type GithubRunDetailProps = {
  owner: string;
  repo: string;
  runId: number;
  onUpdated?: () => void;
};

type GithubRun = {
  id: number;
  name?: string;
  display_title?: string;
  status?: string;
  conclusion?: string | null;
  run_number?: number;
  run_attempt?: number;
  event?: string;
  head_branch?: string;
  head_sha?: string;
  created_at?: string;
  updated_at?: string;
  run_started_at?: string;
  completed_at?: string;
  html_url?: string;
};

type GithubStep = {
  number?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  started_at?: string;
  completed_at?: string;
};

type GithubJob = {
  id: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  started_at?: string;
  completed_at?: string;
  steps?: GithubStep[];
};

type JobsResponse = { jobs?: GithubJob[] };
type ActionResponse = { message?: string };
type LogLine = { number: number; text: string };
type DisplayedLogs = { lines: LogLine[]; truncated: boolean; totalLines: number };

export function isActiveGithubRunStatus(status?: string | null): boolean {
  return ACTIVE_GITHUB_RUN_STATUSES.has((status || "").toLowerCase());
}

function statusVariant(status?: string | null, conclusion?: string | null) {
  const value = conclusion || status || "unknown";
  if (value === "success") return "success" as const;
  if (["failure", "timed_out", "action_required"].includes(value)) return "destructive" as const;
  if (isActiveGithubRunStatus(value)) return "warning" as const;
  return "default" as const;
}

function formatTimestamp(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("id-ID");
}

function durationSeconds(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 1_000);
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", `${remainingSeconds}s`]
    .filter(Boolean)
    .join(" ");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalizeLogs(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function capLogs(rawLogs: string): DisplayedLogs {
  const normalized = rawLogs.replace(/\r\n/g, "\n");
  const allLines = normalized.split("\n");
  let startCharacter = Math.max(0, normalized.length - MAX_LOG_CHARACTERS);

  if (startCharacter > 0) {
    const nextNewline = normalized.indexOf("\n", startCharacter);
    if (nextNewline >= 0) startCharacter = nextNewline + 1;
  }

  const omittedByCharacters = normalized.slice(0, startCharacter).split("\n").length - 1;
  let visibleLines = normalized.slice(startCharacter).split("\n");
  let firstLineNumber = omittedByCharacters + 1;

  if (visibleLines.length > MAX_LOG_LINES) {
    const omittedByLineLimit = visibleLines.length - MAX_LOG_LINES;
    visibleLines = visibleLines.slice(omittedByLineLimit);
    firstLineNumber += omittedByLineLimit;
  }

  return {
    lines: visibleLines.map((text, index) => ({ number: firstLineNumber + index, text })),
    truncated: startCharacter > 0 || visibleLines.length < allLines.length,
    totalLines: allLines.length,
  };
}

export function GithubRunDetail({ owner, repo, runId, onUpdated }: GithubRunDetailProps) {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [logSearch, setLogSearch] = useState("");
  const [rerunOpen, setRerunOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const basePath = `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const runQuery = useQuery({
    queryKey: ["gh-run-detail", owner, repo, runId],
    queryFn: () => api<GithubRun>("GET", `${basePath}/runs/${runId}`),
    enabled: Boolean(owner && repo && runId),
    refetchInterval: (query) => isActiveGithubRunStatus(query.state.data?.status) ? POLL_INTERVAL_MS : false,
  });

  const jobsQuery = useQuery({
    queryKey: ["gh-run-jobs", owner, repo, runId],
    queryFn: () => api<JobsResponse>("GET", `${basePath}/runs/${runId}/jobs`),
    enabled: Boolean(owner && repo && runId),
    refetchInterval: isActiveGithubRunStatus(runQuery.data?.status) ? POLL_INTERVAL_MS : false,
  });

  const logsQuery = useQuery({
    queryKey: ["gh-job-logs", owner, repo, selectedJobId],
    queryFn: async () => normalizeLogs(await api<unknown>("GET", `${basePath}/jobs/${selectedJobId}/logs`)),
    enabled: selectedJobId != null,
    retry: false,
  });

  useEffect(() => {
    setSelectedJobId(null);
    setLogSearch("");
    setRerunOpen(false);
    setCancelOpen(false);
  }, [owner, repo, runId]);

  const refreshRun = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["gh-run-detail", owner, repo, runId] }),
      queryClient.invalidateQueries({ queryKey: ["gh-run-jobs", owner, repo, runId] }),
      queryClient.invalidateQueries({ queryKey: ["gh-runs", owner, repo] }),
      queryClient.invalidateQueries({ queryKey: ["gh-statistics", owner, repo] }),
    ]);
    onUpdated?.();
  };

  const rerunMutation = useMutation({
    mutationFn: () => api<ActionResponse>("POST", `${basePath}/runs/${runId}/rerun`),
    onSuccess: async (response) => {
      setRerunOpen(false);
      toast.success(response.message || "Rerun requested");
      await refreshRun();
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Rerun gagal")),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api<ActionResponse>("POST", `${basePath}/runs/${runId}/cancel`),
    onSuccess: async (response) => {
      setCancelOpen(false);
      toast.success(response.message || "Cancel requested");
      await refreshRun();
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Cancel gagal")),
  });

  const displayedLogs = useMemo(() => capLogs(logsQuery.data || ""), [logsQuery.data]);
  const filteredLines = useMemo(() => {
    const query = logSearch.trim().toLocaleLowerCase();
    if (!query) return displayedLogs.lines;
    return displayedLogs.lines.filter((line) => line.text.toLocaleLowerCase().includes(query));
  }, [displayedLogs.lines, logSearch]);

  const copyLogs = async () => {
    const text = displayedLogs.lines.map((line) => line.text).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Logs copied");
    } catch {
      toast.error("Tidak dapat menyalin logs");
    }
  };

  if (runQuery.isPending) {
    return <Card data-testid="github-run-detail"><CardContent><StateView state="loading" title="Memuat run detail…" /></CardContent></Card>;
  }

  if (runQuery.isError || !runQuery.data) {
    return (
      <Card data-testid="github-run-detail">
        <CardContent>
          <StateView
            state="error"
            title="Run detail gagal dimuat"
            message={errorMessage(runQuery.error, "Unknown error")}
            onRetry={() => void runQuery.refetch()}
          />
        </CardContent>
      </Card>
    );
  }

  const run = runQuery.data;
  const jobs = jobsQuery.data?.jobs ?? [];
  const runEnd = run.completed_at || (run.status === "completed" ? run.updated_at : undefined);
  const runDuration = durationSeconds(run.run_started_at || run.created_at, runEnd);

  return (
    <Card data-testid="github-run-detail">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm">{run.display_title || run.name || `Run #${run.run_number || runId}`}</CardTitle>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Run #{run.run_number || runId} · attempt {run.run_attempt || 1}
              {run.event ? ` · ${run.event}` : ""}
              {run.head_branch ? ` · ${run.head_branch}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isActiveGithubRunStatus(run.status) && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]" role="status">
                <Loader className="h-3.5 w-3.5 animate-spin" /> refresh 3s
              </span>
            )}
            <Badge variant={statusVariant(run.status, run.conclusion)}>{run.status || "unknown"}</Badge>
            {run.conclusion && <Badge variant={statusVariant(undefined, run.conclusion)}>{run.conclusion}</Badge>}
            {run.html_url && (
              <Button asChild size="sm" variant="outline">
                <a href={run.html_url} target="_blank" rel="noreferrer">
                  GitHub <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <div className="grid gap-3 rounded-md border border-[var(--color-border)] p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="text-[var(--color-muted-foreground)]">Created</span><div className="mt-1">{formatTimestamp(run.created_at)}</div></div>
          <div><span className="text-[var(--color-muted-foreground)]">Started</span><div className="mt-1">{formatTimestamp(run.run_started_at)}</div></div>
          <div><span className="text-[var(--color-muted-foreground)]">Updated</span><div className="mt-1">{formatTimestamp(run.updated_at)}</div></div>
          <div><span className="text-[var(--color-muted-foreground)]">Duration</span><div className="mt-1">{formatDuration(runDuration)}</div></div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void refreshRun()}>
            <Refresh className="h-3.5 w-3.5" /> Refresh detail
          </Button>
          {run.status === "completed" && (
            <Button size="sm" variant="outline" onClick={() => setRerunOpen(true)} disabled={rerunMutation.isPending}>
              {rerunMutation.isPending ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Refresh className="h-3.5 w-3.5" />}
              {rerunMutation.isPending ? "Requesting…" : "Rerun"}
            </Button>
          )}
          {isActiveGithubRunStatus(run.status) && (
            <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)} disabled={cancelMutation.isPending}>
              <Stop className="h-3.5 w-3.5" /> Cancel run
            </Button>
          )}
        </div>

        <section aria-labelledby={`run-${runId}-jobs-title`} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id={`run-${runId}-jobs-title`} className="text-sm font-semibold">Jobs</h3>
            <span className="text-xs text-[var(--color-muted-foreground)]">{jobs.length} job(s)</span>
          </div>

          {jobsQuery.isPending && <StateView state="loading" title="Memuat jobs…" />}
          {jobsQuery.isError && (
            <StateView
              state="error"
              title="Jobs gagal dimuat"
              message={errorMessage(jobsQuery.error, "Unknown error")}
              onRetry={() => void jobsQuery.refetch()}
            />
          )}
          {!jobsQuery.isPending && !jobsQuery.isError && jobs.length === 0 && (
            <StateView state="empty" title="Belum ada job" message="Jobs akan muncul setelah workflow mulai diproses." />
          )}

          {jobs.map((job) => {
            const jobDuration = durationSeconds(job.started_at, job.completed_at);
            const selected = selectedJobId === job.id;
            return (
              <div key={job.id} className="rounded-md border border-[var(--color-border)]">
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <Badge variant={statusVariant(job.status, job.conclusion)}>{job.conclusion || job.status || "unknown"}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{job.name || `Job ${job.id}`}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">{formatDuration(jobDuration)}</span>
                  <Button
                    size="sm"
                    variant={selected ? "secondary" : "ghost"}
                    aria-pressed={selected}
                    onClick={() => {
                      if (selected) {
                        void logsQuery.refetch();
                        return;
                      }
                      setSelectedJobId(job.id);
                      setLogSearch("");
                    }}
                  >
                    {selected && logsQuery.isFetching ? <Loader className="h-3.5 w-3.5 animate-spin" /> : null}
                    {selected ? "Reload logs" : "View logs"}
                  </Button>
                </div>
                {(job.steps ?? []).length > 0 && (
                  <ol className="border-t border-[var(--color-border)] px-3 py-2">
                    {(job.steps ?? []).map((step, index) => (
                      <li key={`${step.number ?? index}-${step.name ?? "step"}`} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                        <span className="w-5 shrink-0 text-right font-mono text-[var(--color-muted-foreground)]">{step.number ?? index + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{step.name || "Unnamed step"}</span>
                        <Badge variant={statusVariant(step.status, step.conclusion)}>{step.conclusion || step.status || "unknown"}</Badge>
                        <span className="w-16 text-right text-[var(--color-muted-foreground)]">
                          {formatDuration(durationSeconds(step.started_at, step.completed_at))}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </section>

        {selectedJobId != null && (
          <section aria-labelledby={`job-${selectedJobId}-logs-title`} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`job-${selectedJobId}-logs-title`} className="text-sm font-semibold">Job logs</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={logSearch}
                  onChange={(event) => setLogSearch(event.target.value)}
                  aria-label="Search job logs"
                  placeholder="Search logs…"
                  className="h-8 w-56 font-mono text-xs"
                />
                <Button size="sm" variant="outline" onClick={() => void logsQuery.refetch()} disabled={logsQuery.isFetching}>
                  <Refresh className={cn("h-3.5 w-3.5", logsQuery.isFetching && "animate-spin")} /> Reload
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copyLogs()} disabled={!logsQuery.data}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </div>
            </div>

            {logsQuery.isPending && <StateView state="loading" title="Memuat job logs…" />}
            {logsQuery.isError && (
              <StateView
                state="error"
                title="Logs gagal dimuat"
                message={errorMessage(logsQuery.error, "Unknown error")}
                onRetry={() => void logsQuery.refetch()}
              />
            )}
            {logsQuery.isSuccess && !logsQuery.data && (
              <StateView state="empty" title="Logs belum tersedia" message="GitHub belum menyediakan logs untuk job ini." />
            )}
            {logsQuery.isSuccess && Boolean(logsQuery.data) && (
              <>
                <div className="flex flex-wrap justify-between gap-2 text-[11px] text-[var(--color-muted-foreground)]">
                  <span>{logSearch.trim() ? `${filteredLines.length} matching line(s)` : `${displayedLogs.lines.length} line(s)`}</span>
                  {displayedLogs.truncated && (
                    <span role="status">Output ditampilkan terbatas pada {MAX_LOG_LINES.toLocaleString()} baris / {MAX_LOG_CHARACTERS.toLocaleString()} karakter terakhir dari {displayedLogs.totalLines.toLocaleString()} baris.</span>
                  )}
                </div>
                <div className="max-h-[32rem] overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 font-mono text-xs" tabIndex={0} aria-label="Job log output">
                  {filteredLines.length === 0 ? (
                    <div className="p-4 text-[var(--color-muted-foreground)]">Tidak ada baris yang cocok.</div>
                  ) : (
                    filteredLines.map((line) => (
                      <div key={line.number} className="flex min-w-max hover:bg-[var(--color-muted)]">
                        <span className="sticky left-0 w-14 shrink-0 select-none border-r border-[var(--color-border)] bg-[var(--color-card)] px-2 py-0.5 text-right text-[var(--color-muted-foreground)]">
                          {line.number}
                        </span>
                        <span className="whitespace-pre px-3 py-0.5">{line.text || " "}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </CardContent>

      <ConfirmDialog
        open={rerunOpen}
        title="Rerun workflow run?"
        description={`Run #${run.run_number || runId} akan dijalankan ulang dengan workflow dan commit yang sama.`}
        confirmLabel="Rerun"
        cancelLabel="Cancel"
        busy={rerunMutation.isPending}
        busyLabel="Requesting…"
        onConfirm={() => rerunMutation.mutate()}
        onCancel={() => setRerunOpen(false)}
      />

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel workflow run?"
        description={`Run #${run.run_number || runId} akan dibatalkan. Job yang sedang berjalan mungkin berhenti segera.`}
        confirmLabel="Cancel run"
        cancelLabel="Keep running"
        variant="destructive"
        busy={cancelMutation.isPending}
        busyLabel="Cancelling…"
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setCancelOpen(false)}
      />
    </Card>
  );
}
