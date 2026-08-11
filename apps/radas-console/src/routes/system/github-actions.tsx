import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  RiGithubLine as Github, RiRefreshLine as Refresh, RiPlayLine as Play,
  RiFileAddLine as FileAdd, RiLogoutBoxLine as Logout, RiPlugLine as Plug,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

export const Route = createFileRoute("/system/github-actions")({ component: GithubActionsPage });

type Repo = { name: string; full_name: string; default_branch: string; visibility: string; description: string | null };
type Workflow = { id: number; name: string; path: string; state: string };
type Run = { id: number; name: string; head_branch: string; event: string; status: string; conclusion: string | null; run_number: number; display_title: string };
type Template = { id: string; name: string; file: string; desc: string };

function GithubActionsPage() {
  const qc = useQueryClient();
  const { data: statusData } = useQuery({ queryKey: ["gh-status"], queryFn: () => api<{ configured: boolean; owner: string }>("GET", "/api/github/status") });
  const { data: repoData } = useQuery({ queryKey: ["gh-repos"], queryFn: () => api<{ repos: Repo[] }>("GET", "/api/github/repos"), enabled: !!statusData?.configured });
  const { data: tplData } = useQuery({ queryKey: ["gh-templates"], queryFn: () => api<{ templates: Template[] }>("GET", "/api/github/workflow-templates") });

  const [selectedRepo, setSelectedRepo] = useState("");
  const [workflowFile, setWorkflowFile] = useState("");
  const [ref, setRef] = useState("main");
  const [inputs, setInputs] = useState("");
  const [template, setTemplate] = useState("tofu-apply");
  const [branch, setBranch] = useState("main");

  const repos = useMemo(() => (repoData?.repos ?? []).map((r) => r.full_name), [repoData]);
  const owner = selectedRepo.split("/")[0] || statusData?.owner || "";
  const repoName = selectedRepo.split("/")[1] || "";

  const { data: wfData } = useQuery({
    queryKey: ["gh-workflows", owner, repoName],
    queryFn: () => api<{ workflows: Workflow[] }>("GET", `/api/github/repos/${owner}/${repoName}/workflows`),
    enabled: !!owner && !!repoName,
  });
  const { data: runsData } = useQuery({
    queryKey: ["gh-runs", owner, repoName],
    queryFn: () => api<{ runs: Run[] }>("GET", `/api/github/repos/${owner}/${repoName}/runs`),
    enabled: !!owner && !!repoName,
    refetchInterval: 15000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["gh-runs"] });
    qc.invalidateQueries({ queryKey: ["gh-workflows"] });
  };

  const dispatchMut = useMutation({
    mutationFn: () => api("POST", `/api/github/repos/${owner}/${repoName}/dispatch`, {
      workflow_file: workflowFile || wfData?.workflows[0]?.path.split("/").pop(),
      ref,
      inputs: inputs ? JSON.parse(inputs) : undefined,
    }),
    onSuccess: () => { toast.success("Workflow dispatched"); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Dispatch gagal"),
  });

  const rerunMut = useMutation({
    mutationFn: (runId: number) => api("POST", `/api/github/repos/${owner}/${repoName}/runs/${runId}/rerun`),
    onSuccess: (d: any) => { toast.success(d?.message || "Rerun requested"); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Rerun gagal"),
  });

  const cancelMut = useMutation({
    mutationFn: (runId: number) => api("POST", `/api/github/repos/${owner}/${repoName}/runs/${runId}/cancel`),
    onSuccess: (d: any) => { toast.success(d?.message || "Cancel requested"); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Cancel gagal"),
  });

  const scaffoldMut = useMutation({
    mutationFn: () => api("POST", `/api/github/repos/${owner}/${repoName}/scaffold`, { template, branch }),
    onSuccess: (d: any) => { toast.success(`Workflow dibuat: ${d?.path}`); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Scaffold gagal"),
  });

  const configured = !!statusData?.configured;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "System" }, { label: "GitHub Actions" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-semibold flex items-center gap-2">
            <Github className="h-5 w-5" /> GitHub Actions
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Kelola repos, workflows, runs & self-hosted runners dari console.
          </p>
        </div>
        <Badge variant={configured ? "success" : "destructive"}>
          {configured ? `connected ${statusData?.owner ?? ""}` : "not configured"}
        </Badge>
      </div>

      {!configured && (
        <Card>
          <CardContent className="py-4 text-sm">
            <div className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
              <Plug className="h-4 w-4" />
              Koneksi GitHub belum tersedia. Pasang <code className="font-mono">gh</code> CLI ber-auth di server, atau set env <code className="font-mono">GH_TOKEN</code>.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Repository</CardTitle></CardHeader>
        <CardContent className="pt-0 flex gap-2 flex-wrap">
          <Select value={selectedRepo} onChange={setSelectedRepo} placeholder="Pilih repository…" className="w-72"
            options={repos.map((r) => ({ value: r, label: r }))} />
          {selectedRepo && (
            <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["gh-"] })}>
              <Refresh className="h-3.5 w-3.5" /> Refresh
            </Button>
          )}
        </CardContent>
      </Card>

      {selectedRepo && repoName && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Workflows</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-1.5 text-sm">
                {(wfData?.workflows ?? []).length === 0 && (
                  <div className="text-xs text-[var(--color-muted-foreground)]">Belum ada workflow. Scaffold dari template di bawah.</div>
                )}
                {(wfData?.workflows ?? []).map((w) => (
                  <div key={w.id} className="flex items-center gap-2 border-b border-[var(--color-border)] last:border-0 py-1.5">
                    <span className="truncate">{w.name}</span>
                    <code className="text-[10px] text-[var(--color-muted-foreground)] truncate">{w.path}</code>
                    <Badge variant={w.state === "active" ? "success" : "default"}>{w.state}</Badge>
                  </div>
                ))}
                {wfData?.workflows.length ? (
                  <div className="space-y-2 pt-2">
                    <div className="text-xs text-[var(--color-muted-foreground)]">Dispatch manual</div>
                    <div className="flex gap-2">
                      <Select value={workflowFile} onChange={setWorkflowFile} placeholder="Workflow file…" className="flex-1" options={[
                          ...(wfData?.workflows.map((w) => ({ value: w.path.split("/").pop() ?? "", label: w.path.split("/").pop() ?? "" })) ?? []),
                        ]} />
                      <Input value={ref} onChange={(e) => setRef(e.target.value)} className="w-28" placeholder="ref" />
                    </div>
                    <Input value={inputs} onChange={(e) => setInputs(e.target.value)} placeholder='inputs JSON opsional, contoh: {"env":"staging"}' className="font-mono text-xs" />
                    <Button size="sm" onClick={() => dispatchMut.mutate()} disabled={dispatchMut.isPending || !workflowFile}>
                      <Play className="h-3.5 w-3.5" /> Dispatch
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Scaffold workflow template</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-2">
                <Select value={template} onChange={setTemplate}
                  options={(tplData?.templates ?? []).map((t) => ({ value: t.id, label: t.name }))} />
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  {(tplData?.templates ?? []).find((t) => t.id === template)?.desc}
                </div>
                <div className="flex items-center gap-2">
                  <Input value={branch} onChange={(e) => setBranch(e.target.value)} className="w-32 text-xs" placeholder="branch" />
                  <Button size="sm" onClick={() => scaffoldMut.mutate()} disabled={scaffoldMut.isPending}>
                    <FileAdd className="h-3.5 w-3.5" /> Commit workflow
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Logout className="h-4 w-4" /> Recent runs
                <span className="ml-auto text-[10px] text-[var(--color-muted-foreground)]">auto-refresh 15s</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1.5 text-sm">
              {(runsData?.runs ?? []).length === 0 && (
                <div className="text-xs text-[var(--color-muted-foreground)]">Belum ada workflow run.</div>
              )}
              {(runsData?.runs ?? []).map((r) => (
                <div key={r.id} className="flex items-center gap-2 border-b border-[var(--color-border)] last:border-0 py-1.5">
                  <Badge variant={r.status === "completed" ? (r.conclusion === "success" ? "success" : "destructive") : "warning"}>
                    {r.status === "completed" ? (r.conclusion ?? "done") : r.status}
                  </Badge>
                  <span className="truncate max-w-[220px]">{r.display_title || r.name}</span>
                  <code className="text-[10px] text-[var(--color-muted-foreground)]">{r.event} · {r.head_branch}</code>
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">#{r.run_number}</span>
                  <span className="ml-auto flex gap-1 shrink-0">
                    {r.status !== "completed" && (
                      <Button size="sm" variant="ghost" onClick={() => cancelMut.mutate(r.id)}><Logout className="h-3 w-3" /> Cancel</Button>
                    )}
                    {r.status === "completed" && r.conclusion !== "success" && (
                      <Button size="sm" variant="ghost" onClick={() => rerunMut.mutate(r.id)}><Refresh className="h-3 w-3" /> Rerun</Button>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}