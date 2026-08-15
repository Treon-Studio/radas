import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import {
  RiFlagLine as Flag, RiAddLine as Plus, RiDeleteBinLine as Trash,
  RiRefreshLine as Refresh, RiCloseLine, RiArrowRightSLine as ChevronRight,
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

/** API records may come from the registry, a legacy global record, or an effective scoped record. */
type FlagType = {
  id?: string;
  key: string;
  name?: string;
  description?: string;
  enabled: boolean;
  environments?: Record<string, boolean>;
  rollout_percent?: number;
  users_whitelist?: string[];
  users_blacklist?: string[];
  tags?: string[];
  namespace?: string;
  domain?: string;
  type?: string;
  scope_type?: string;
  scope_id?: string | null;
  scope_name?: string;
  project_name?: string;
  organization_name?: string;
  parent_key?: string | null;
  prerequisites?: string[];
  reason?: string;
  ttl_seconds?: number;
  scheduled_expire_at?: number;
  expired_at?: number;
  archived?: boolean;
  kill_switch?: boolean;
  created_at?: number;
  updated_at?: number;
};

type ImpactDependent = {
  key: string;
  scope_type?: string;
  scope_id?: string | null;
  relationship?: "parent" | "prerequisite" | string;
};

type FlagImpact = {
  flag: FlagType;
  effective_parent?: FlagType | null;
  prerequisites?: FlagType[];
  dependents?: ImpactDependent[];
  blockers?: ImpactDependent[];
  lifecycle?: { archived?: boolean; expired_at?: number };
};

type EvaluationTraceNode = {
  key?: string;
  relationship?: "target" | "parent" | "prerequisite" | string;
  gate?: string;
  scope?: string;
};

type EvaluationResult = {
  key?: string;
  enabled?: boolean;
  reason?: string;
  source?: string;
  matched_scope?: string;
  requires?: string;
  dependency_path?: string[];
  trace?: EvaluationTraceNode[];
};

const ENVS = ["dev", "staging", "prod", "preview"];
type PanelTab = "details" | "audit" | "preview";

const OP_VARIANT: Record<string, "success" | "destructive" | "default" | "warning"> = {
  create: "success", delete: "destructive", archive: "warning", restore: "success", expire: "warning", import: "default", update: "default", rollback: "warning",
};
const OP_COLOR: Record<string, string> = {
  create: "bg-[var(--color-success)]", delete: "bg-[var(--color-destructive)]", archive: "bg-[var(--color-warning)]", restore: "bg-[var(--color-success)]", expire: "bg-[var(--color-warning)]", import: "bg-[var(--color-primary)]", update: "bg-[var(--color-primary)]", rollback: "bg-[var(--color-warning)]",
};
const EVALUATION_REASONS: Record<string, string> = {
  kill_switch: "Dihentikan darurat", globally_disabled: "Dinonaktifkan secara global", parent_disabled: "Flag induk nonaktif", missing_prerequisite: "Prasyarat belum terpenuhi", unknown_parent: "Flag induk tidak ditemukan", unknown_prerequisite: "Flag prasyarat tidak ditemukan", invalid_dependency_cycle: "Siklus dependensi tidak valid", blacklisted: "User masuk daftar blokir", zero_rollout: "Rollout 0%", full_rollout: "Rollout penuh", rollout: "Rollout bertahap", whitelisted: "User masuk daftar izin", unknown_flag: "Flag tidak ditemukan",
};

function auditOp(entry: any): string { return entry?.operation || entry?.changes?.operation || "change"; }
function auditOpLabel(operation: string): string {
  return ({ create: "Dibuat", update: "Diubah", delete: "Dihapus", archive: "Diarsipkan", restore: "Dipulihkan dari arsip", expire: "Kedaluwarsa", import: "Diimpor", rollback: "Dikembalikan" } as Record<string, string>)[operation] || "Perubahan";
}
function auditActor(entry: any): string {
  const actor = entry?.actor_name || entry?.actor || entry?.changes?.actor;
  return !actor || String(actor).toLowerCase() === "system" ? "Sistem" : String(actor);
}
function statusLabel(flag: Pick<FlagType, "enabled" | "kill_switch" | "archived">): string {
  return flag.archived ? "Diarsipkan" : flag.kill_switch ? "Dihentikan darurat" : flag.enabled ? "Aktif" : "Nonaktif";
}
function localizedMutationError(error: unknown, fallback: string): string {
  const message = typeof error === "string" ? error : typeof (error as { message?: unknown } | null)?.message === "string" ? (error as { message: string }).message : "";
  if (!message) return fallback;
  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) return "Flag tidak ditemukan";
  if (normalized.includes("no previous version")) return "Tidak ada versi sebelumnya";
  if (normalized.includes("key required")) return "Key wajib diisi";
  if (normalized.includes("already exists")) return "Flag sudah ada";
  if (normalized.includes("dependents")) return "Flag masih dipakai oleh flag lain. Lepaskan dependensinya terlebih dahulu.";
  if (normalized.includes("must be archived")) return "Flag harus diarsipkan sebelum dihapus permanen.";
  if (normalized.includes("unknown parent")) return "Flag induk tidak ditemukan pada cakupan ini.";
  if (normalized.includes("unknown prerequisite")) return "Flag prasyarat tidak ditemukan pada cakupan ini.";
  if (normalized.includes("cannot reference itself")) return "Flag tidak dapat menjadi relasi untuk dirinya sendiri.";
  if (normalized.includes("duplicate prerequisite")) return "Prasyarat tidak boleh duplikat.";
  if (normalized.includes("also be a prerequisite")) return "Flag induk tidak boleh juga menjadi prasyarat.";
  if (normalized.includes("cycle")) return "Relasi ini membentuk siklus dependensi.";
  if (normalized.includes("invalid")) return "Data flag tidak valid";
  if (normalized.includes("unauthorized")) return "Anda tidak berwenang melakukan tindakan ini";
  if (normalized.includes("forbidden") || normalized.includes("access denied")) return "Akses ditolak";
  return message;
}
function evaluationReasonLabel(reason: unknown): string {
  const normalized = String(reason ?? "");
  if (EVALUATION_REASONS[normalized]) return EVALUATION_REASONS[normalized];
  if (normalized.startsWith("disabled_in_")) return `Dinonaktifkan di environment ${normalized.slice("disabled_in_".length)}`;
  return "Status evaluasi tersedia";
}
function evaluationReasonExplanation(reason: unknown): string | null {
  const value = String(reason ?? "");
  if (value === "kill_switch") return "Hentikan darurat mengesampingkan status Aktif, environment, dan rollout.";
  if (value === "invalid_dependency_cycle") return "Hubungan flag tidak dapat dievaluasi sampai siklus dependensi diperbaiki.";
  return null;
}
function evaluationStatusLabel(result: EvaluationResult): string { return result.reason === "kill_switch" ? "Dihentikan darurat" : result.enabled ? "Aktif" : "Nonaktif"; }
function scopeLabel(scopeType?: string, scopeId?: string | null, scopeName?: string, projectName?: string, organizationName?: string): string {
  const parts = String(scopeType || "global").split(":");
  const raw = parts[0] === "flags" ? parts[1] : parts[0];
  const id = scopeId || (parts[0] === "flags" ? parts[2] : undefined);
  const kind = String(raw || "global").toLowerCase().replace(/_id$/, "");
  const label = kind === "project" ? "Project" : kind === "organization" || kind === "org" ? "Organization" : "Global";
  const name = scopeName || (kind === "project" ? projectName : kind === "organization" || kind === "org" ? organizationName : undefined);
  return name ? `${label} · ${name}` : label === "Global" && (!id || id === "default") ? label : id ? `${label} · ${shortId(id)}` : label;
}
function readableSource(value: unknown): string { return ({ global: "Global", project: "Project", organization: "Organization", org: "Organization", environment: "Environment", dependency: "Dependensi", "legacy-global": "Global lama" } as Record<string, string>)[String(value ?? "").toLowerCase()] || String(value ?? "—"); }
function readableScopeValue(value: unknown): string {
  const parts = String(value ?? "—").split(":");
  return parts[0] === "flags" ? scopeLabel(parts[1], parts[2]) : parts.length >= 2 ? scopeLabel(parts[0], parts[1]) : readableSource(value);
}
function auditTime(entry: any): string { const at = entry?.at ?? entry?.changes?.at; return at ? new Date(Number(at) * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"; }
function auditDay(ts: number): string {
  const date = new Date(ts * 1000); const today = new Date(); const yesterday = new Date(today.getTime() - 864e5);
  if (date.toDateString() === today.toDateString()) return "Hari ini";
  if (date.toDateString() === yesterday.toDateString()) return "Kemarin";
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
function shortId(id: unknown): string { return typeof id === "string" && id.length > 8 ? id.slice(0, 8) : String(id ?? ""); }
function formatVal(v: unknown, field?: string): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "boolean") return field === "kill_switch" && v ? "Dihentikan darurat" : v ? "Aktif" : "Nonaktif";
  return Array.isArray(v) ? (v.length ? v.join(", ") : "—") : typeof v === "object" ? JSON.stringify(v) : String(v);
}
function relationshipValidation(key: string, parent: string, prerequisites: string[]): string | null {
  const normalizedKey = key.trim().toLowerCase(); const normalizedParent = parent.trim().toLowerCase(); const normalizedPrerequisites = prerequisites.map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (normalizedParent && normalizedParent === normalizedKey) return "Flag induk tidak boleh sama dengan flag ini.";
  if (normalizedPrerequisites.includes(normalizedKey)) return "Prasyarat tidak boleh sama dengan flag ini.";
  if (new Set(normalizedPrerequisites).size !== normalizedPrerequisites.length) return "Prasyarat tidak boleh duplikat.";
  if (normalizedParent && normalizedPrerequisites.includes(normalizedParent)) return "Flag induk tidak boleh juga menjadi prasyarat.";
  return null;
}
type FlagScope = { scope_type: "global" | "organization" | "project"; scope_id?: string };
function flagScope(flag: Pick<FlagType, "scope_type" | "scope_id">): FlagScope {
  const raw = String(flag.scope_type || "global").split(":");
  const scopeType = raw[0] === "flags" ? raw[1] : raw[0];
  const scopeId = flag.scope_id ?? (raw[0] === "flags" ? raw[2] : undefined);
  return { scope_type: scopeType === "org" ? "organization" : scopeType === "project" ? "project" : scopeType === "organization" ? "organization" : "global", ...(scopeId && scopeId !== "default" ? { scope_id: scopeId } : {}) };
}
function scopeQuery(flag: Pick<FlagType, "scope_type" | "scope_id">): string {
  const scope = flagScope(flag);
  const params = new URLSearchParams({ scope_type: scope.scope_type });
  if (scope.scope_id) params.set("scope_id", scope.scope_id);
  return params.toString();
}
function scopePayload(flag: Pick<FlagType, "scope_type" | "scope_id">): FlagScope { return flagScope(flag); }
function sameScope(left: Pick<FlagType, "scope_type" | "scope_id">, right: Pick<FlagType, "scope_type" | "scope_id">): boolean {
  const a = flagScope(left); const b = flagScope(right);
  return a.scope_type === b.scope_type && a.scope_id === b.scope_id;
}

function DiffChips({ changes }: { changes: Record<string, unknown> }) {
  const items: { label: string; before: unknown; after: unknown }[] = [];
  for (const [field, val] of Object.entries(changes ?? {})) {
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;
    const rec = val as Record<string, unknown>;
    if (field === "environments") for (const [env, ev] of Object.entries(rec)) { const e = (ev ?? {}) as Record<string, unknown>; items.push({ label: `env.${env}`, before: e.before, after: e.after }); }
    else if ("before" in rec || "after" in rec) items.push({ label: field, before: rec.before, after: rec.after });
  }
  if (!items.length) return null;
  return <div className="mt-1.5 flex flex-wrap gap-1">{items.map((item) => <span key={item.label} className="rounded border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-1.5 py-0.5 font-mono text-[11px]">{item.label}: <span className="text-[var(--color-muted-foreground)] line-through decoration-[var(--color-destructive)]/60">{formatVal(item.before, item.label)}</span>{" → "}<span>{formatVal(item.after, item.label)}</span></span>)}</div>;
}
function AuditTimeline({ entries, emptyCopy }: { entries: any[]; emptyCopy: string }) {
  if (!entries.length) return <p className="pt-3 text-sm text-[var(--color-muted-foreground)]">{emptyCopy}</p>;
  const groups: { label: string; items: any[] }[] = [];
  for (const entry of entries) { const label = auditDay(Number(entry?.at ?? entry?.changes?.at ?? 0)); const last = groups[groups.length - 1]; if (!last || last.label !== label) groups.push({ label, items: [entry] }); else last.items.push(entry); }
  return <div className="space-y-5 pt-3">{groups.map((group) => <div key={group.label}><div className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">{group.label}</div><ol className="relative ml-2 space-y-3 border-l border-[var(--color-border)]">{group.items.map((entry, index) => <li key={`${entry.at}-${index}`} className="relative pl-4"><span className={`absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ${OP_COLOR[auditOp(entry)] ?? "bg-[var(--color-muted-foreground)]"}`} /><div className="rounded-md border border-[var(--color-border)] p-2 text-xs"><div className="flex flex-wrap items-center gap-2"><Badge variant={OP_VARIANT[auditOp(entry)] ?? "default"}>{auditOpLabel(auditOp(entry))}</Badge><code className="font-mono text-[var(--color-muted-foreground)]">{entry.key}</code><span className="font-medium">{auditActor(entry)}</span>{entry.scope_type && <Badge>{scopeLabel(entry.scope_type, entry.scope_id, entry.scope_name, entry.project_name, entry.organization_name)}</Badge>}<span className="ml-auto text-[var(--color-muted-foreground)]">{auditTime(entry)}</span></div><DiffChips changes={entry.changes} /></div></li>)}</ol></div>)}</div>;
}

function FlagsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["flags"], queryFn: () => api<{ flags: FlagType[] }>("GET", "/api/flags") });
  const [showForm, setShowForm] = useState(false);
  const [key, setKey] = useState(""); const [name, setName] = useState(""); const [desc, setDesc] = useState(""); const [enabled, setEnabled] = useState(true); const [kill, setKill] = useState(false); const [rollout, setRollout] = useState(100); const [tags, setTags] = useState(""); const [whitelist, setWhitelist] = useState("");
  const [createParent, setCreateParent] = useState(""); const [createPrerequisites, setCreatePrerequisites] = useState<string[]>([]); const [createRelationshipError, setCreateRelationshipError] = useState<string | null>(null);
  const [search, setSearch] = useState(""); const [tagFilter, setTagFilter] = useState(""); const [envFilter, setEnvFilter] = useState(""); const [statusFilter, setStatusFilter] = useState(""); const [auditOpen, setAuditOpen] = useState(false);
  const [selected, setSelected] = useState<FlagType | null>(null); const [panelTab, setPanelTab] = useState<PanelTab>("details");
  const [previewEnv, setPreviewEnv] = useState("prod"); const [previewUser, setPreviewUser] = useState(""); const [previewResult, setPreviewResult] = useState<EvaluationResult | null>(null);
  const [editParent, setEditParent] = useState(""); const [editPrerequisites, setEditPrerequisites] = useState<string[]>([]); const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [archiveFlag, setArchiveFlag] = useState<FlagType | null>(null); const [deleteFlag, setDeleteFlag] = useState<FlagType | null>(null); const [deleteTypedKey, setDeleteTypedKey] = useState(""); const [deleteConfirmFlag, setDeleteConfirmFlag] = useState<FlagType | null>(null); const [rollbackFlag, setRollbackFlag] = useState<FlagType | null>(null); const [killPending, setKillPending] = useState<FlagType | null>(null);
  const deleteInputRef = useRef<HTMLInputElement>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["flags"] });
  const invalidateImpact = () => qc.invalidateQueries({ queryKey: ["flag-impact"] });
  const flags = data?.flags ?? [];
  const createOptions = flags.filter((flag) => flag.key !== key.trim().toLowerCase());

  const createMut = useMutation({
    mutationFn: () => api("POST", "/api/flags", { key, name, description: desc, enabled, kill_switch: kill, rollout_percent: rollout, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), users_whitelist: whitelist.split(",").map((user) => user.trim()).filter(Boolean), parent_key: createParent || null, prerequisites: createPrerequisites }),
    onSuccess: () => { toast.success(`Flag ${key} dibuat`); setShowForm(false); setKey(""); setName(""); setDesc(""); setTags(""); setWhitelist(""); setRollout(100); setEnabled(true); setKill(false); setCreateParent(""); setCreatePrerequisites([]); setCreateRelationshipError(null); invalidate(); },
    onError: (error: unknown) => toast.error(localizedMutationError(error, "Gagal membuat flag")),
  });
  const toggleMut = useMutation({
    mutationFn: ({ flag, patch }: { flag: FlagType; patch: Partial<FlagType> }) => api<{ success: boolean; flag: FlagType }>("PATCH", `/api/flags/${encodeURIComponent(flag.key)}`, { ...patch, ...scopePayload(flag) }),
    onMutate: async ({ flag, patch }) => { await qc.cancelQueries({ queryKey: ["flags"] }); const previous = qc.getQueryData<{ flags: FlagType[] }>(["flags"]); const previousSelected = selected?.key === flag.key && sameScope(selected, flag) ? selected : null; qc.setQueryData<{ flags: FlagType[] }>(["flags"], (old) => old ? { flags: old.flags.map((item) => item.key === flag.key && sameScope(item, flag) ? { ...item, ...patch } : item) } : old); setSelected((current) => current?.key === flag.key && sameScope(current, flag) ? { ...current, ...patch } : current); return { previous, previousSelected }; },
    onSuccess: () => toast.success("Flag diperbarui"),
    onError: (error: unknown, _vars, context) => { if (context?.previous) qc.setQueryData<{ flags: FlagType[] }>(["flags"], context.previous); if (context?.previousSelected) setSelected(context.previousSelected); toast.error(localizedMutationError(error, "Gagal memperbarui flag")); },
    onSettled: () => { invalidate(); invalidateImpact(); },
  });
  const relationshipMut = useMutation({
    mutationFn: ({ flag, parent_key, prerequisites }: { flag: FlagType; parent_key: string | null; prerequisites: string[] }) => api<{ success: boolean; flag: FlagType }>("PATCH", `/api/flags/${encodeURIComponent(flag.key)}`, { parent_key, prerequisites, ...scopePayload(flag) }),
    onSuccess: (result) => { setSelected(result.flag); setEditParent(result.flag.parent_key || ""); setEditPrerequisites(result.flag.prerequisites || []); setRelationshipError(null); toast.success("Hubungan flag diperbarui"); invalidate(); invalidateImpact(); },
    onError: (error: unknown) => { const message = localizedMutationError(error, "Gagal memperbarui hubungan flag"); setRelationshipError(message); },
  });
  const archiveMut = useMutation({
    mutationFn: (flag: FlagType) => api<{ success: boolean; flag: FlagType }>("POST", `/api/flags/${encodeURIComponent(flag.key)}/archive`, scopePayload(flag)),
    onSuccess: () => { setArchiveFlag(null); setSelected(null); toast.success("Flag diarsipkan dan dinonaktifkan"); },
    onError: (error: unknown) => toast.error(localizedMutationError(error, "Gagal mengarsipkan flag")),
    onSettled: () => { invalidate(); invalidateImpact(); },
  });
  const restoreMut = useMutation({
    mutationFn: (flag: FlagType) => api<{ success: boolean; flag: FlagType }>("POST", `/api/flags/${encodeURIComponent(flag.key)}/restore`, scopePayload(flag)),
    onSuccess: (result) => { setSelected(result.flag); toast.success("Flag dipulihkan dalam keadaan nonaktif"); },
    onError: (error: unknown) => toast.error(localizedMutationError(error, "Gagal memulihkan flag")),
    onSettled: () => { invalidate(); invalidateImpact(); },
  });
  const deleteMut = useMutation({
    mutationFn: (flag: FlagType) => api("DELETE", `/api/flags/${encodeURIComponent(flag.key)}?${scopeQuery(flag)}`),
    onSuccess: () => { setDeleteConfirmFlag(null); setDeleteFlag(null); setDeleteTypedKey(""); setSelected(null); toast.success("Flag dihapus permanen"); },
    onError: (error: unknown) => toast.error(localizedMutationError(error, "Gagal menghapus flag")),
    onSettled: () => { invalidate(); invalidateImpact(); },
  });
  const rollbackMut = useMutation({ mutationFn: (flag: FlagType) => api("POST", `/api/flags/${encodeURIComponent(flag.key)}/rollback`, scopePayload(flag)), onSuccess: () => { invalidate(); invalidateImpact(); setRollbackFlag(null); setSelected(null); toast.success("Konfigurasi dikembalikan"); }, onError: (error: unknown) => toast.error(localizedMutationError(error, "Gagal mengembalikan konfigurasi flag")) });
  const previewMut = useMutation({ mutationFn: (input: { flag: FlagType; env: string; user: string }) => api<EvaluationResult>("POST", "/api/flags/evaluate", { key: input.flag.key, env: input.env, user: input.user, ...scopePayload(input.flag) }), onSuccess: (result) => setPreviewResult(result), onError: (error: unknown) => toast.error(localizedMutationError(error, "Gagal mengevaluasi flag")) });

  const visibleFlags = flags.filter((flag) => (!search || `${flag.key} ${flag.name || ""} ${flag.description || ""}`.toLowerCase().includes(search.toLowerCase())) && (!tagFilter || (flag.tags || []).includes(tagFilter)) && (!envFilter || flag.environments?.[envFilter] === true) && (!statusFilter || (statusFilter === "on" ? flag.enabled && !flag.kill_switch && !flag.archived : statusFilter === "killed" ? flag.kill_switch : statusFilter === "archived" ? flag.archived : !flag.enabled && !flag.kill_switch && !flag.archived)));
  const namespaces = [...new Set(visibleFlags.map((flag) => flag.namespace || "default"))];
  const auditQuery = useQuery({ queryKey: ["flags-audit"], queryFn: () => api<{ audit: any[] }>("GET", "/api/flags/audit?limit=100"), enabled: auditOpen });
  const flagAuditQuery = useQuery({ queryKey: ["flag-audit", selected?.key, selected?.scope_type, selected?.scope_id], queryFn: () => api<{ audit: any[] }>("GET", `/api/flags/audit?limit=500&flag_key=${encodeURIComponent(selected!.key)}&${scopeQuery(selected!)}`), enabled: !!selected && panelTab === "audit" });
  const impactQuery = useQuery({ queryKey: ["flag-impact", selected?.key, selected?.scope_type, selected?.scope_id], queryFn: () => api<FlagImpact>("GET", `/api/flags/${encodeURIComponent(selected!.key)}/impact?${scopeQuery(selected!)}`), enabled: !!selected });

  const openFlagByKey = (flagKey: string, targetScope?: Pick<FlagType, "scope_type" | "scope_id">) => { const target = flags.find((flag) => flag.key === flagKey && (!targetScope || sameScope(flag, targetScope))); if (target) openFlag(target); };
  const openFlag = (flag: FlagType) => { setSelected(flag); setPanelTab("details"); setPreviewEnv("prod"); setPreviewUser(""); setPreviewResult(null); setEditParent(flag.parent_key || ""); setEditPrerequisites(flag.prerequisites || []); setRelationshipError(null); setKillPending(null); };
  const selectedAudit = flagAuditQuery.data?.audit ?? [];
  const impact = impactQuery.data;
  const impactDependents = impact?.dependents || impact?.blockers || [];
  const relatedOptions = selected ? flags.filter((flag) => flag.key !== selected.key && flag.key !== editParent) : [];
  const validateCreate = () => { const error = relationshipValidation(key, createParent, createPrerequisites); setCreateRelationshipError(error); return !error; };
  const validateEdit = () => { if (!selected) return false; const error = relationshipValidation(selected.key, editParent, editPrerequisites); setRelationshipError(error); return !error; };

  return <div className="space-y-4">
    <Breadcrumbs items={[{ label: "Cloud" }, { label: "Feature Flags" }]} />
    <div className="flex items-center justify-between"><div><h1 className="flex items-center gap-2 text-lg font-mono font-semibold"><Flag className="h-5 w-5" /> Feature Flags</h1><p className="text-sm text-[var(--color-muted-foreground)]">Atur peluncuran bertahap, hubungan antar-flag, dan hentikan flag saat kondisi darurat.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setAuditOpen((value) => !value)}>Riwayat audit</Button><Button size="sm" onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" /> {showForm ? "Tutup" : "Buat flag"}</Button></div></div>

    {showForm && <VaulDrawer.Root open={showForm} onOpenChange={setShowForm} direction="right"><VaulDrawer.Portal><VaulDrawer.Overlay className="fixed inset-0 z-50 bg-black/40" /><VaulDrawer.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-popover)]"><VaulDrawer.Title className="sr-only">Buat feature flag</VaulDrawer.Title><VaulDrawer.Description className="sr-only">Buat feature flag baru.</VaulDrawer.Description><header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3"><span className="text-sm font-semibold">Buat feature flag</span><button type="button" onClick={() => setShowForm(false)} aria-label="Tutup" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-muted)]"><RiCloseLine className="h-4 w-4" /></button></header><div className="grid flex-1 gap-3 overflow-y-auto px-5 py-4"><Field label="Key" help="Contoh: block_apply"><Input id="flag-key" value={key} onChange={(event) => setKey(event.target.value)} placeholder="block_apply" /></Field><Field label="Nama"><Input id="flag-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Blokir semua apply" /></Field><Field label="Deskripsi"><Textarea id="flag-description" value={desc} onChange={(event) => setDesc(event.target.value)} className="h-16" placeholder="Hentikan semua operasi apply saat darurat" /></Field><Field label="Persentase rollout" help="Persentase pengguna yang menerima flag ini secara bertahap."><Input id="flag-rollout" type="number" min={0} max={100} value={rollout} onChange={(event) => setRollout(Number(event.target.value))} /></Field><Field label="Tag" help="Pisahkan dengan koma."><Input id="flag-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="safety, gate" /></Field><Field label="User yang selalu diizinkan" help="Daftar ini mengesampingkan rollout."><Input id="flag-whitelist" value={whitelist} onChange={(event) => setWhitelist(event.target.value)} placeholder="admin, devops" /></Field><label className="flex items-center gap-2 text-sm"><CheckboxInput checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Aktif</label><label className="flex items-center gap-2 text-sm"><CheckboxInput checked={kill} onChange={(event) => setKill(event.target.checked)} /> Hentikan darurat saat dibuat</label>
      <details className="rounded-md border border-[var(--color-border)] p-3"><summary className="cursor-pointer text-sm font-medium">Hubungan & pengaturan rilis lanjutan</summary><p className="mt-2 text-[11px] text-[var(--color-muted-foreground)]">Opsional. Parent harus aktif, dan semua prasyarat harus terpenuhi sebelum flag ini dapat aktif.</p><div className="mt-3 grid gap-3"><div><label htmlFor="create-parent" className="text-xs font-medium text-[var(--color-muted-foreground)]">Flag induk</label><select id="create-parent" className="mt-1 w-full rounded-md border bg-transparent px-2 py-2 text-sm" value={createParent} onChange={(event) => { setCreateParent(event.target.value); setCreatePrerequisites((current) => current.filter((item) => item !== event.target.value)); setCreateRelationshipError(null); }}><option value="">Tanpa flag induk</option>{createOptions.map((flag) => <option key={flag.key} value={flag.key}>{flag.key}</option>)}</select></div><div><label htmlFor="create-prerequisites" className="text-xs font-medium text-[var(--color-muted-foreground)]">Prasyarat (pilih lebih dari satu bila perlu)</label><select id="create-prerequisites" multiple size={Math.min(5, Math.max(3, createOptions.length))} className="mt-1 w-full rounded-md border bg-transparent px-2 py-1 text-sm" value={createPrerequisites} onChange={(event) => { setCreatePrerequisites(Array.from(event.currentTarget.selectedOptions, (option) => option.value)); setCreateRelationshipError(null); }}>{createOptions.filter((flag) => flag.key !== createParent).map((flag) => <option key={flag.key} value={flag.key}>{flag.key}</option>)}</select></div>{createRelationshipError && <p role="alert" className="text-sm text-[var(--color-destructive)]">{createRelationshipError}</p>}</div></details>
    </div><footer className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3"><Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Batal</Button><Button size="sm" onClick={() => validateCreate() && createMut.mutate()} disabled={createMut.isPending || key.trim().length < 2}>Buat flag</Button></footer></VaulDrawer.Content></VaulDrawer.Portal></VaulDrawer.Root>}

    {isLoading && <div className="text-sm text-[var(--color-muted-foreground)]">Memuat feature flag…</div>}
    {isError && <div role="alert" className="rounded-md border border-[var(--color-destructive)]/40 p-3 text-sm text-[var(--color-destructive)]">Feature flag tidak dapat dimuat. Periksa akses API lalu coba lagi.</div>}
    {auditOpen && <Card><CardHeader className="py-3"><CardTitle className="text-sm">Riwayat perubahan</CardTitle></CardHeader><CardContent className="pt-0">{auditQuery.isLoading && <p className="pt-3 text-sm text-[var(--color-muted-foreground)]">Memuat riwayat perubahan…</p>}{auditQuery.isError && <p role="alert" className="pt-3 text-sm text-[var(--color-destructive)]">Riwayat perubahan tidak dapat dimuat. Coba lagi.</p>}{!auditQuery.isLoading && !auditQuery.isError && <AuditTimeline entries={auditQuery.data?.audit ?? []} emptyCopy="Belum ada riwayat perubahan." />}</CardContent></Card>}
    <Card><CardContent className="flex flex-wrap items-center gap-2 py-3"><label htmlFor="flag-search" className="sr-only">Cari feature flag</label><Input id="flag-search" className="w-64" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari berdasarkan key, nama, atau deskripsi…" /><label htmlFor="flag-tag-filter" className="sr-only">Filter tag</label><select id="flag-tag-filter" className="rounded-md border bg-transparent px-2 text-sm" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">Semua tag</option>{[...new Set(flags.flatMap((flag) => flag.tags || []))].map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select><label htmlFor="flag-environment-filter" className="sr-only">Filter environment</label><select id="flag-environment-filter" className="rounded-md border bg-transparent px-2 text-sm" value={envFilter} onChange={(event) => setEnvFilter(event.target.value)}><option value="">Semua environment</option>{ENVS.map((env) => <option key={env} value={env}>{env}</option>)}</select><label htmlFor="flag-status-filter" className="sr-only">Filter status</label><select id="flag-status-filter" className="rounded-md border bg-transparent px-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Semua status</option><option value="on">Aktif</option><option value="off">Nonaktif</option><option value="killed">Dihentikan darurat</option><option value="archived">Diarsipkan</option></select><span className="text-xs text-[var(--color-muted-foreground)]">Menampilkan {visibleFlags.length} dari {flags.length} flag</span>{(search || tagFilter || envFilter || statusFilter) && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setTagFilter(""); setEnvFilter(""); setStatusFilter(""); }}>Reset filter</Button>}</CardContent></Card>
    {flags.length > 0 && visibleFlags.length === 0 && <div className="rounded-md border border-[var(--color-border)] p-4 text-sm text-[var(--color-muted-foreground)]">Tidak ada feature flag yang cocok dengan filter saat ini.</div>}
    {flags.length === 0 && !isLoading && !isError && <div className="text-sm text-[var(--color-muted-foreground)]">Belum ada feature flag. Buat flag pertama, misalnya <code className="font-mono">block_apply</code>.</div>}
    <div className="grid gap-3 md:grid-cols-2">{namespaces.map((namespace) => <div key={namespace} className="contents"><div className="md:col-span-2 text-xs font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">{namespace}</div>{visibleFlags.filter((flag) => (flag.namespace || "default") === namespace).map((flag) => <Card key={flag.id || `${flag.scope_type}-${flag.scope_id}-${flag.key}`} className="transition-colors hover:border-[var(--color-primary)]/50"><CardHeader className="py-3"><CardTitle className="flex items-center gap-2 text-sm"><button type="button" className="inline-flex min-w-0 items-center gap-2 text-left" onClick={() => openFlag(flag)} aria-label={`Lihat konfigurasi ${flag.key}`}><Flag className="h-4 w-4" /><code className="font-mono">{flag.key}</code><Badge variant={statusLabel(flag) === "Aktif" ? "success" : statusLabel(flag) === "Diarsipkan" ? "warning" : "destructive"}>{statusLabel(flag)}</Badge>{(flag.rollout_percent ?? 100) < 100 && <Badge variant="warning">{flag.rollout_percent}%</Badge>}</button><span className="ml-auto" onClick={(event) => event.stopPropagation()}><Switch checked={flag.enabled} disabled={!!flag.kill_switch || !!flag.archived} title={flag.archived ? "Flag diarsipkan" : flag.kill_switch ? "Hentikan darurat aktif" : undefined} aria-label={`Ubah status ${flag.key}`} onChange={(value) => toggleMut.mutate({ flag, patch: { enabled: value } })} /></span></CardTitle></CardHeader><CardContent className="space-y-2 pt-0 text-sm"><div className="text-[var(--color-muted-foreground)]">{flag.description || "—"}</div><div className="flex flex-wrap items-center gap-1 text-[11px]"><Badge>{flag.type || "release"}</Badge><Badge>{scopeLabel(flag.scope_type, flag.scope_id, flag.scope_name, flag.project_name, flag.organization_name)}</Badge>{flag.parent_key && <Badge>Induk: {flag.parent_key}</Badge>}{(flag.prerequisites || []).length > 0 && <Badge>Butuh {flag.prerequisites!.length} prasyarat</Badge>}<button type="button" className="ml-auto inline-flex items-center gap-1 font-medium text-[var(--color-primary)] hover:underline" onClick={() => openFlag(flag)}>Lihat konfigurasi <ChevronRight className="h-3.5 w-3.5" /></button></div><div className="flex flex-wrap gap-1">{ENVS.map((env) => <span key={env} className={`rounded-full border px-2 py-0.5 text-[11px] ${flag.environments?.[env] ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/10" : "opacity-40"}`}>{env}</span>)}</div>{(flag.tags || []).length > 0 && <div className="flex gap-1">{flag.tags!.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>}</CardContent></Card>)}</div>)}</div>

    <Drawer open={!!selected} onClose={() => setSelected(null)} ariaLabel={selected ? `Konfigurasi ${selected.key}` : "Konfigurasi feature flag"} title={selected ? <span className="flex items-center gap-2"><code className="font-mono">{selected.key}</code><Badge variant={statusLabel(selected) === "Aktif" ? "success" : statusLabel(selected) === "Diarsipkan" ? "warning" : "destructive"}>{statusLabel(selected)}</Badge></span> : "Konfigurasi"} footer={selected && <div className="flex flex-wrap items-center gap-x-5 gap-y-2"><label className="flex items-center gap-2 text-sm"><Switch checked={selected.enabled} disabled={!!selected.kill_switch || !!selected.archived} title={selected.archived ? "Pulihkan dari arsip terlebih dahulu" : selected.kill_switch ? "Hentikan darurat aktif" : undefined} aria-label={`Ubah status ${selected.key}`} onChange={(value) => toggleMut.mutate({ flag: selected, patch: { enabled: value } })} />{statusLabel(selected)}</label><Button size="sm" variant="outline" onClick={() => setRollbackFlag(selected)} disabled={rollbackMut.isPending || !!selected.archived}><Refresh className="h-3.5 w-3.5" /> Kembalikan konfigurasi</Button></div>}>
      {selected && <div className="space-y-4"><p className="text-sm text-[var(--color-muted-foreground)]">{selected.description || "—"}</p><div className="flex flex-wrap gap-1"><Badge>{selected.type || "release"}</Badge><Badge>{scopeLabel(selected.scope_type, selected.scope_id, selected.scope_name, selected.project_name, selected.organization_name)}</Badge>{selected.archived && <Badge variant="warning">Tidak aktif dari arsip</Badge>}</div><Tabs<PanelTab> id="flag-detail-tabs" ariaLabel="Detail feature flag" tabs={[{ id: "details", label: "Konfigurasi" }, { id: "audit", label: "Riwayat perubahan" }, { id: "preview", label: "Evaluasi" }]} active={panelTab} onChange={setPanelTab} />
        {panelTab === "details" && <div id="flag-detail-tabs-panel-details" role="tabpanel" aria-labelledby="flag-detail-tabs-tab-details" tabIndex={0} className="space-y-4 pt-3"><div><div className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">Environment</div><p className="mb-2 text-[11px] text-[var(--color-muted-foreground)]">Pilih environment tempat flag aktif. Hentikan darurat mengesampingkan pilihan ini.</p><div className="grid gap-1.5">{ENVS.map((env) => <div key={env} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"><span>{env}</span><Switch checked={selected.environments?.[env] === true} disabled={!!selected.archived} aria-label={`Ubah environment ${env}`} onChange={(value) => toggleMut.mutate({ flag: selected, patch: { environments: { ...(selected.environments || {}), [env]: value } } })} /></div>)}</div></div><Field label="Persentase rollout" help="Persentase pengguna yang menerima flag secara bertahap."><Input type="number" min={0} max={100} disabled={!!selected.archived} value={selected.rollout_percent ?? 100} onChange={(event) => toggleMut.mutate({ flag: selected, patch: { rollout_percent: Number(event.target.value) } })} /></Field><Field label="Masa berlaku (detik)">{selected.ttl_seconds ?? "—"}</Field><Field label="Berakhir otomatis pada">{selected.scheduled_expire_at ? new Date(selected.scheduled_expire_at * 1000).toLocaleString("id-ID") : "—"}</Field><Field label="User yang selalu diizinkan">{(selected.users_whitelist || []).length ? selected.users_whitelist!.join(", ") : "—"}</Field><Field label="User yang selalu diblokir">{(selected.users_blacklist || []).length ? selected.users_blacklist!.join(", ") : "—"}</Field>
          <section aria-labelledby="relationship-heading" className="rounded-md border border-[var(--color-border)] p-3"><div className="flex items-center justify-between gap-3"><div><h3 id="relationship-heading" className="text-sm font-medium">Relationship</h3><p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">Induk dan semua prasyarat adalah gerbang evaluasi. Cakupan efektif ditentukan server.</p></div>{impactQuery.isFetching && <span className="text-xs text-[var(--color-muted-foreground)]">Memuat dampak…</span>}</div>{impactQuery.isError && <p role="alert" className="mt-3 text-sm text-[var(--color-destructive)]">Dampak relationship tidak dapat dimuat. Coba lagi sebelum tindakan lifecycle.</p>}{!impactQuery.isLoading && !impactQuery.isError && <div className="mt-3 space-y-3 text-sm"><RelationshipRecord label="Flag induk" flag={impact?.effective_parent} fallback={selected.parent_key || "Tidak ada"} onOpen={openFlagByKey} /><div><div className="text-xs font-medium text-[var(--color-muted-foreground)]">Prasyarat</div>{(impact?.prerequisites || []).length ? <ul className="mt-1 space-y-1">{impact!.prerequisites!.map((flag) => <li key={flag.key}><RelatedFlagButton flag={flag} onOpen={openFlagByKey} /></li>)}</ul> : <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Tidak ada prasyarat yang terselesaikan.</p>}</div><div><div className="text-xs font-medium text-[var(--color-muted-foreground)]">Dipakai langsung oleh</div>{impactDependents.length ? <ul className="mt-1 space-y-1">{impactDependents.map((dependent, index) => <li key={`${dependent.key}-${dependent.scope_id}-${index}`} className="flex items-center gap-2"><button type="button" onClick={() => openFlagByKey(dependent.key, dependent)} className="font-mono text-xs text-[var(--color-primary)] hover:underline">{dependent.key}</button><span className="text-xs text-[var(--color-muted-foreground)]">sebagai {dependent.relationship === "parent" ? "induk" : "prasyarat"} · {scopeLabel(dependent.scope_type, dependent.scope_id)}</span></li>)}</ul> : <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Belum ada flag yang bergantung langsung pada flag ini.</p>}</div></div>}<details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Ubah relationship</summary><div className="mt-3 grid gap-3"><div><label htmlFor="edit-parent" className="text-xs font-medium text-[var(--color-muted-foreground)]">Flag induk</label><select id="edit-parent" disabled={!!selected.archived} className="mt-1 w-full rounded-md border bg-transparent px-2 py-2 text-sm" value={editParent} onChange={(event) => { setEditParent(event.target.value); setEditPrerequisites((current) => current.filter((item) => item !== event.target.value)); setRelationshipError(null); }}><option value="">Tanpa flag induk</option>{flags.filter((flag) => flag.key !== selected.key).map((flag) => <option key={flag.key} value={flag.key}>{flag.key}</option>)}</select></div><div><label htmlFor="edit-prerequisites" className="text-xs font-medium text-[var(--color-muted-foreground)]">Prasyarat</label><select id="edit-prerequisites" multiple disabled={!!selected.archived} size={Math.min(5, Math.max(3, relatedOptions.length))} className="mt-1 w-full rounded-md border bg-transparent px-2 py-1 text-sm" value={editPrerequisites} onChange={(event) => { setEditPrerequisites(Array.from(event.currentTarget.selectedOptions, (option) => option.value)); setRelationshipError(null); }}>{relatedOptions.map((flag) => <option key={flag.key} value={flag.key}>{flag.key}</option>)}</select></div>{relationshipError && <p role="alert" className="text-sm text-[var(--color-destructive)]">{relationshipError}</p>}<div><Button size="sm" onClick={() => validateEdit() && relationshipMut.mutate({ flag: selected, parent_key: editParent || null, prerequisites: editPrerequisites })} disabled={selected.archived || relationshipMut.isPending}>Simpan relationship</Button></div></div></details></section>
          <details className="rounded-md border border-[var(--color-warning)]/35 bg-[var(--color-warning)]/5 p-3"><summary className="cursor-pointer text-sm font-medium">Keamanan & lifecycle</summary><div className="mt-3 space-y-3"><p className="text-xs text-[var(--color-muted-foreground)]">Tindakan lifecycle menggunakan pemeriksaan dampak server. Flag yang dipulihkan kembali dalam keadaan nonaktif.</p>{impactQuery.isLoading && <p className="text-sm text-[var(--color-muted-foreground)]">Memuat dampak dependensi…</p>}{impactQuery.isError && <p role="alert" className="text-sm text-[var(--color-destructive)]">Tidak dapat memeriksa dampak dependensi. Coba lagi sebelum melanjutkan.</p>}{impactDependents.length > 0 && <div role="alert" className="rounded-md border border-[var(--color-warning)]/50 p-2 text-xs text-[var(--color-warning)]"><strong>{impactDependents.length} flag bergantung langsung pada flag ini.</strong> Arsip dan hapus permanen akan diblokir sampai relasinya dilepas. Hentikan darurat juga dapat menghentikan evaluasi mereka.</div>}<div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-medium">Hentikan darurat</div><p className="text-xs text-[var(--color-muted-foreground)]">Konsekuensi dominan: flag selalu nonaktif, mengesampingkan environment dan rollout.</p></div><Switch checked={!!selected.kill_switch} disabled={!!selected.archived} aria-label={`Hentikan darurat ${selected.key}`} onChange={(value) => value ? setKillPending(selected) : toggleMut.mutate({ flag: selected, patch: { kill_switch: false } })} /></div>{killPending?.key === selected.key && sameScope(killPending, selected) && <div role="alert" className="rounded-md border border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 p-3"><p className="text-sm font-medium">Aktifkan Hentikan darurat?</p><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{impactDependents.length ? `Flag ini dipakai oleh ${impactDependents.length} flag; evaluasi terkait juga dapat terhenti.` : "Evaluasi flag akan langsung dihentikan untuk semua environment."}</p><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => setKillPending(null)}>Batal</Button><Button size="sm" onClick={() => { toggleMut.mutate({ flag: selected, patch: { kill_switch: true } }); setKillPending(null); }}>Hentikan darurat</Button></div></div>}<div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">{selected.archived ? <><Button size="sm" onClick={() => restoreMut.mutate(selected)} disabled={restoreMut.isPending}>Pulihkan dari arsip</Button><Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" onClick={() => { setDeleteFlag(selected); setDeleteTypedKey(""); }}><Trash className="h-3.5 w-3.5" /> Hapus permanen</Button></> : <Button size="sm" variant="outline" onClick={() => setArchiveFlag(selected)} disabled={archiveMut.isPending || impactQuery.isLoading}>Arsipkan flag</Button>}</div></div></details>
        </div>}
        {panelTab === "audit" && <div id="flag-detail-tabs-panel-audit" role="tabpanel" aria-labelledby="flag-detail-tabs-tab-audit" tabIndex={0}><h4 className="pt-3 text-sm font-medium">Riwayat perubahan</h4>{flagAuditQuery.isLoading && <p className="pt-3 text-sm text-[var(--color-muted-foreground)]">Memuat riwayat perubahan flag…</p>}{flagAuditQuery.isError && <p role="alert" className="pt-3 text-sm text-[var(--color-destructive)]">Riwayat perubahan flag tidak dapat dimuat. Coba lagi.</p>}{!flagAuditQuery.isLoading && !flagAuditQuery.isError && <AuditTimeline entries={selectedAudit} emptyCopy="Belum ada riwayat perubahan untuk flag ini." />}</div>}
        {panelTab === "preview" && <div id="flag-detail-tabs-panel-preview" role="tabpanel" aria-labelledby="flag-detail-tabs-tab-preview" tabIndex={0} className="space-y-3 pt-3"><p className="text-sm text-[var(--color-muted-foreground)]">Pratinjau ini tidak mengubah state flag. Evaluasi mengikuti environment dan user yang dipilih.</p><div className="flex flex-wrap gap-2"><div className="min-w-36"><label htmlFor="preview-env" className="mb-1 block text-xs text-[var(--color-muted-foreground)]">Environment</label><select id="preview-env" className="w-full rounded-md border bg-transparent px-2 py-2 text-sm" value={previewEnv} onChange={(event) => setPreviewEnv(event.target.value)}>{ENVS.map((env) => <option key={env} value={env}>{env}</option>)}</select></div><div className="flex-1"><label htmlFor="preview-user" className="mb-1 block text-xs text-[var(--color-muted-foreground)]">User (opsional)</label><Input id="preview-user" value={previewUser} onChange={(event) => setPreviewUser(event.target.value)} placeholder="Gunakan user Anda bila kosong" /></div></div><Button size="sm" onClick={() => previewMut.mutate({ flag: selected, env: previewEnv, user: previewUser })} disabled={previewMut.isPending}>Evaluasi pratinjau</Button>{previewResult && <div className="space-y-3 rounded-md border border-[var(--color-border)] p-3"><div><div className="flex items-center gap-2"><Badge variant={evaluationStatusLabel(previewResult) === "Aktif" ? "success" : "destructive"}>{evaluationStatusLabel(previewResult)}</Badge><span className="text-sm font-medium">{evaluationReasonLabel(previewResult.reason)}</span></div>{evaluationReasonExplanation(previewResult.reason) && <p className="mt-1 text-xs text-[var(--color-warning)]">{evaluationReasonExplanation(previewResult.reason)}</p>}<p className="mt-2 text-xs text-[var(--color-muted-foreground)]">Sumber: {readableSource(previewResult.source)} · Cakupan: {readableScopeValue(previewResult.matched_scope)}</p>{previewResult.requires && <p className="mt-1 text-xs text-[var(--color-warning)]">Prasyarat yang perlu dipenuhi: {previewResult.requires}</p>}</div><div><h4 className="text-xs font-medium text-[var(--color-muted-foreground)]">Jejak gerbang evaluasi</h4>{(previewResult.trace || []).length ? <ol className="mt-2 space-y-1">{previewResult.trace!.map((node, index) => <li key={`${node.key}-${node.relationship}-${index}`} className="flex flex-wrap items-center gap-2 rounded border border-[var(--color-border)] px-2 py-1.5 text-xs"><span className="font-mono text-[var(--color-muted-foreground)]">{index + 1}</span>{node.key && flags.some((flag) => flag.key === node.key) ? <button type="button" className="font-mono text-[var(--color-primary)] hover:underline" onClick={() => openFlagByKey(node.key!)}>{node.key}</button> : <code>{node.key || "Flag tidak diketahui"}</code>}<span>{node.relationship === "parent" ? "cek induk" : node.relationship === "prerequisite" ? "cek prasyarat" : "flag tujuan"}</span><span className="text-[var(--color-muted-foreground)]">{node.scope ? readableScopeValue(node.scope) : "—"}</span></li>)}</ol> : <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">Jejak evaluasi tidak tersedia.</p>}</div></div>}</div>}
      </div>}
    </Drawer>
    <ConfirmDialog open={!!deleteFlag} title="Verifikasi penghapusan permanen" description={<span>Ketik tepat <code className="font-mono">{deleteFlag?.key}</code> untuk melanjutkan ke konfirmasi akhir. Server akan memeriksa status arsip dan dependensi pada cakupan record ini.</span>} initialFocusRef={deleteInputRef} confirmLabel="Lanjutkan" cancelLabel="Batal" variant="destructive" confirmDisabled={deleteTypedKey !== deleteFlag?.key} onConfirm={() => deleteFlag && setDeleteConfirmFlag(deleteFlag)} onCancel={() => { setDeleteFlag(null); setDeleteTypedKey(""); }}><label htmlFor="delete-typed-key" className="block text-xs font-medium text-[var(--color-muted-foreground)]">Key flag</label><Input ref={deleteInputRef} id="delete-typed-key" className="mt-1" value={deleteTypedKey} onChange={(event) => setDeleteTypedKey(event.target.value)} autoComplete="off" /><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Konfirmasi hanya aktif bila key sama persis.</p></ConfirmDialog>
    <ConfirmDialog open={!!archiveFlag} title="Arsipkan feature flag?" description={<span>Flag <code className="font-mono">{archiveFlag?.key}</code> akan dinonaktifkan. Pemeriksaan dependensi dilakukan oleh server untuk cakupan record ini.</span>} confirmLabel="Arsipkan flag" cancelLabel="Batal" variant="destructive" busyLabel="Mengarsipkan…" busy={archiveMut.isPending} onConfirm={() => archiveFlag && archiveMut.mutate(archiveFlag)} onCancel={() => setArchiveFlag(null)} />
    <ConfirmDialog open={!!deleteConfirmFlag} title="Hapus feature flag secara permanen?" description={<span>Flag <code className="font-mono">{deleteConfirmFlag?.key}</code> dan konfigurasi registry pada cakupan ini akan dihapus permanen. Server tetap memeriksa status arsip dan dependensi.</span>} confirmLabel="Hapus permanen" cancelLabel="Batal" variant="destructive" busyLabel="Menghapus…" busy={deleteMut.isPending} onConfirm={() => deleteConfirmFlag && deleteMut.mutate(deleteConfirmFlag)} onCancel={() => setDeleteConfirmFlag(null)} />
    <ConfirmDialog open={!!rollbackFlag} title="Kembalikan konfigurasi sebelumnya?" description={`Konfigurasi flag "${rollbackFlag?.key ?? ""}" pada cakupan record ini akan dikembalikan ke versi sebelumnya dan membuat entri audit baru.`} confirmLabel="Kembalikan konfigurasi" cancelLabel="Batal" busyLabel="Memproses…" busy={rollbackMut.isPending} onConfirm={() => rollbackFlag && rollbackMut.mutate(rollbackFlag)} onCancel={() => setRollbackFlag(null)} />
  </div>;
}

function RelatedFlagButton({ flag, onOpen }: { flag: FlagType; onOpen: (key: string, targetScope?: Pick<FlagType, "scope_type" | "scope_id">) => void }) {
  return <div className="flex flex-wrap items-center gap-2"><button type="button" className="font-mono text-xs text-[var(--color-primary)] hover:underline" onClick={() => onOpen(flag.key, flag)}>{flag.key}</button><Badge>{statusLabel(flag)}</Badge><span className="text-xs text-[var(--color-muted-foreground)]">{scopeLabel(flag.scope_type, flag.scope_id, flag.scope_name, flag.project_name, flag.organization_name)}</span></div>;
}
function RelationshipRecord({ label, flag, fallback, onOpen }: { label: string; flag?: FlagType | null; fallback: string; onOpen: (key: string, targetScope?: Pick<FlagType, "scope_type" | "scope_id">) => void }) {
  return <div><div className="text-xs font-medium text-[var(--color-muted-foreground)]">{label}</div>{flag ? <div className="mt-1"><RelatedFlagButton flag={flag} onOpen={onOpen} /></div> : <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{fallback}</p>}</div>;
}
function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return <div><div className="mb-1 text-xs font-medium text-[var(--color-muted-foreground)]">{label}</div>{help && <p className="mb-1 text-[11px] text-[var(--color-muted-foreground)]">{help}</p>}<div className="text-sm">{children}</div></div>;
}
