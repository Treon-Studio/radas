import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RiFlagLine as Flag, RiAddLine as Plus, RiDeleteBinLine as Trash,
  RiShieldFlashLine as Shield, RiRefreshLine as Refresh, RiCloseLine,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxInput } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
    onError: (e: any) => toast.error(e?.message || "Gagal membuat flag"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ k, patch }: { k: string; patch: Partial<FlagType> }) => api("PATCH", `/api/flags/${encodeURIComponent(k)}`, patch),
    onSuccess: () => { invalidate(); toast.success("Flag di-update"); },
    onError: (e: any) => toast.error(e?.message || "Gagal update flag"),
  });

  const deleteMut = useMutation({
    mutationFn: (k: string) => api("DELETE", `/api/flags/${encodeURIComponent(k)}`),
    onSuccess: () => { invalidate(); setDeleteKey(null); if (selected?.key === deleteKey) setSelected(null); toast.success("Flag dihapus"); },
    onError: (e: any) => toast.error(e?.message || "Gagal hapus flag"),
  });

  const rollbackMut = useMutation({
    mutationFn: (k: string) => api("POST", `/api/flags/${encodeURIComponent(k)}/rollback`),
    onSuccess: () => { invalidate(); setRollbackKey(null); setSelected(null); toast.success("Flag di-rollback"); },
    onError: (e: any) => toast.error(e?.message || "Gagal rollback flag"),
  });

  const previewMut = useMutation({
    mutationFn: (input: { key: string; env: string; user: string }) => api("POST", "/api/flags/evaluate", input),
    onSuccess: (result) => setPreviewResult(result),
    onError: (e: any) => toast.error(e?.message || "Gagal evaluate flag"),
  });

  const flags = data?.flags ?? [];
  const visibleFlags = flags.filter((flag) =>
    (!search || `${flag.key} ${flag.name} ${flag.description}`.toLowerCase().includes(search.toLowerCase())) &&
    (!tagFilter || flag.tags.includes(tagFilter)) &&
    (!envFilter || flag.environments?.[envFilter] === true) &&
    (!statusFilter || (statusFilter === "on" ? flag.enabled && !flag.kill_switch : statusFilter === "killed" ? flag.kill_switch : !flag.enabled))
  );
  const namespaces = [...new Set(visibleFlags.map((flag) => flag.namespace || "default"))];
  const auditQuery = useQuery({ queryKey: ["flags-audit"], queryFn: () => api<{ audit: any[] }>("GET", "/api/flags/audit?limit=100"), enabled: auditOpen });
  const flagAuditQuery = useQuery({
    queryKey: ["flag-audit", selected?.key],
    queryFn: () => api<{ audit: any[] }>("GET", `/api/flags/audit?limit=50&flag_key=${encodeURIComponent(selected!.key)}`),
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
            Progressive delivery & kill-switch untuk operasi infrastruktur (block_apply, block_destroy, rollout per env).
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAuditOpen((v) => !v)}>Audit</Button>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" /> {showForm ? "Close" : "New flag"}
          </Button>
        </div>
      </div>

      {showForm && (
        <VaulDrawer.Root open={showForm} onOpenChange={setShowForm} direction="right">
          <VaulDrawer.Portal>
            <VaulDrawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
            <VaulDrawer.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col bg-[var(--color-card)] border-l border-[var(--color-border)] shadow-[var(--shadow-popover)]">
              <VaulDrawer.Title className="sr-only">New flag</VaulDrawer.Title>
              <VaulDrawer.Description className="sr-only">Create a new feature flag</VaulDrawer.Description>
              <header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
                <span className="text-sm font-semibold">New flag</span>
                <button type="button" onClick={() => setShowForm(false)} aria-label="Close" className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-[var(--color-muted)]">
                  <RiCloseLine className="h-4 w-4" />
                </button>
              </header>
              <div className="flex-1 overflow-y-auto px-5 py-4 grid gap-3">
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Key (contoh: block_apply)</div>
              <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="block_apply" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Name</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Block all applies" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Description</div>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="h-16" placeholder="Kill-switch untuk semua operasi apply" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Rollout %</div>
              <Input type="number" min={0} max={100} value={rollout} onChange={(e) => setRollout(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Tags (comma)</div>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="safety, gate" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Users whitelist (comma)</div>
              <Input value={whitelist} onChange={(e) => setWhitelist(e.target.value)} placeholder="admin, devops" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <CheckboxInput checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <CheckboxInput checked={kill} onChange={(e) => setKill(e.target.checked)} /> Kill-switch (paksa off)
            </label>
              </div>
              <footer className="border-t border-[var(--color-border)] px-5 py-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending || key.trim().length < 2}>
                  Create flag
                </Button>
              </footer>
            </VaulDrawer.Content>
          </VaulDrawer.Portal>
        </VaulDrawer.Root>
      )}

      {isLoading && <div className="text-sm text-[var(--color-muted-foreground)]">Loading flags…</div>}
      {isError && <div className="rounded-md border border-[var(--color-destructive)]/40 p-3 text-sm text-[var(--color-destructive)]">Unable to load feature flags. Check API access and try again.</div>}
      {auditOpen && (
        <Card><CardHeader className="py-3"><CardTitle className="text-sm">Change audit</CardTitle></CardHeader><CardContent className="pt-0 space-y-2">{(auditQuery.data?.audit ?? []).length === 0 ? <p className="text-sm text-[var(--color-muted-foreground)]">No flag changes recorded.</p> : auditQuery.data!.audit.map((entry: any, index: number) => <div key={`${entry.at}-${index}`} className="border-b border-[var(--color-border)] py-2 text-xs"><b>{entry.key}</b> · {entry.actor} · {entry.at}<pre className="mt-1 whitespace-pre-wrap text-[var(--color-muted-foreground)]">{JSON.stringify(entry.changes, null, 2)}</pre></div>)}</CardContent></Card>
      )}
      <Card>
        <CardContent className="py-3 flex flex-wrap gap-2">
          <Input className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search flags…" />
          <select className="rounded-md border bg-transparent px-2 text-sm" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="">All tags</option>
            {[...new Set(flags.flatMap((flag) => flag.tags))].map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          <select className="rounded-md border bg-transparent px-2 text-sm" value={envFilter} onChange={(e) => setEnvFilter(e.target.value)}>
            <option value="">All environments</option>
            {ENVS.map((env) => <option key={env} value={env}>{env}</option>)}
          </select>
          <select className="rounded-md border bg-transparent px-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All status</option><option value="on">ON</option><option value="off">OFF</option><option value="killed">KILLED</option>
          </select>
        </CardContent>
      </Card>
      {flags.length === 0 && !isLoading && !isError && (
        <div className="text-sm text-[var(--color-muted-foreground)]">
          Belum ada flag. Buat flag pertama, misal <code className="font-mono">block_apply</code> untuk kill-switch apply.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {namespaces.map((namespace) => (
          <div key={namespace} className="contents">
            <div className="md:col-span-2 text-xs font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">{namespace}</div>
            {visibleFlags.filter((flag) => (flag.namespace || "default") === namespace).map((f) => (
          <Card key={f.id} className="cursor-pointer hover:border-[var(--color-primary)]/50 transition-colors" onClick={() => openFlag(f)}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Flag className="h-4 w-4" /> <code className="font-mono">{f.key}</code>
                <Badge variant={f.enabled && !f.kill_switch ? "success" : "destructive"}>
                  {f.kill_switch ? "KILLED" : f.enabled ? "ON" : "OFF"}
                </Badge>
                {f.rollout_percent < 100 && <Badge variant="warning">{f.rollout_percent}%</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 text-sm">
              <div className="text-[var(--color-muted-foreground)]">{f.description || "—"}</div>
              <div className="flex flex-wrap gap-1 text-[11px]"><Badge>{f.type || "release"}</Badge><Badge>{f.scope_type || "global"}</Badge>{f.reason && <span className="text-[var(--color-muted-foreground)]">{f.reason}</span>}</div>
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
        title={selected ? <span className="flex items-center gap-2"><code className="font-mono">{selected.key}</code><Badge variant={selected.enabled && !selected.kill_switch ? "success" : "destructive"}>{selected.kill_switch ? "KILLED" : selected.enabled ? "ON" : "OFF"}</Badge></span> : "Details"}
        footer={selected && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => toggleMut.mutate({ k: selected.key, patch: { enabled: !selected.enabled } })}>
              {selected.enabled ? "Disable" : "Enable"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => toggleMut.mutate({ k: selected.key, patch: { kill_switch: !selected.kill_switch } })}>
              {selected.kill_switch ? "Un-kill" : "Kill switch"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRollbackKey(selected.key)} disabled={rollbackMut.isPending}>
              <Refresh className="h-3.5 w-3.5" /> Rollback
            </Button>
            <Button size="sm" variant="ghost" className="text-[var(--color-destructive)] ml-auto" onClick={() => setDeleteKey(selected.key)}>
              <Trash className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      >
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-muted-foreground)]">{selected.description || "—"}</p>
            <div className="flex flex-wrap gap-1">
              <Badge>{selected.type || "release"}</Badge>
              <Badge>{selected.scope_type || "global"}{selected.scope_id ? `:${selected.scope_id}` : ""}</Badge>
              {selected.reason && <span className="text-xs text-[var(--color-muted-foreground)]">{selected.reason}</span>}
            </div>

            <Tabs<PanelTab>
              tabs={[
                { id: "details", label: "Details" },
                { id: "audit", label: "Audit" },
                { id: "preview", label: "Preview" },
              ]}
              active={panelTab}
              onChange={setPanelTab}
            />

            {panelTab === "details" && (
              <div className="space-y-4 pt-3">
                <div>
                  <div className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">Environments</div>
                  <div className="grid gap-1.5">
                    {ENVS.map((env) => (
                      <button
                        key={env}
                        type="button"
                        onClick={() => toggleMut.mutate({ k: selected.key, patch: { environments: { ...selected.environments, [env]: !selected.environments[env] } } })}
                        className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-muted)]/50"
                      >
                        <span>{env}</span>
                        <Badge variant={selected.environments[env] ? "success" : "default"}>{selected.environments[env] ? "ON" : "OFF"}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="Rollout %">
                  <Input type="number" min={0} max={100} value={selected.rollout_percent} onChange={(e) => toggleMut.mutate({ k: selected.key, patch: { rollout_percent: Number(e.target.value) } })} />
                </Field>
                <Field label="TTL seconds">{selected.ttl_seconds ?? "—"}</Field>
                <Field label="Scheduled expiry">{selected.scheduled_expire_at ? new Date(selected.scheduled_expire_at * 1000).toLocaleString() : "—"}</Field>
                <Field label="Whitelist">{selected.users_whitelist.length ? selected.users_whitelist.join(", ") : "—"}</Field>
                <Field label="Blacklist">{selected.users_blacklist.length ? selected.users_blacklist.join(", ") : "—"}</Field>
                <Field label="Prerequisites">{selected.prerequisites?.length ? selected.prerequisites.join(", ") : "—"}</Field>
                <Field label="Parent">{selected.parent_key || "—"}</Field>
              </div>
            )}

            {panelTab === "audit" && (
              <div className="pt-3 space-y-2">
                {selectedAudit.length === 0 ? <p className="text-sm text-[var(--color-muted-foreground)]">No changes recorded for this flag.</p> : selectedAudit.map((entry: any, index: number) => (
                  <div key={`${entry.at}-${index}`} className="rounded-md border border-[var(--color-border)] p-2 text-xs">
                    <div className="flex items-center gap-2"><Badge>{entry.changes?.operation || "change"}</Badge><span>{entry.actor}</span><span className="ml-auto text-[var(--color-muted-foreground)]">{entry.at}</span></div>
                    {entry.changes && <pre className="mt-1 whitespace-pre-wrap text-[var(--color-muted-foreground)]">{JSON.stringify(entry.changes, null, 2)}</pre>}
                  </div>
                ))}
              </div>
            )}

            {panelTab === "preview" && (
              <div className="pt-3 space-y-3">
                <div className="flex gap-2">
                  <Input value={previewEnv} onChange={(e) => setPreviewEnv(e.target.value)} placeholder="Environment" />
                  <Input value={previewUser} onChange={(e) => setPreviewUser(e.target.value)} placeholder="User" />
                </div>
                <Button size="sm" onClick={() => previewMut.mutate({ key: selected.key, env: previewEnv, user: previewUser })} disabled={previewMut.isPending}>
                  Evaluate
                </Button>
                {previewResult && (
                  <div className="rounded-md border border-[var(--color-border)] p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={previewResult.enabled ? "success" : "destructive"}>{previewResult.enabled ? "ENABLED" : "DISABLED"}</Badge>
                      <span className="text-sm font-medium">{previewResult.reason}</span>
                    </div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">source: {previewResult.source} · matched: {previewResult.matched_scope}</div>
                    {previewResult.requires && <div className="text-xs text-[var(--color-warning)]">requires: {previewResult.requires}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={!!deleteKey}
        title="Delete flag"
        description={`Delete flag "${deleteKey}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        busy={deleteMut.isPending}
        onConfirm={() => deleteKey && deleteMut.mutate(deleteKey)}
        onCancel={() => setDeleteKey(null)}
      />
      <ConfirmDialog
        open={!!rollbackKey}
        title="Rollback flag"
        description={`Restore the previous version of "${rollbackKey}" from the audit trail?`}
        confirmLabel="Rollback"
        busy={rollbackMut.isPending}
        onConfirm={() => rollbackKey && rollbackMut.mutate(rollbackKey)}
        onCancel={() => setRollbackKey(null)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-[var(--color-muted-foreground)] mb-1">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
