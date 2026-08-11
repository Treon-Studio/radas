import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
  id: string; name: string; stack: string; kind: string; assertions: string[];
  severity: string; enabled: boolean; tags: string[]; created_at: number;
};
type TestResult = {
  id: string; test_id: string; name: string; stack: string; kind: string;
  severity: string; passed: boolean; findings: { assertion: string; name: string; severity: string; source: string; detail: string }[];
  ran_at: number;
};

const KINDS = ["assertion", "tofu_validate", "tofu_test", "smoke"];
const SEVERITIES = ["blocker", "warning", "info"];

function TestsPage() {
  const qc = useQueryClient();
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tests"] });
    qc.invalidateQueries({ queryKey: ["test-results"] });
  };

  const createMut = useMutation({
    mutationFn: () => api("POST", "/api/tests", { name, stack, kind, severity, assertions, enabled }),
    onSuccess: () => { toast.success("Test case dibuat"); setShowForm(false); setName(""); setStack(""); setAssertions([]); invalidate(); },
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

      {totalResults.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="py-3"><div className="text-2xl font-mono">{totalResults.length}</div><div className="text-xs text-[var(--color-muted-foreground)]">Runs</div></CardContent></Card>
          <Card><CardContent className="py-3"><div className="text-2xl font-mono text-[var(--color-success)]">{passRate}%</div><div className="text-xs text-[var(--color-muted-foreground)]">Pass rate (50 terakhir)</div></CardContent></Card>
          <Card><CardContent className="py-3"><div className="text-2xl font-mono text-[var(--color-destructive)]">{failCount}</div><div className="text-xs text-[var(--color-muted-foreground)]">Failed</div></CardContent></Card>
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">New test case</CardTitle></CardHeader>
          <CardContent className="pt-0 grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Name</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Security scan prod" />
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

      {(data?.test_cases ?? []).length === 0 && (
        <div className="text-sm text-[var(--color-muted-foreground)]">
          Belum ada test case. Buat test dengan assertion bawaan (CIDR publik, secret di tfvars, dsb).
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {(data?.test_cases ?? []).map((t) => (
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
              </div>
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
                <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" onClick={() => deleteMut.mutate(t.id)}>
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2"><Refresh className="h-4 w-4" /> Recent results</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1.5 text-xs">
          {totalResults.length === 0 && <div className="text-[var(--color-muted-foreground)]">Belum ada hasil run.</div>}
          {totalResults.slice(0, 12).map((r) => (
            <div key={r.id} className="flex items-center gap-2 border-b border-[var(--color-border)] last:border-0 pb-1.5">
              <Badge variant={r.passed ? "success" : "destructive"}>{r.passed ? "PASS" : "FAIL"}</Badge>
              <span className="font-medium truncate">{r.name}</span>
              <span className="text-[var(--color-muted-foreground)] truncate">{r.stack}</span>
              <span className="ml-auto text-[var(--color-muted-foreground)] shrink-0">
                {new Date(r.ran_at * 1000).toLocaleString()}
              </span>
            </div>
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
        </CardContent>
      </Card>
    </div>
  );
}