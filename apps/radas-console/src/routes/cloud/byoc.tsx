import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  RiCloudLine as Cloud, RiAddLine as Plus, RiDeleteBinLine as Trash,
  RiVipCrownLine as Crown, RiListSettingsLine as ListCheck, RiCodeLine as Code,
  RiShieldCheckLine as ShieldCheck,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StateView } from "@/components/ui/StateView";
import { api } from "@/lib/api";

export const Route = createFileRoute("/cloud/byoc")({ component: ByocPage });

type Provider = { id: string; label: string; regions: string[]; creds: { key: string; label: string; secret?: boolean; multiline?: boolean }[] };
type Account = { id: string; name: string; provider: string; regions: string[]; status: string; has_credentials: boolean; credential_keys: string[]; resource_count: number; last_check: number };
type Resource = {
  type?: string | null;
  address?: string | null;
  name?: string | null;
  id?: string | number | null;
  region?: string | null;
  status?: string | null;
  managed?: boolean | null;
  managed_at?: number | null;
};
type InventoryPage = { resources?: Resource[] | null; count?: number | null; limit: number; offset: number; next_offset: number | null; has_more: boolean; managed_count?: number | null };
type CostSummary = { monthly: number; yearly: number; currency: string; resource_count: number };
type BudgetSummary = { configured: boolean; monthly: number; budget?: number; currency?: string; usage_pct?: number; alerted: boolean };
type ValidationResult = { ok?: boolean; status?: string | number; detail?: string | null };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function ByocPage() {
  const qc = useQueryClient();
  const pvd = useQuery({ queryKey: ["byoc-providers"], queryFn: () => api<{ providers: Provider[] }>("GET", "/api/byoc/providers") });
  const acctData = useQuery({ queryKey: ["byoc-accounts"], queryFn: () => api<{ accounts: Account[] }>("GET", "/api/byoc/accounts") });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("hetzner");
  const [regions, setRegions] = useState<string[]>([]);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [selectedAccount, setSelectedAccount] = useState("");
  const [inventory, setInventory] = useState<Resource[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importBlock, setImportBlock] = useState("");
  const [inventoryNextOffset, setInventoryNextOffset] = useState<number | null>(null);
  const [inventoryCount, setInventoryCount] = useState<number | null>(null);
  const [inventoryManagedCount, setInventoryManagedCount] = useState<number | null>(null);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [pendingInventoryRequests, setPendingInventoryRequests] = useState<Set<string>>(new Set());
  const activeInventoryRequestsRef = useRef<Set<string>>(new Set());
  const selectionRef = useRef({ id: "", generation: 0 });

  const pv = pvd.data?.providers ?? [];
  const [detectHint, setDetectHint] = useState("");
  const detect = async (next: Record<string, string>) => {
    try {
      const d = await api<{ provider?: string }>("POST", "/api/byoc/providers/detect", { credentials: next });
      if (d.provider) { setProvider(d.provider); setDetectHint(`Detected provider: ${d.provider}`); }
    } catch { setDetectHint(""); }
  };
  const pmeta = pv.find((p) => p.id === provider);
  const accounts = acctData.data?.accounts ?? [];

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["byoc-accounts"] });
    void qc.invalidateQueries({ queryKey: ["byoc-inventory"] });
  };

  const resetInventoryData = () => {
    setInventory([]);
    setSelectedIds([]);
    setImportBlock("");
    setInventoryNextOffset(null);
    setInventoryCount(null);
    setInventoryManagedCount(null);
    setCost(null);
    setBudget(null);
    setInventoryError(null);
  };

  const createMut = useMutation({
    mutationFn: () => api("POST", "/api/byoc/accounts", {
      name,
      provider,
      regions: regions.length ? regions : (pmeta?.regions?.slice(0, 1) ?? []),
      credentials: creds,
    }),
    onSuccess: () => { toast.success("Akun BYOC ditambahkan"); setShowForm(false); setName(""); setCreds({}); invalidate(); },
    onError: (error: unknown) => toast.error(errorMessage(error, "Gagal tambah akun")),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api("DELETE", `/api/byoc/accounts/${id}`),
    onSuccess: () => {
      selectionRef.current = { id: "", generation: selectionRef.current.generation + 1 };
      setSelectedAccount("");
      resetInventoryData();
      invalidate();
      toast.success("Akun dihapus");
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Gagal menghapus akun")),
  });

  const validateMut = useMutation({
    mutationFn: (id: string) => api<ValidationResult>("POST", `/api/byoc/accounts/${id}/validate`),
    onSuccess: (d) => {
      invalidate();
      toast.success(d.ok ? "Kredensial valid ✅" : `Gagal: ${d.status ?? "error"} — ${(d.detail ?? "error").slice(0, 120)}`);
    },
    onError: (error: unknown) => toast.error(errorMessage(error, "Validasi gagal")),
  });

  const hasPendingInventoryRequest = (id: string) =>
    Array.from(pendingInventoryRequests).some((key) => key.startsWith(`${id}:`));

  const loadInventory = async (id: string, offset = 0) => {
    if (offset > 0 && selectionRef.current.id !== id) return;

    const requestKey = `${id}:${offset}`;
    if (activeInventoryRequestsRef.current.has(requestKey) || hasPendingInventoryRequest(id)) return;

    let generation = selectionRef.current.generation;
    if (offset === 0) {
      generation += 1;
      selectionRef.current = { id, generation };
      setSelectedAccount(id);
      resetInventoryData();
    }

    activeInventoryRequestsRef.current.add(requestKey);
    setPendingInventoryRequests((current) => new Set(current).add(requestKey));
    if (offset > 0) setInventoryError(null);

    try {
      const [d, c, b] = await Promise.all([
        api<InventoryPage>("GET", `/api/byoc/accounts/${id}/inventory?limit=50&offset=${offset}`),
        api<CostSummary>("GET", `/api/byoc/accounts/${id}/cost`),
        api<BudgetSummary>("GET", `/api/byoc/accounts/${id}/budget/check`),
      ]);
      if (selectionRef.current.id !== id || selectionRef.current.generation !== generation) return;

      const resources = d.resources ?? [];
      setInventory((prev) => offset ? [...prev, ...resources] : resources);
      setInventoryNextOffset(d.next_offset);
      setInventoryCount(d.count ?? 0);
      setInventoryManagedCount(d.managed_count ?? 0);
      setCost(c);
      setBudget(b);
    } catch (error: unknown) {
      if (selectionRef.current.id === id && selectionRef.current.generation === generation) {
        setInventoryError(errorMessage(error, "Gagal ambil inventory"));
      }
    } finally {
      activeInventoryRequestsRef.current.delete(requestKey);
      setPendingInventoryRequests((current) => {
        const next = new Set(current);
        next.delete(requestKey);
        return next;
      });
    }
  };

  const genImportMut = useMutation({
    mutationFn: () => api<{ import_block: string }>("POST", `/api/byoc/accounts/${selectedAccount}/import`, { resource_ids: selectedIds }),
    onSuccess: (d) => { setImportBlock(d.import_block); toast.success(`Import block dibuat (${selectedIds.length} resource)`); },
    onError: (error: unknown) => toast.error(errorMessage(error, "Gagal generate import")),
  });

  const toggleSel = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const inventoryPending = selectedAccount ? hasPendingInventoryRequest(selectedAccount) : false;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Cloud" }, { label: "BYOC" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-semibold flex items-center gap-2">
            <Crown className="h-5 w-5" /> BYOC — Bring Your Own Cloud
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Hubungkan akun cloud existing, validasi kredensial, temukan resource, dan impor ke stack Radas.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> {showForm ? "Close" : "Connect account"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Connect cloud account</CardTitle></CardHeader>
          <CardContent className="pt-0 grid gap-3 md:grid-cols-2">
            {pvd.isPending && <div className="md:col-span-2 text-xs text-[var(--color-muted-foreground)]">Memuat daftar provider…</div>}
            {pvd.isError && <div role="alert" className="md:col-span-2 text-xs text-[var(--color-destructive)]">Gagal memuat provider: {errorMessage(pvd.error, "coba lagi")}</div>}
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Name</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="prod-hetzner" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Provider</div>
              <Select value={provider} onChange={(v) => { setProvider(v); setRegions([]); setCreds({}); }}
                options={pv.map((p) => ({ value: p.id, label: p.label }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <div className="text-xs text-[var(--color-muted-foreground)]">Regions</div>
              <div className="flex flex-wrap gap-1.5">
                {(pmeta?.regions ?? []).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRegions((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r])}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${regions.includes(r) ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/40" : "hover:bg-[var(--color-muted)]/50"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {(pmeta?.creds ?? []).map((c) => (
              <div key={c.key} className="space-y-1 md:col-span-2">
                <div className="text-xs text-[var(--color-muted-foreground)]">{c.label} {c.secret && "(secret — dienkripsi)"}</div>
                {c.multiline ? (
                  <Textarea className="h-24 font-mono text-xs" value={creds[c.key] ?? ""}
                    onChange={(e) => setCreds({ ...creds, [c.key]: e.target.value })}
                    placeholder={`${c.key} JSON`} />
                ) : (
                  <Input type={c.secret ? "password" : "text"} value={creds[c.key] ?? ""}
                    onChange={(e) => setCreds({ ...creds, [c.key]: e.target.value })} placeholder={c.key} />
                )}
              </div>
            ))}
            {detectHint && <div className="md:col-span-2 text-xs text-[var(--color-primary)]">{detectHint}</div>}
            <div className="md:col-span-2">
              <Button size="sm" onClick={() => { void detect(creds); createMut.mutate(); }} disabled={createMut.isPending || pvd.isPending || pvd.isError || !name.trim()}>
                Connect account
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {acctData.isPending && <StateView state="loading" title="Memuat akun BYOC… / Loading BYOC accounts…" />}
      {acctData.isError && (
        <StateView
          state="error"
          title="Akun BYOC gagal dimuat / Could not load BYOC accounts"
          message={errorMessage(acctData.error, "Coba lagi / Please try again")}
          onRetry={() => void acctData.refetch()}
        />
      )}
      {!acctData.isPending && !acctData.isError && accounts.length === 0 && (
        <StateView
          state="empty"
          title="Belum ada akun BYOC / No BYOC accounts yet"
          message="Hubungkan akun cloud existing untuk discovery & import. / Connect an existing cloud account for discovery and import."
        />
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {accounts.map((a) => {
          const accountInventoryPending = hasPendingInventoryRequest(a.id);
          return (
            <Card key={a.id} className={selectedAccount === a.id ? "ring-1 ring-[var(--color-primary)]/40" : ""}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cloud className="h-4 w-4" /> {a.name}
                  <Badge variant={a.status === "verified" ? "success" : a.status === "error" ? "destructive" : "default"}>{a.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2 text-sm">
                <div className="text-xs text-[var(--color-muted-foreground)]">{a.provider} · {a.regions.join(", ")} · {a.resource_count} resources</div>
                <div className="flex gap-1 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => validateMut.mutate(a.id)} disabled={validateMut.isPending}>
                    <ShieldCheck className="h-3.5 w-3.5" /> Validate
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void loadInventory(a.id)} disabled={accountInventoryPending}>
                    <ListCheck className="h-3.5 w-3.5" /> {accountInventoryPending ? "Loading…" : "Inventory"}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" onClick={() => delMut.mutate(a.id)} disabled={delMut.isPending}>
                    <Trash className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedAccount && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListCheck className="h-4 w-4" /> Inventory & Import
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {(cost || budget || inventoryCount !== null) && (
              <div className="grid gap-2 sm:grid-cols-3">
                {cost && <div className="rounded border px-3 py-2 text-xs"><div className="text-[var(--color-muted-foreground)]">Estimated monthly cost</div><strong>{cost.currency} {cost.monthly.toFixed(2)}</strong><div>{cost.resource_count} managed resource(s)</div></div>}
                {budget?.configured && <div className={`rounded border px-3 py-2 text-xs ${budget.alerted ? "border-[var(--color-destructive)]" : ""}`}><div className="text-[var(--color-muted-foreground)]">Budget usage</div><strong>{budget.usage_pct?.toFixed(1)}%</strong><div>{budget.currency} {budget.budget?.toFixed(2)}</div></div>}
                {inventoryCount !== null && <div className="rounded border px-3 py-2 text-xs"><div className="text-[var(--color-muted-foreground)]">Inventory</div><strong>{inventoryCount}</strong><div>{inventoryManagedCount ?? 0} managed</div></div>}
              </div>
            )}
            {inventoryPending && <StateView state="loading" title="Memuat inventory, cost, dan budget… / Loading inventory, cost, and budget…" />}
            {inventoryError && (
              <StateView
                state="error"
                title="Inventory gagal dimuat / Could not load inventory"
                message={inventoryError}
                onRetry={() => void loadInventory(selectedAccount)}
              />
            )}
            {!inventoryPending && !inventoryError && inventoryCount !== null && inventory.length === 0 && (
              <StateView
                state="empty"
                title="Tidak ada resource / No resources found"
                message="Kredensial mungkin belum valid. Klik Validate untuk cek koneksi. / Credentials may be invalid; click Validate to check the connection."
              />
            )}
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {inventory.map((r) => {
                const resourceId = r.id == null ? null : String(r.id);
                const resourceKey = `${r.type ?? "resource"}:${resourceId ?? r.address ?? r.name ?? "unknown"}`;
                return (
                  <label key={resourceKey} className="flex items-start gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs cursor-pointer hover:bg-[var(--color-muted)]/50">
                    <input type="checkbox" checked={resourceId != null && selectedIds.includes(resourceId)} disabled={resourceId == null} onChange={() => { if (resourceId != null) toggleSel(resourceId); }} />
                    <span className="min-w-0">
                      <span className="font-medium">{r.name ?? "Unnamed resource"}</span>
                      <span className="block text-[var(--color-muted-foreground)]">{r.type ?? "unknown"} · id={r.id ?? "—"}</span>
                      <span className="block text-[var(--color-muted-foreground)]">{r.address ?? "—"} · {r.region ?? "—"} · {r.status ?? "unknown"} {r.managed ? "· managed" : "· unmanaged"}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {(inventory.length > 0 || inventoryPending) && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => genImportMut.mutate()} disabled={selectedIds.length === 0 || genImportMut.isPending || inventoryPending}>
                  <Code className="h-3.5 w-3.5" /> Generate import block ({selectedIds.length})
                </Button>
                {inventoryNextOffset !== null && <Button size="sm" variant="outline" onClick={() => void loadInventory(selectedAccount, inventoryNextOffset)} disabled={inventoryPending}>
                  {inventoryPending ? "Loading…" : "Load more resources"}
                </Button>}
              </div>
            )}
            {importBlock && (
              <pre className="rounded-md border border-[var(--color-border)] p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">{importBlock}</pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
