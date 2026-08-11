import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { api } from "@/lib/api";

export const Route = createFileRoute("/cloud/byoc")({ component: ByocPage });

type Provider = { id: string; label: string; regions: string[]; creds: { key: string; label: string; secret?: boolean; multiline?: boolean }[] };
type Account = { id: string; name: string; provider: string; regions: string[]; status: string; has_credentials: boolean; credential_keys: string[]; resource_count: number; last_check: number };
type Resource = { type: string; address: string; name: string; id: string; region: string; status: string };

function ByocPage() {
  const qc = useQueryClient();
  const { data: pvd } = useQuery({ queryKey: ["byoc-providers"], queryFn: () => api<{ providers: Provider[] }>("GET", "/api/byoc/providers") });
  const { data: acctData } = useQuery({ queryKey: ["byoc-accounts"], queryFn: () => api<{ accounts: Account[] }>("GET", "/api/byoc/accounts") });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("hetzner");
  const [regions, setRegions] = useState<string[]>([]);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [selectedAccount, setSelectedAccount] = useState("");
  const [inventory, setInventory] = useState<Resource[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importBlock, setImportBlock] = useState("");

  const pv = pvd?.providers ?? [];
  const pmeta = pv.find((p) => p.id === provider);
  const accounts = acctData?.accounts ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["byoc-accounts"] });
    qc.invalidateQueries({ queryKey: ["byoc-inventory"] });
  };

  const createMut = useMutation({
    mutationFn: () => api("POST", "/api/byoc/accounts", {
      name,
      provider,
      regions: regions.length ? regions : (pmeta?.regions?.slice(0, 1) ?? []),
      credentials: creds,
    }),
    onSuccess: () => { toast.success("Akun BYOC ditambahkan"); setShowForm(false); setName(""); setCreds({}); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Gagal tambah akun"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api("DELETE", `/api/byoc/accounts/${id}`),
    onSuccess: () => { invalidate(); setSelectedAccount(""); setInventory([]); setImportBlock(""); toast.success("Akun dihapus"); },
  });

  const validateMut = useMutation({
    mutationFn: (id: string) => api("POST", `/api/byoc/accounts/${id}/validate`),
    onSuccess: (d: any) => {
      invalidate();
      toast.success(d.ok ? "Kredensial valid ✅" : `Gagal: ${d.status} — ${(d.detail || "error").slice(0, 120)}`);
    },
    onError: (e: any) => toast.error(e?.message || "Validasi gagal"),
  });

  const loadInventory = async (id: string) => {
    setSelectedAccount(id);
    try {
      const d = await api<{ resources: Resource[]; count: number }>("GET", `/api/byoc/accounts/${id}/inventory`);
      setInventory(d.resources ?? []);
      setSelectedIds([]);
      setImportBlock("");
    } catch (e: any) {
      toast.error(e?.message || "Gagal ambil inventory");
    }
  };

  const genImportMut = useMutation({
    mutationFn: () => api<{ import_block: string }>("POST", `/api/byoc/accounts/${selectedAccount}/import`, { resource_ids: selectedIds }),
    onSuccess: (d) => { setImportBlock(d.import_block); toast.success(`Import block dibuat (${selectedIds.length} resource)`); },
    onError: (e: any) => toast.error(e?.message || "Gagal generate import"),
  });

  const toggleSel = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

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
            <div className="md:col-span-2">
              <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending || !name.trim()}>
                Connect account
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {accounts.length === 0 && (
        <div className="text-sm text-[var(--color-muted-foreground)]">
          Belum ada akun BYOC terhubung. Hubungkan akun cloud existing untuk discovery & import.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {accounts.map((a) => (
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
                <Button size="sm" variant="outline" onClick={() => validateMut.mutate(a.id)}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Validate
                </Button>
                <Button size="sm" variant="outline" onClick={() => loadInventory(a.id)}>
                  <ListCheck className="h-3.5 w-3.5" /> Inventory
                </Button>
                <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" onClick={() => delMut.mutate(a.id)}>
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedAccount && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListCheck className="h-4 w-4" /> Inventory & Import
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {inventory.length === 0 && (
              <div className="text-xs text-[var(--color-muted-foreground)]">
                Tidak ada resource ditemukan (atau kredensial tidak valid). Klik Validate untuk cek koneksi.
              </div>
            )}
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {inventory.map((r) => (
                <label key={`${r.type}:${r.id}`} className="flex items-start gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs cursor-pointer hover:bg-[var(--color-muted)]/50">
                  <input type="checkbox" checked={selectedIds.includes(String(r.id))} onChange={() => toggleSel(String(r.id))} />
                  <span className="min-w-0">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-[var(--color-muted-foreground)]">{r.type} · id={r.id}</span>
                    <span className="block text-[var(--color-muted-foreground)]">{r.address} · {r.region} · {r.status}</span>
                  </span>
                </label>
              ))}
            </div>
            {inventory.length > 0 && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => genImportMut.mutate()} disabled={selectedIds.length === 0 || genImportMut.isPending}>
                  <Code className="h-3.5 w-3.5" /> Generate import block ({selectedIds.length})
                </Button>
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