import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  RiFlaskLine as Flask, RiAddLine as Plus, RiDeleteBinLine as Trash,
  RiPlayLine as Play, RiRefreshLine as Refresh,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CheckboxInput } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

export const Route = createFileRoute("/cloud/tests")({ component: TestsPage });

type Assertion = { id: string; name: string; desc: string; severity: string };
type TestCase = {
  id: string; name: string; description?: string; stack: string; kind: string; assertions: string[];
  severity: string; enabled: boolean; tags: string[]; schedule?: string; created_at: number;
};
type TestResult = {
  id: string; run_id?: string; test_id: string; name: string; stack: string; kind: string;
  severity: string; passed: boolean; status?: string; queued?: boolean; retry_count?: number; attempts?: { attempt: number; status?: string; passed?: boolean }[]; findings: { assertion: string; name: string; severity: string; source: string; detail: unknown; tool_status?: unknown }[];
  ran_at: number; mock_provider?: boolean; timeout_seconds?: number;
};
type BaselineCompare = {
  test_id: string;
  baseline_id: string;
  baseline_run_id?: string | null;
  current_run_id?: string | null;
  regressed: boolean;
  changed: boolean;
  passed: boolean;
};
type BaselineState = BaselineCompare & { selected_result_id: string };
type TabId = "cases" | "runs" | "catalog";

function formatFindingDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail == null) return "";
  try {
    return JSON.stringify(detail, null, 2) ?? String(detail);
  } catch {
    return String(detail);
  }
}

const KINDS = ["assertion", "tofu_validate", "tofu_test", "smoke"];
const SEVERITIES = ["blocker", "warning", "info"];

function TestsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["tests"], queryFn: () => api<{ test_cases: TestCase[] }>("GET", "/api/tests") });
  const { data: catalog } = useQuery({ queryKey: ["tests-catalog"], queryFn: () => api<{ assertions: Assertion[] }>("GET", "/api/tests/catalog") });
  const { data: stacks } = useQuery({ queryKey: ["stacks"], queryFn: () => api<{ stacks: { name: string }[] }>("GET", "/api/cloud/stacks") });
  const { data: results } = useQuery({ queryKey: ["test-results"], queryFn: () => api<{ results: TestResult[] }>("GET", "/api/tests/results?limit=50") });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [stack, setStack] = useState("");
  const [kind, setKind] = useState("assertion");
  const [severity, setSeverity] = useState("warning");
  const [assertions, setAssertions] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [stackFilter, setStackFilter] = useState("");
  const [editing, setEditing] = useState<TestCase | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("cases");
  const [historyTest, setHistoryTest] = useState<TestCase | null>(null);
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [baselineState, setBaselineState] = useState<BaselineState | null>(null);
  const selectionVersion = useRef(0);
  const selectResult = (result: TestResult | null) => {
    selectionVersion.current += 1;
    setSelectedResult(result);
    setSelectedTestId(result?.test_id ?? null);
    setBaselineState(null);
  };
  const { data: history } = useQuery({
    queryKey: ["test-history", historyTest?.id],
    queryFn: () => api<{ results: TestResult[] }>("GET", `/api/tests/${historyTest!.id}/history?limit=50`),
    enabled: !!historyTest,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tests"] });
    qc.invalidateQueries({ queryKey: ["test-results"] });
  };

  const createMut = useMutation({
    mutationFn: () => api("POST", "/api/tests", { name, description, stack, kind, severity, assertions, enabled, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) }),
    onSuccess: () => { toast.success("Test case dibuat"); setShowForm(false); setName(""); setDescription(""); setStack(""); setTags(""); setAssertions([]); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Gagal membuat test"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api("DELETE", `/api/tests/${id}`),
    onSuccess: () => { invalidate(); toast.success("Test case dihapus"); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, val }: { id: string; val: boolean }) => api("PATCH", `/api/tests/${id}`, { enabled: val }),
    onSuccess: () => { invalidate(); },
  });

  const cloneMut = useMutation({
    mutationFn: (id: string) => api("POST", `/api/tests/${id}/clone`),
    onSuccess: () => { invalidate(); toast.success("Test case cloned"); },
    onError: (e: any) => toast.error(e?.message || "Failed to clone test"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<TestCase> }) => api("PATCH", `/api/tests/${id}`, patch),
    onSuccess: () => { invalidate(); setEditing(null); toast.success("Test case updated"); },
    onError: (e: any) => toast.error(e?.message || "Failed to update test"),
  });

  const batchMut = useMutation({
    mutationFn: (selectedStack: string) => api("POST", "/api/tests/batch-run", { stack: selectedStack }),
    onSuccess: (data: any) => { invalidate(); toast.success(`${data.count ?? 0} test(s) executed`); },
    onError: (e: any) => toast.error(e?.message || "Batch run failed"),
  });

  const baselineMut = useMutation({
    mutationFn: ({ testId, runId }: { testId: string; runId?: string }) => api<{ baseline: unknown }>("POST", `/api/tests/${testId}/baseline`, { run_id: runId }),
    onSuccess: () => {
      setBaselineState(null);
      toast.success("Baseline disimpan");
    },
    onError: (e: unknown) => {
      setBaselineState(null);
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan baseline");
    },
  });
  const compareBaseline = async (testId: string) => {
    setBaselineState(null);
    const requestVersion = selectionVersion.current;
    const selectedResultId = selectedResult?.id;
    try {
      const comparison = await api<BaselineCompare>("GET", `/api/tests/${testId}/baseline/compare`);
      if (selectedResultId && selectionVersion.current === requestVersion && selectedTestId === testId && selectedResult?.id === selectedResultId) {
        setBaselineState({ ...comparison, selected_result_id: selectedResultId });
      }
    } catch (e) {
      setBaselineState(null);
      toast.error(e instanceof Error ? e.message : "Baseline belum tersedia");
    }
  };

  const runMut = useMutation({
    mutationFn: (id: string) => api<{ result: TestResult }>("POST", `/api/tests/${id}/run`),
    onSuccess: (d) => {
      invalidate();
      const r = d.result;
      toast.success(r.passed ? `✅ ${r.name} PASS (${r.findings.length} finding)` : `⛔ ${r.name} FAIL (${r.findings.length} finding)`);
    },
    onError: (e: any) => toast.error(e?.message || "Gagal run test"),
  });

  const toggleAssertion = (id: string) =>
    setAssertions((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);

  const totalResults = results?.results ?? [];
  const failCount = totalResults.filter((r) => !r.passed).length;
  const passRate = totalResults.length
    ? Math.round((totalResults.filter((r) => r.passed).length / totalResults.length) * 100) : 0;

  const stackNames = useMemo(() => (stacks?.stacks ?? []).map((s) => s.name), [stacks]);
  const visibleCases = (data?.test_cases ?? []).filter((test) =>
    (!search || `${test.name} ${test.description ?? ""} ${test.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase())) &&
    (!tagFilter || test.tags.includes(tagFilter)) &&
    (!severityFilter || test.severity === severityFilter) &&
    (!kindFilter || test.kind === kindFilter) &&
    (!stackFilter || test.stack === stackFilter)
  );
  const allTags = [...new Set((data?.test_cases ?? []).flatMap((test) => test.tags))].sort();

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Cloud" }, { label: "Test Cases" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-semibold flex items-center gap-2">
            <Flask className="h-5 w-5" /> Test Cases
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Assertion library untuk validation IaC: plan, tfvars & state. Blocker fail akan menahan apply.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> {showForm ? "Close" : "New test"}
        </Button>
      </div>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {([['cases', 'Cases'], ['runs', 'Runs / History'], ['catalog', 'Catalog / Templates']] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)} className={`px-3 py-2 text-sm border-b-2 -mb-px ${activeTab === id ? "border-[var(--color-primary)] text-[var(--color-primary)] font-medium" : "border-transparent text-[var(--color-muted-foreground)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "runs" && totalResults.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="py-3"><div className="text-2xl font-mono">{totalResults.length}</div><div className="text-xs text-[var(--color-muted-foreground)]">Runs</div></CardContent></Card>
          <Card><CardContent className="py-3"><div className="text-2xl font-mono text-[var(--color-success)]">{passRate}%</div><div className="text-xs text-[var(--color-muted-foreground)]">Pass rate (50 terakhir)</div></CardContent></Card>
          <Card><CardContent className="py-3"><div className="text-2xl font-mono text-[var(--color-destructive)]">{failCount}</div><div className="text-xs text-[var(--color-muted-foreground)]">Failed</div></CardContent></Card>
        </div>
      )}

      {activeTab === "cases" && showForm && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">New test case</CardTitle></CardHeader>
          <CardContent className="pt-0 grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Name</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Security scan prod" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Description</div>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this test protect?" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Stack</div>
              <Select value={stack} onChange={setStack} placeholder="Pilih stack…"
                options={stackNames.map((s) => ({ value: s, label: s }))} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Kind</div>
              <Select value={kind} onChange={setKind}
                options={KINDS.map((k) => ({ value: k, label: k }))} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Severity</div>
              <Select value={severity} onChange={setSeverity}
                options={SEVERITIES.map((s) => ({ value: s, label: s }))} />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <CheckboxInput checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
            </label>
            <div className="md:col-span-3">
              <div className="text-xs text-[var(--color-muted-foreground)] mb-2">Tags (comma-separated)</div>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="security, compliance" />
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-[var(--color-muted-foreground)] mb-2">Assertions (library bawaan)</div>
              <div className="grid gap-1.5 md:grid-cols-2 max-h-56 overflow-y-auto rounded-md border border-[var(--color-border)] p-2">
                {(catalog?.assertions ?? []).map((a) => (
                  <label key={a.id} className="flex items-start gap-2 text-sm cursor-pointer rounded-md px-2 py-1 hover:bg-[var(--color-muted)]/50">
                    <CheckboxInput checked={assertions.includes(a.id)} onChange={() => toggleAssertion(a.id)} />
                    <span className="min-w-0">
                      <span className="font-medium text-xs">{a.name}</span>
                      <span className="block text-[11px] text-[var(--color-muted-foreground)]">{a.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-3">
              <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending || !name.trim() || !stack}>
                Create test
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "cases" && (data?.test_cases ?? []).length === 0 && (
        <div className="text-sm text-[var(--color-muted-foreground)]">
          {stackNames.length === 0 ? "Create a stack before defining project tests." : "Belum ada test case. Buat test dengan assertion bawaan."}
        </div>
      )}

      {activeTab === "cases" && (data?.test_cases ?? []).length > 0 && (
        <Card>
          <CardContent className="py-3 flex flex-wrap gap-2 items-center">
            <Input className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tests…" />
            <Select value={stackFilter} onChange={setStackFilter} placeholder="All stacks" options={stackNames.map((s) => ({ value: s, label: s }))} className="w-40" />
            <Select value={kindFilter} onChange={setKindFilter} placeholder="All kinds" options={KINDS.map((k) => ({ value: k, label: k }))} className="w-36" />
            <Select value={severityFilter} onChange={setSeverityFilter} placeholder="All severity" options={SEVERITIES.map((s) => ({ value: s, label: s }))} className="w-36" />
            <Select value={tagFilter} onChange={setTagFilter} placeholder="All tags" options={allTags.map((tag) => ({ value: tag, label: tag }))} className="w-36" />
            <Button size="sm" variant="outline" disabled={!stackFilter || batchMut.isPending} onClick={() => batchMut.mutate(stackFilter)}>
              <Play className="h-3.5 w-3.5" /> Run all
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === "cases" && <div className="grid gap-3 md:grid-cols-2">
        {visibleCases.map((t) => (
          <Card key={t.id}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Flask className="h-4 w-4" /> {t.name}
                <Badge variant={t.enabled ? "success" : "default"}>{t.enabled ? "enabled" : "disabled"}</Badge>
                <Badge variant={t.severity === "blocker" ? "destructive" : t.severity === "warning" ? "warning" : "default"}>{t.severity}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 text-sm">
              <div className="flex flex-wrap gap-2 text-xs text-[var(--color-muted-foreground)]">
                <span className="font-mono">{t.stack}</span> · <span>{t.kind}</span>
                {t.assertions.length > 0 && <span>· {t.assertions.length} assertion(s)</span>}
                {t.schedule && <span>· cron: {t.schedule}</span>}
              </div>
              {t.description && <p className="text-xs text-[var(--color-muted-foreground)]">{t.description}</p>}
              {t.assertions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.assertions.map((a) => (
                    <span key={a} className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-mono">{a}</span>
                  ))}
                </div>
              )}
              <div className="flex gap-1 pt-1">
                <Button size="sm" onClick={() => runMut.mutate(t.id)} disabled={runMut.isPending}>
                  <Play className="h-3.5 w-3.5" /> Run
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggleMut.mutate({ id: t.id, val: !t.enabled })}>
                  {t.enabled ? "Disable" : "Enable"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => cloneMut.mutate(t.id)} disabled={cloneMut.isPending}>Clone</Button>
                <Button size="sm" variant="outline" onClick={() => { setHistoryTest(t); setActiveTab("runs"); }}>History</Button>
                <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" onClick={() => deleteMut.mutate(t.id)}>
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>}

      {activeTab === "runs" && <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2"><Refresh className="h-4 w-4" /> Recent results</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1.5 text-xs">
          {totalResults.length === 0 && <div className="text-[var(--color-muted-foreground)]">Belum ada hasil run.</div>}
          {totalResults.slice(0, 12).map((r) => (
            <button type="button" key={r.id} onClick={() => selectResult(r)} className="w-full text-left flex items-center gap-2 border-b border-[var(--color-border)] last:border-0 pb-1.5 hover:bg-[var(--color-muted)]/40 rounded px-1">
              <Badge variant={r.status === "queued" ? "warning" : r.passed ? "success" : "destructive"}>{r.status === "queued" ? "QUEUED" : r.passed ? "PASS" : "FAIL"}</Badge>
              <span className="font-medium truncate">{r.name}</span>
              <span className="text-[var(--color-muted-foreground)] truncate">{r.stack}</span>
              <span className="ml-auto text-[var(--color-muted-foreground)] shrink-0">
                {new Date(r.ran_at * 1000).toLocaleString()}
              </span>
            </button>
          ))}
          {(totalResults[0]?.findings ?? []).length > 0 && (
            <div className="pt-1">
              <div className="text-[var(--color-muted-foreground)] mb-1">Latest findings:</div>
              {totalResults[0]?.findings?.map((f, i) => (
                <div key={i} className="flex gap-2 py-0.5">
                  <span className={f.severity === "blocker" ? "text-[var(--color-destructive)]" : f.severity === "warning" ? "text-[var(--color-warning)]" : "text-[var(--color-muted-foreground)]"}>{f.severity}</span>
                  <span>{f.name}</span>
                  <span className="text-[var(--color-muted-foreground)]">({f.source})</span>
                </div>
              ))}
            </div>
          )}
          {selectedResult && <div className="rounded-md border p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between"><strong>{selectedResult.name}</strong><Button size="sm" variant="ghost" onClick={() => selectResult(null)}>Close</Button></div>
            <div>Run ID: <code>{selectedResult.run_id ?? selectedResult.id}</code> · {selectedResult.mock_provider ? "mock provider" : "provider execution"} · timeout {selectedResult.timeout_seconds ?? 30}s</div>
            {selectedResult.retry_count != null && <div>Retries: {selectedResult.retry_count} · attempts: {selectedResult.attempts?.map((a) => `${a.attempt}:${a.status ?? (a.passed ? "passed" : "failed")}`).join(" → ")}</div>}
            <div className="space-y-1">{selectedResult.findings.map((f, index) => <div key={`${f.assertion}-${index}`} className="rounded border p-2"><strong>{f.assertion}</strong>: <pre className="whitespace-pre-wrap break-words inline font-sans">{formatFindingDetail(f.detail)}</pre>{f.tool_status != null && <span className="ml-2 text-[var(--color-muted-foreground)]">({typeof f.tool_status === "string" ? f.tool_status : formatFindingDetail(f.tool_status)})</span>}</div>)}</div>
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => baselineMut.mutate({ testId: selectedResult.test_id, runId: selectedResult.run_id })} disabled={baselineMut.isPending}>Save baseline</Button><Button size="sm" variant="outline" onClick={() => void compareBaseline(selectedResult.test_id)} disabled={!selectedTestId}>Compare latest result for this test</Button></div>
            {baselineState && baselineState.selected_result_id === selectedResult.id && <div className={baselineState.regressed ? "text-[var(--color-destructive)]" : "text-[var(--color-success)]"}>{baselineState.regressed ? "Regression detected" : baselineState.changed ? "Changed from baseline" : "Matches baseline"} <span className="text-[var(--color-muted-foreground)]">(latest result for this test: {baselineState.current_run_id ?? "unknown run"})</span></div>}
          </div>}
        </CardContent>
      </Card>}

      {activeTab === "catalog" && <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Assertion catalog</CardTitle></CardHeader>
        <CardContent className="pt-0 grid gap-2 md:grid-cols-2">
          {(catalog?.assertions ?? []).map((assertion) => (
            <div key={assertion.id} className="rounded-md border border-[var(--color-border)] p-3">
              <div className="font-medium text-sm">{assertion.name}</div>
              <div className="text-xs text-[var(--color-muted-foreground)] mt-1">{assertion.desc}</div>
              <Badge className="mt-2" variant={assertion.severity === "blocker" ? "destructive" : "default"}>{assertion.severity}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>}

      {historyTest && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setHistoryTest(null)}>
        <div className="w-full max-w-2xl rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between"><h2 className="font-semibold">Run history · {historyTest.name}</h2><Button variant="outline" size="sm" onClick={() => setHistoryTest(null)}>Close</Button></div>
          <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
            {(history?.results ?? []).length === 0 ? <p className="text-sm text-[var(--color-muted-foreground)]">No runs yet.</p> : (history?.results ?? []).map((result) => <div key={result.id} className="flex items-center gap-2 border-b border-[var(--color-border)] py-2 text-sm"><Badge variant={result.status === "queued" ? "warning" : result.passed ? "success" : "destructive"}>{result.status === "queued" ? "QUEUED" : result.passed ? "PASS" : "FAIL"}</Badge><span>{new Date(result.ran_at * 1000).toLocaleString()}</span><span className="text-[var(--color-muted-foreground)]">{result.findings.length} finding(s)</span></div>)}
          </div>
        </div>
      </div>}

      {editing && (
        <EditTestDialog
          test={editing}
          stacks={stackNames}
          onClose={() => setEditing(null)}
          onSave={(patch) => updateMut.mutate({ id: editing.id, patch })}
          saving={updateMut.isPending}
        />
      )}
    </div>
  );
}

function EditTestDialog({
  test,
  stacks,
  onClose,
  onSave,
  saving,
}: {
  test: TestCase;
  stacks: string[];
  onClose: () => void;
  onSave: (patch: Partial<TestCase>) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(test.name);
  const [description, setDescription] = useState(test.description ?? "");
  const [stack, setStack] = useState(test.stack);
  const [tags, setTags] = useState(test.tags.join(", "));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-base font-semibold">Edit test case</h2>
        <div className="mt-4 space-y-3">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" />
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
          <Select value={stack} onChange={setStack} options={stacks.map((item) => ({ value: item, label: item }))} />
          <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags, comma-separated" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !name.trim() || !stack} onClick={() => onSave({ name: name.trim(), description, stack, tags: tags.split(",").map((item) => item.trim()).filter(Boolean) })}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
