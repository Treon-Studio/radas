import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RiFlagLine as Flag, RiAddLine as Plus, RiDeleteBinLine as Trash,
  RiShieldFlashLine as Shield, RiRefreshLine as Refresh, RiCloseLine,
  RiArrowRightSLine as ChevronRight,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxInput } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Drawer as VaulDrawer } from "vaul";
import { Drawer } from "@/components/ui/drawer";
import { Tabs } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";

export const Route = createFileRoute("/cloud/flags")({ component: FlagsPage });

type FlagType = {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  environments: Record<string, boolean>;
  rollout_percent: number;
  users_whitelist: string[];
  users_blacklist: string[];
  tags: string[];
  namespace?: string;
  domain?: string;
  type?: string;
  scope_type?: string;
  scope_id?: string;
  scope_name?: string;
  project_name?: string;
  organization_name?: string;
  parent_key?: string;
  prerequisites?: string[];
  reason?: string;
  ttl_seconds?: number;
  scheduled_expire_at?: number;
  kill_switch: boolean;
  created_at: number;
  updated_at: number;
};

const ENVS = ["dev", "staging", "prod", "preview"];
type PanelTab = "details" | "audit" | "preview";

const OP_VARIANT: Record<string, "success" | "destructive" | "default" | "warning"> = {
  create: "success",
  delete: "destructive",
  update: "default",
  rollback: "warning",
};

const OP_COLOR: Record<string, string> = {
  create: "bg-[var(--color-success)]",
  delete: "bg-[var(--color-destructive)]",
  update: "bg-[var(--color-primary)]",
  rollback: "bg-[var(--color-warning)]",
};

function auditOp(entry: any): string {
  return entry?.operation || entry?.changes?.operation || "change";
}

function auditOpLabel(operation: string): string {
  return ({ create: "Dibuat", update: "Diubah", delete: "Dihapus", rollback: "Dipulihkan" } as Record<string, string>)[operation] || "Perubahan";
}

function auditActor(entry: any): string {
  const actor = entry?.actor_name || entry?.actor || entry?.changes?.actor;
  return !actor || String(actor).toLowerCase() === "system" ? "Sistem" : String(actor);
}

function statusLabel(flag: Pick<FlagType, "enabled" | "kill_switch">): string {
  return flag.kill_switch ? "Dihentikan paksa" : flag.enabled ? "Aktif" : "Nonaktif";
}

const EVALUATION_REASONS: Record<string, string> = {
  kill_switch: "Dihentikan paksa",
  globally_disabled: "Dinonaktifkan secara global",
  parent_disabled: "Flag induk nonaktif",
  missing_prerequisite: "Prasyarat belum terpenuhi",
  blacklisted: "User masuk daftar blokir",
  zero_rollout: "Rollout 0%",
  full_rollout: "Rollout penuh",
  rollout: "Rollout bertahap",
  whitelisted: "User masuk daftar izin",
  unknown_flag: "Flag tidak ditemukan",
};

function localizedMutationError(error: unknown, fallback: string): string {
  const message = typeof error === "string"
    ? error
    : typeof (error as { message?: unknown } | null)?.message === "string"
      ? (error as { message: string }).message
      : "";
  if (!message) return fallback;

  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) return "Flag tidak ditemukan";
  if (normalized.includes("no previous version")) return "Tidak ada versi sebelumnya";
  if (normalized.includes("key required")) return "Key wajib diisi";
  if (normalized.includes("already exists")) return "Flag sudah ada";
  if (normalized.includes("invalid")) return "Data flag tidak valid";
  if (normalized.includes("unauthorized")) return "Anda tidak berwenang melakukan tindakan ini";
  if (normalized.includes("forbidden")) return "Akses ditolak";
  return message;
}

function evaluationReasonLabel(reason: unknown): string {
  const normalized = String(reason ?? "");
  if (EVALUATION_REASONS[normalized]) return EVALUATION_REASONS[normalized];
  if (normalized.startsWith("disabled_in_")) return `Dinonaktifkan di environment ${normalized.slice("disabled_in_".length)}`;
  return "Status evaluasi tersedia";
}

