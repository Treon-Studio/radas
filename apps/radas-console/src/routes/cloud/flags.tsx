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
  kill_switch: boolean;
  created_at: number;
  updated_at: number;
};

const ENVS = ["dev", "staging", "prod", "preview"];

function FlagsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["flags"], queryFn: () => api<{ flags: FlagType[] }>("GET", "/api/flags") });
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
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4" /> {showForm ? "Close" : "New flag"}
        </Button>
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

      {flags.length === 0 && (
        <div className="text-sm text-[var(--color-muted-foreground)]">
          Belum ada flag. Buat flag pertama, misal <code className="font-mono">block_apply</code> untuk kill-switch apply.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {flags.map((f) => (
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
    </div>
  );
}
