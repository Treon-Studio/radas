import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RiFlagLine as Flag, RiAddLine as Plus, RiDeleteBinLine as Trash,
  RiPencilLine as Pencil, RiShieldFlashLine as Shield,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxInput } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  const [editKey, setEditKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [envFilter, setEnvFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [preview, setPreview] = useState<{key: string; env: string; user: string} | null>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);

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
    onSuccess: () => { invalidate(); toast.success("Flag dihapus"); },
    onError: (e: any) => toast.error(e?.message || "Gagal hapus flag"),
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
  const previewMut = useMutation({
    mutationFn: (input: {key: string; env: string; user: string}) => api("POST", "/api/flags/evaluate", input),
    onSuccess: (result) => setPreviewResult(result),
  });

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
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">New flag</CardTitle></CardHeader>
          <CardContent className="pt-0 grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Key (contoh: block_apply)</div>
              <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="block_apply" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-[var(--color-muted-foreground)]">Name</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Block all applies" />
            </div>
            <div className="space-y-1 md:col-span-2">
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
            <div className="space-y-1 md:col-span-2">
              <div className="text-xs text-[var(--color-muted-foreground)]">Users whitelist (comma)</div>
              <Input value={whitelist} onChange={(e) => setWhitelist(e.target.value)} placeholder="admin, devops" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <CheckboxInput checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <CheckboxInput checked={kill} onChange={(e) => setKill(e.target.checked)} /> Kill-switch (paksa off)
            </label>
            <div className="md:col-span-2">
              <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending || key.trim().length < 2}>
                Create flag
              </Button>
            </div>
          </CardContent>
        </Card>
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
          <Card key={f.id}>
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
                  <button
                    key={e}
                    onClick={() => toggleMut.mutate({ k: f.key, patch: { environments: { ...f.environments, [e]: !f.environments[e] } } })}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${f.environments[e] ? "bg-[var(--color-success)]/10 border-[var(--color-success)]/40" : "opacity-40"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              {f.users_whitelist.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                  <Shield className="h-3 w-3" /> {f.users_whitelist.join(", ")}
                </div>
              )}
              {f.tags.length > 0 && (
                <div className="flex gap-1">{f.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>
              )}
              <div className="flex gap-1 pt-1">
                <Button size="sm" variant="outline" onClick={() => toggleMut.mutate({ k: f.key, patch: { enabled: !f.enabled } })}>
                  {f.enabled ? "Disable" : "Enable"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setPreview({ key: f.key, env: "prod", user: "" }); setPreviewResult(null); }}>Preview</Button>
                <Button size="sm" variant="outline" onClick={() => toggleMut.mutate({ k: f.key, patch: { kill_switch: !f.kill_switch } })}>
                  {f.kill_switch ? "Un-kill" : "Kill switch"}
                </Button>
                <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" onClick={() => deleteMut.mutate(f.key)}>
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
            ))}
          </div>
        ))}
      </div>
      {preview && <Card><CardHeader className="py-3"><CardTitle className="text-sm">Evaluation preview · {preview.key}</CardTitle></CardHeader><CardContent className="pt-0 space-y-2"><div className="flex gap-2"><Input value={preview.env} onChange={(e) => setPreview({...preview, env: e.target.value})} placeholder="Environment" /><Input value={preview.user} onChange={(e) => setPreview({...preview, user: e.target.value})} placeholder="User" /><Button size="sm" onClick={() => previewMut.mutate(preview)}>Evaluate</Button><Button size="sm" variant="outline" onClick={() => setPreview(null)}>Close</Button></div>{previewResult && <pre className="rounded bg-[var(--color-muted)] p-3 text-xs">{JSON.stringify(previewResult, null, 2)}</pre>}</CardContent></Card>}
    </div>
  );
}