function evaluationReasonExplanation(reason: unknown): string | null {
  return String(reason ?? "") === "kill_switch"
    ? "Kill switch mengesampingkan pengaturan Aktif, environment, dan rollout lainnya."
    : null;
}

function evaluationStatusLabel(result: { enabled?: boolean; reason?: unknown }): string {
  return result.reason === "kill_switch" ? "Dihentikan paksa" : result.enabled ? "Aktif" : "Nonaktif";
}

function scopeLabel(scopeType?: string, scopeId?: string, scopeName?: string, projectName?: string, organizationName?: string): string {
  const scopeParts = String(scopeType || "global").split(":");
  const rawType = scopeParts[0] === "flags" ? scopeParts[1] : scopeParts[0];
  const parsedId = scopeParts[0] === "flags" ? scopeParts[2] : undefined;
  const normalized = (rawType || "global").toLowerCase().replace(/_id$/, "");
  scopeId = scopeId || parsedId;
  const label = normalized === "project" ? "Project" : normalized === "organization" || normalized === "org" ? "Organization" : "Global";
  const friendlyName = scopeName || (normalized === "project" ? projectName : normalized === "organization" || normalized === "org" ? organizationName : undefined);
  if (friendlyName) return `${label} · ${friendlyName}`;
  if (label === "Global" && (!scopeId || scopeId === "default")) return label;
  return scopeId ? `${label} · ${shortId(scopeId)}` : label;
}

function readableScopeValue(value: unknown): string {
  const raw = String(value ?? "—");
  const parts = raw.split(":");
  if (parts[0] === "flags") return scopeLabel(parts[1], parts[2]);
  if (parts.length >= 2) return scopeLabel(parts[0], parts[1]);
  return readableSource(raw);
}

function readableSource(value: unknown): string {
  const source = String(value ?? "—");
  return ({ global: "Global", project: "Project", organization: "Organization", org: "Organization", environment: "Environment" } as Record<string, string>)[source.toLowerCase()] || source;
}

function auditTime(entry: any): string {
  const at = entry?.at ?? entry?.changes?.at;
  if (!at) return "—";
  return new Date(Number(at) * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function auditDay(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Hari ini";
  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function shortId(id: unknown): string {
  return typeof id === "string" && id.length > 8 ? id.slice(0, 8) : String(id ?? "");
}

function formatVal(v: unknown, field?: string): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "boolean") return field === "kill_switch" && v ? "Dihentikan paksa" : v ? "Aktif" : "Nonaktif";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function DiffChips({ changes }: { changes: Record<string, unknown> }) {
  const items: { label: string; before: unknown; after: unknown }[] = [];
  for (const [field, val] of Object.entries(changes ?? {})) {
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const rec = val as Record<string, unknown>;
    if (field === "environments") {
      for (const [env, ev] of Object.entries(rec)) {
        const e = (ev ?? {}) as Record<string, unknown>;
        items.push({ label: `env.${env}`, before: e.before, after: e.after });
      }
    } else if ("before" in rec || "after" in rec) {
      items.push({ label: field, before: rec.before, after: rec.after });
    }
  }
  if (!items.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {items.map((it) => (
        <span key={it.label} className="rounded border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-1.5 py-0.5 font-mono text-[11px]">
          {it.label}: <span className="text-[var(--color-muted-foreground)] line-through decoration-[var(--color-destructive)]/60">{formatVal(it.before, it.label)}</span>
          {" → "}
          <span className="text-[var(--color-foreground)]">{formatVal(it.after, it.label)}</span>
        </span>
      ))}
    </div>
  );
}

function AuditTimeline({ entries, emptyCopy }: { entries: any[]; emptyCopy: string }) {
  if (!entries.length) return <p className="text-sm text-[var(--color-muted-foreground)] pt-3">{emptyCopy}</p>;
  const groups: { label: string; items: any[] }[] = [];
  for (const e of entries) {
    const label = auditDay(Number(e?.at ?? e?.changes?.at ?? 0));
    const last = groups[groups.length - 1];
    if (!last || last.label !== label) groups.push({ label, items: [e] });
    else last.items.push(e);
  }
  return (
    <div className="pt-3 space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)] mb-2">{g.label}</div>
          <ol className="relative ml-2 border-l border-[var(--color-border)] space-y-3">
            {g.items.map((entry, idx) => (
              <li key={`${entry.at}-${idx}`} className="relative pl-4">
                <span className={`absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ${OP_COLOR[auditOp(entry)] ?? "bg-[var(--color-muted-foreground)]"}`} />
                <div className="rounded-md border border-[var(--color-border)] p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={OP_VARIANT[auditOp(entry)] ?? "default"}>{auditOpLabel(auditOp(entry))}</Badge>
                    <code className="font-mono text-[var(--color-muted-foreground)]">{entry.key}</code>
                    <span className="font-medium">{auditActor(entry)}</span>
                    {entry.scope_type && <Badge>{scopeLabel(entry.scope_type, entry.scope_id, entry.scope_name, entry.project_name, entry.organization_name)}</Badge>}
                    <span className="ml-auto text-[var(--color-muted-foreground)]">{auditTime(entry)}</span>
                  </div>
                  <DiffChips changes={entry.changes} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function FlagsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["flags"], queryFn: () => api<{ flags: FlagType[] }>("GET", "/api/flags") });
  const [showForm, setShowForm] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [kill, setKill] = useState(false);
  const [rollout, setRollout] = useState(100);
  const [tags, setTags] = useState("");
  const [whitelist, setWhitelist] = useState("");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [envFilter, setEnvFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [selected, setSelected] = useState<FlagType | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("details");
  const [previewEnv, setPreviewEnv] = useState("prod");
  const [previewUser, setPreviewUser] = useState("");
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [rollbackKey, setRollbackKey] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["flags"] });

  const createMut = useMutation({
    mutationFn: () => api("POST", "/api/flags", {
      key, name, description: desc, enabled, kill_switch: kill, rollout_percent: rollout,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      users_whitelist: whitelist.split(",").map((t) => t.trim()).filter(Boolean),
    }),
    onSuccess: () => { toast.success(`Flag ${key} dibuat`); setShowForm(false); setKey(""); setName(""); setDesc(""); setTags(""); setWhitelist(""); setRollout(100); setEnabled(true); setKill(false); invalidate(); },
    onError: (e: any) => toast.error(localizedMutationError(e, "Gagal membuat flag")),
  });

  const toggleMut = useMutation({
    mutationFn: ({ k, patch }: { k: string; patch: Partial<FlagType> }) => api<{ success: boolean; flag: FlagType }>("PATCH", `/api/flags/${encodeURIComponent(k)}`, patch),
    onMutate: async ({ k, patch }) => {
      await qc.cancelQueries({ queryKey: ["flags"] });
      const prev = qc.getQueryData<{ flags: FlagType[] }>(["flags"]);
      const previousSelected = selected?.key === k ? selected : null;
      // Optimistically apply the change to the list cache and the open drawer
      // so the UI updates instantly; roll back if the request fails.
      qc.setQueryData<{ flags: FlagType[] }>(["flags"], (old) => old
        ? { flags: old.flags.map((f) => (f.key === k ? { ...f, ...patch } : f)) }
        : old);
      setSelected((prevSel) => (prevSel && prevSel.key === k ? { ...prevSel, ...patch } : prevSel));
      return { prev, previousSelected };
    },
    onSuccess: () => toast.success("Flag diperbarui"),
    onError: (e: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData<{ flags: FlagType[] }>(["flags"], ctx.prev);
      if (ctx?.previousSelected) setSelected(ctx.previousSelected);
      toast.error(localizedMutationError(e, "Gagal memperbarui flag"));
    },
    onSettled: () => invalidate(),
  });

  const deleteMut = useMutation({
    mutationFn: (k: string) => api("DELETE", `/api/flags/${encodeURIComponent(k)}`),
    onMutate: async (k) => {
      await qc.cancelQueries({ queryKey: ["flags"] });
      const prev = qc.getQueryData<{ flags: FlagType[] }>(["flags"]);
      qc.setQueryData<{ flags: FlagType[] }>(["flags"], (old) => old
        ? { flags: old.flags.filter((f) => f.key !== k) }
        : old);
      return { prev };
    },
    onSuccess: () => { setDeleteKey(null); if (selected?.key === deleteKey) setSelected(null); toast.success("Flag dihapus"); },
    onError: (e: any, _k, ctx) => {
      if (ctx?.prev) qc.setQueryData<{ flags: FlagType[] }>(["flags"], ctx.prev);
      toast.error(localizedMutationError(e, "Gagal menghapus flag"));
    },
    onSettled: () => invalidate(),
  });

  const rollbackMut = useMutation({
    mutationFn: (k: string) => api("POST", `/api/flags/${encodeURIComponent(k)}/rollback`),
    onSuccess: () => { invalidate(); setRollbackKey(null); setSelected(null); toast.success("Flag dipulihkan"); },
    onError: (e: any) => toast.error(localizedMutationError(e, "Gagal memulihkan flag")),
  });

  const previewMut = useMutation({
    mutationFn: (input: { key: string; env: string; user: string }) => api("POST", "/api/flags/evaluate", input),
    onSuccess: (result) => setPreviewResult(result),
    onError: (e: any) => toast.error(localizedMutationError(e, "Gagal mengevaluasi flag")),
  });

  const flags = data?.flags ?? [];
  const visibleFlags = flags.filter((flag) =>
    (!search || `${flag.key} ${flag.name} ${flag.description}`.toLowerCase().includes(search.toLowerCase())) &&
    (!tagFilter || flag.tags.includes(tagFilter)) &&
    (!envFilter || flag.environments?.[envFilter] === true) &&
    (!statusFilter || (statusFilter === "on" ? flag.enabled && !flag.kill_switch : statusFilter === "killed" ? flag.kill_switch : !flag.enabled && !flag.kill_switch))
  );
  const namespaces = [...new Set(visibleFlags.map((flag) => flag.namespace || "default"))];
  const auditQuery = useQuery({ queryKey: ["flags-audit"], queryFn: () => api<{ audit: any[] }>("GET", "/api/flags/audit?limit=100"), enabled: auditOpen });
  const flagAuditQuery = useQuery({
    queryKey: ["flag-audit", selected?.key],
    queryFn: () => api<{ audit: any[] }>("GET", `/api/flags/audit?limit=500&flag_key=${encodeURIComponent(selected!.key)}`),
    enabled: !!selected && panelTab === "audit",
  });

  const openFlag = (flag: FlagType) => {
    setSelected(flag);
    setPanelTab("details");
    setPreviewEnv("prod");
    setPreviewUser("");
    setPreviewResult(null);
  };

  const selectedAudit = flagAuditQuery.data?.audit ?? [];

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Cloud" }, { label: "Feature Flags" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-semibold flex items-center gap-2">
            <Flag className="h-5 w-5" /> Feature Flags
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Atur peluncuran bertahap per environment dan hentikan flag segera saat terjadi kondisi darurat.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAuditOpen((v) => !v)}>Riwayat audit</Button>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" /> {showForm ? "Tutup" : "Buat flag"}
          </Button>
        </div>
      </div>

      {showForm && (
        <VaulDrawer.Root open={showForm} onOpenChange={setShowForm} direction="right">
          <VaulDrawer.Portal>
            <VaulDrawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
            <VaulDrawer.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col bg-[var(--color-card)] border-l border-[var(--color-border)] shadow-[var(--shadow-popover)]">
              <VaulDrawer.Title className="sr-only">Buat feature flag</VaulDrawer.Title>
              <VaulDrawer.Description className="sr-only">Buat feature flag baru untuk mengatur peluncuran bertahap atau menghentikannya saat darurat.</VaulDrawer.Description>
              <header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
                <span className="text-sm font-semibold">Buat feature flag</span>
                <button type="button" onClick={() => setShowForm(false)} aria-label="Tutup" className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-[var(--color-muted)]">
                  <RiCloseLine className="h-4 w-4" />
                </button>
              </header>
              <div className="flex-1 overflow-y-auto px-5 py-4 grid gap-3">
              <div className="space-y-1">
              <label htmlFor="flag-key" className="text-xs text-[var(--color-muted-foreground)]">Key (contoh: block_apply)</label>
              <Input id="flag-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="block_apply" />
            </div>
            <div className="space-y-1">
              <label htmlFor="flag-name" className="text-xs text-[var(--color-muted-foreground)]">Nama</label>
              <Input id="flag-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Blokir semua apply" />
            </div>
            <div className="space-y-1">
              <label htmlFor="flag-description" className="text-xs text-[var(--color-muted-foreground)]">Deskripsi</label>
              <Textarea id="flag-description" value={desc} onChange={(e) => setDesc(e.target.value)} className="h-16" placeholder="Hentikan semua operasi apply saat darurat" />
            </div>
            <div className="space-y-1">
              <label htmlFor="flag-rollout" className="text-xs text-[var(--color-muted-foreground)]">Persentase rollout</label>
              <p className="text-[11px] text-[var(--color-muted-foreground)]">Tentukan persentase pengguna yang menerima flag ini secara bertahap.</p>
              <Input id="flag-rollout" type="number" min={0} max={100} value={rollout} onChange={(e) => setRollout(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <label htmlFor="flag-tags" className="text-xs text-[var(--color-muted-foreground)]">Tag (pisahkan dengan koma)</label>
              <Input id="flag-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="safety, gate" />
            </div>
            <div className="space-y-1">
              <label htmlFor="flag-whitelist" className="text-xs text-[var(--color-muted-foreground)]">User yang selalu diizinkan</label>
              <p className="text-[11px] text-[var(--color-muted-foreground)]">Daftar user ini tetap menerima flag meski rollout tidak mencakup mereka.</p>
              <Input id="flag-whitelist" value={whitelist} onChange={(e) => setWhitelist(e.target.value)} placeholder="admin, devops" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <CheckboxInput checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Aktif
            </label>
            <label className="flex items-center gap-2 text-sm">
              <CheckboxInput checked={kill} onChange={(e) => setKill(e.target.checked)} /> Hentikan paksa (kill switch)
            </label>
              </div>
              <footer className="border-t border-[var(--color-border)] px-5 py-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Batal</Button>
                <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending || key.trim().length < 2}>
                  Buat flag
                </Button>
              </footer>
            </VaulDrawer.Content>
          </VaulDrawer.Portal>
        </VaulDrawer.Root>
      )}

      {isLoading && <div className="text-sm text-[var(--color-muted-foreground)]">Memuat feature flag…</div>}
      {isError && <div className="rounded-md border border-[var(--color-destructive)]/40 p-3 text-sm text-[var(--color-destructive)]">Feature flag tidak dapat dimuat. Periksa akses API lalu coba lagi.</div>}
      {auditOpen && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Riwayat perubahan</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {auditQuery.isLoading && <p className="pt-3 text-sm text-[var(--color-muted-foreground)]">Memuat riwayat perubahan…</p>}
            {auditQuery.isError && <p className="pt-3 text-sm text-[var(--color-destructive)]">Riwayat perubahan tidak dapat dimuat. Coba lagi.</p>}
            {!auditQuery.isLoading && !auditQuery.isError && <AuditTimeline entries={auditQuery.data?.audit ?? []} emptyCopy="Belum ada riwayat perubahan." />}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-2">
          <label htmlFor="flag-search" className="sr-only">Cari feature flag</label>
          <Input id="flag-search" className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari berdasarkan key, nama, atau deskripsi…" />
          <label htmlFor="flag-tag-filter" className="sr-only">Filter berdasarkan tag</label>
          <select id="flag-tag-filter" className="rounded-md border bg-transparent px-2 text-sm" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="">Semua tag</option>
            {[...new Set(flags.flatMap((flag) => flag.tags))].map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          <label htmlFor="flag-environment-filter" className="sr-only">Filter berdasarkan environment</label>
          <select id="flag-environment-filter" className="rounded-md border bg-transparent px-2 text-sm" value={envFilter} onChange={(e) => setEnvFilter(e.target.value)}>
            <option value="">Semua environment</option>
            {ENVS.map((env) => <option key={env} value={env}>{env}</option>)}
          </select>
          <label htmlFor="flag-status-filter" className="sr-only">Filter berdasarkan status</label>
          <select id="flag-status-filter" className="rounded-md border bg-transparent px-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Semua status</option><option value="on">Aktif</option><option value="off">Nonaktif</option><option value="killed">Dihentikan paksa</option>
          </select>
          <span className="text-xs text-[var(--color-muted-foreground)]">Menampilkan {visibleFlags.length} dari {flags.length} flag</span>
          {(search || tagFilter || envFilter || statusFilter) && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setTagFilter(""); setEnvFilter(""); setStatusFilter(""); }}>Reset filter</Button>}
        </CardContent>
      </Card>
      {flags.length > 0 && visibleFlags.length === 0 && (
        <div className="rounded-md border border-[var(--color-border)] p-4 text-sm text-[var(--color-muted-foreground)]">
          Tidak ada feature flag yang cocok dengan filter saat ini.
        </div>
      )}
      {flags.length === 0 && !isLoading && !isError && (
        <div className="text-sm text-[var(--color-muted-foreground)]">
          Belum ada feature flag. Buat flag pertama, misalnya <code className="font-mono">block_apply</code> untuk menghentikan operasi apply saat darurat.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {namespaces.map((namespace) => (
          <div key={namespace} className="contents">
            <div className="md:col-span-2 text-xs font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">{namespace}</div>
            {visibleFlags.filter((flag) => (flag.namespace || "default") === namespace).map((f) => (
          <Card key={f.id} className="transition-colors hover:border-[var(--color-primary)]/50">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <button type="button" className="inline-flex min-w-0 items-center gap-2 text-left" onClick={() => openFlag(f)} aria-label={`Lihat konfigurasi ${f.key}`}>
                    <Flag className="h-4 w-4" /> <code className="font-mono">{f.key}</code>
                    <Badge variant={statusLabel(f) === "Aktif" ? "success" : "destructive"}>{statusLabel(f)}</Badge>
                    {f.rollout_percent < 100 && <Badge variant="warning">{f.rollout_percent}%</Badge>}
                  </button>
                  <span className="ml-auto" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={f.enabled}
                      disabled={f.kill_switch}
                      title={f.kill_switch ? "Kill switch aktif dan mengesampingkan status ini. Matikan kill switch di konfigurasi flag." : undefined}
                      aria-label={`Ubah status ${f.key}`}
                      onChange={(v) => toggleMut.mutate({ k: f.key, patch: { enabled: v } })}
                    />
                  </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 text-sm">
              <div className="text-[var(--color-muted-foreground)]">{f.description || "—"}</div>
              <div className="flex flex-wrap items-center gap-1 text-[11px]"><Badge>{f.type || "release"}</Badge><Badge>{scopeLabel(f.scope_type, f.scope_id, f.scope_name, f.project_name, f.organization_name)}</Badge>{f.reason && <span className="text-[var(--color-muted-foreground)]">{evaluationReasonLabel(f.reason)}</span>}<button type="button" className="ml-auto inline-flex items-center gap-1 font-medium text-[var(--color-primary)] hover:underline" onClick={() => openFlag(f)}>Lihat konfigurasi <ChevronRight className="h-3.5 w-3.5" /></button></div>
              <div className="flex flex-wrap gap-1">
                {ENVS.map((e) => (
                  <span key={e} className={`rounded-full border px-2 py-0.5 text-[11px] ${f.environments[e] ? "bg-[var(--color-success)]/10 border-[var(--color-success)]/40" : "opacity-40"}`}>
                    {e}
                  </span>
                ))}
              </div>
              {f.tags.length > 0 && <div className="flex gap-1">{f.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
            </CardContent>
          </Card>
            ))}
          </div>
        ))}
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        ariaLabel={selected ? `Konfigurasi ${selected.key}` : "Konfigurasi feature flag"}
        title={selected ? <span className="flex items-center gap-2"><code className="font-mono">{selected.key}</code><Badge variant={statusLabel(selected) === "Aktif" ? "success" : "destructive"}>{statusLabel(selected)}</Badge></span> : "Konfigurasi"}
        footer={selected && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={selected.enabled} disabled={selected.kill_switch} title={selected.kill_switch ? "Kill switch aktif dan mengesampingkan status ini. Matikan kill switch untuk mengubah status Aktif." : undefined} aria-label={`Ubah status ${selected.key}`} onChange={(v) => toggleMut.mutate({ k: selected.key, patch: { enabled: v } })} />
              {statusLabel(selected)}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={selected.kill_switch} aria-label="Hentikan flag secara paksa" onChange={(v) => toggleMut.mutate({ k: selected.key, patch: { kill_switch: v } })} />
              Hentikan paksa
            </label>
            <Button size="sm" variant="outline" onClick={() => setRollbackKey(selected.key)} disabled={rollbackMut.isPending}>
              <Refresh className="h-3.5 w-3.5" /> Pulihkan konfigurasi
            </Button>
            <Button size="sm" variant="ghost" className="text-[var(--color-destructive)] ml-auto" onClick={() => setDeleteKey(selected.key)}>
              <Trash className="h-3.5 w-3.5" /> Hapus
            </Button>
          </div>
        )}
      >
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-muted-foreground)]">{selected.description || "—"}</p>
            <div className="flex flex-wrap gap-1">
              <Badge>{selected.type || "release"}</Badge>
              <Badge>{scopeLabel(selected.scope_type, selected.scope_id, selected.scope_name, selected.project_name, selected.organization_name)}</Badge>
              {selected.reason && <span className="text-xs text-[var(--color-muted-foreground)]">{evaluationReasonLabel(selected.reason)}</span>}
            </div>
            <p className="rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-2 text-xs text-[var(--color-muted-foreground)]">
              Hentikan paksa akan mengesampingkan status Aktif dan pengaturan environment, sehingga flag selalu Nonaktif.
            </p>

            <Tabs<PanelTab>
              tabs={[
                { id: "details", label: "Konfigurasi" },
                { id: "audit", label: "Riwayat perubahan" },
                { id: "preview", label: "Evaluasi" },
              ]}
              active={panelTab}
              onChange={setPanelTab}
            />

            {panelTab === "details" && (
              <div className="space-y-4 pt-3">
                <div>
                  <div className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Environment</div>
                  <p className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">Pilih environment tempat flag ini aktif. Hentikan paksa tetap mengesampingkan pilihan ini.</p>
                  <div className="grid gap-1.5">
                    {ENVS.map((env) => (
                      <div
                        key={env}
                        className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
                      >
                        <span>{env}</span>
                        <Switch
                          checked={selected.environments[env] === true}
                          aria-label={`Ubah environment ${env}`}
                          onChange={(v) => toggleMut.mutate({ k: selected.key, patch: { environments: { ...selected.environments, [env]: v } } })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <Field label="Persentase rollout" help="Persentase pengguna yang menerima flag secara bertahap.">
                  <Input type="number" min={0} max={100} value={selected.rollout_percent} onChange={(e) => toggleMut.mutate({ k: selected.key, patch: { rollout_percent: Number(e.target.value) } })} />
                </Field>
                <Field label="Masa berlaku (detik)" help="Durasi sebelum flag tidak lagi berlaku, jika diatur.">{selected.ttl_seconds ?? "—"}</Field>
                <Field label="Berakhir otomatis pada" help="Flag akan kedaluwarsa otomatis pada waktu ini.">{selected.scheduled_expire_at ? new Date(selected.scheduled_expire_at * 1000).toLocaleString("id-ID") : "—"}</Field>
                <Field label="User yang selalu diizinkan" help="User ini tetap menerima flag terlepas dari persentase rollout.">{selected.users_whitelist.length ? selected.users_whitelist.join(", ") : "—"}</Field>
                <Field label="User yang selalu diblokir" help="User ini tidak akan menerima flag meskipun statusnya Aktif.">{selected.users_blacklist.length ? selected.users_blacklist.join(", ") : "—"}</Field>
                <Field label="Prasyarat" help="Flag yang harus terpenuhi sebelum flag ini dievaluasi.">{selected.prerequisites?.length ? selected.prerequisites.join(", ") : "—"}</Field>
                <Field label="Flag induk" help="Flag induk yang menjadi dasar evaluasi flag ini.">{selected.parent_key || "—"}</Field>
              </div>
            )}

            {panelTab === "audit" && (
              <div>
                <h4 className="pt-3 text-sm font-medium">Riwayat perubahan</h4>
                {flagAuditQuery.isLoading && <p className="pt-3 text-sm text-[var(--color-muted-foreground)]">Memuat riwayat perubahan flag…</p>}
                {flagAuditQuery.isError && <p className="pt-3 text-sm text-[var(--color-destructive)]">Riwayat perubahan flag tidak dapat dimuat. Coba lagi.</p>}
                {!flagAuditQuery.isLoading && !flagAuditQuery.isError && <AuditTimeline entries={selectedAudit} emptyCopy="Belum ada riwayat perubahan untuk flag ini." />}
              </div>
            )}

            {panelTab === "preview" && (
              <div className="pt-3 space-y-3">
                <p className="text-sm text-[var(--color-muted-foreground)]">Evaluasi hasil flag untuk environment dan user tertentu.</p>
                <div className="flex gap-2">
                  <Input value={previewEnv} onChange={(e) => setPreviewEnv(e.target.value)} placeholder="Masukkan environment, mis. prod" aria-label="Environment evaluasi" />
                  <Input value={previewUser} onChange={(e) => setPreviewUser(e.target.value)} placeholder="Masukkan user" aria-label="User evaluasi" />
                </div>
                <Button size="sm" onClick={() => previewMut.mutate({ key: selected.key, env: previewEnv, user: previewUser })} disabled={previewMut.isPending || !previewEnv.trim()}>
                  Evaluasi
                </Button>
                {previewResult && (
                  <div className="rounded-md border border-[var(--color-border)] p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={evaluationStatusLabel(previewResult) === "Aktif" ? "success" : "destructive"}>{evaluationStatusLabel(previewResult)}</Badge>
                      <span className="text-sm font-medium">{evaluationReasonLabel(previewResult.reason)}</span>
                    </div>
                    {evaluationReasonExplanation(previewResult.reason) && <div className="text-xs text-[var(--color-warning)]">{evaluationReasonExplanation(previewResult.reason)}</div>}
                    <div className="text-xs text-[var(--color-muted-foreground)]">Sumber: {readableSource(previewResult.source)} · Cakupan yang cocok: {readableScopeValue(previewResult.matched_scope)}</div>
                    {previewResult.requires && <div className="text-xs text-[var(--color-warning)]">Prasyarat: {previewResult.requires}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!deleteKey}
        title="Hapus feature flag secara permanen?"
        description={`Flag "${deleteKey}" dan seluruh konfigurasi terkait akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus permanen"
        cancelLabel="Batal"
        variant="destructive"
        busyLabel="Memproses…"
        busy={deleteMut.isPending}
        onConfirm={() => deleteKey && deleteMut.mutate(deleteKey)}
        onCancel={() => setDeleteKey(null)}
      />
      <ConfirmDialog
        open={!!rollbackKey}
        title="Pulihkan konfigurasi sebelumnya?"
        description={`Konfigurasi flag "${rollbackKey}" akan dikembalikan ke versi sebelumnya. Tindakan ini membuat entri baru di riwayat audit.`}
        confirmLabel="Pulihkan konfigurasi"
        cancelLabel="Batal"
        busyLabel="Memproses…"
        busy={rollbackMut.isPending}
        onConfirm={() => rollbackKey && rollbackMut.mutate(rollbackKey)}
        onCancel={() => setRollbackKey(null)}
      />
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1">{label}</div>
      {help && <p className="mb-1 text-[11px] text-[var(--color-muted-foreground)]">{help}</p>}
      <div className="text-sm">{children}</div>
    </div>
  );
}
