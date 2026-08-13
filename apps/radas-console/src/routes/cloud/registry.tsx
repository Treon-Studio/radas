import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RiCodeBoxLine as CodeBox, RiDownload2Line as Download, RiDeleteBinLine as Trash,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

export const Route = createFileRoute("/cloud/registry")({ component: RegistryPage });

type RegistryItem = { name: string; type: string; version: string; description: string; tags: string[] };
type InstalledItem = { name: string; type: string; version: string; installed_at: number; files_copied: string[] };

const TYPE_LABEL: Record<string, string> = { "tofu-block": "OpenTofu block", "ansible-role": "Ansible role" };

function RegistryPage() {
  const qc = useQueryClient();
  const { data: cat } = useQuery({ queryKey: ["registry"], queryFn: () => api<{ items: RegistryItem[] }>("GET", "/api/registry") });
  const { data: stacks } = useQuery({ queryKey: ["stacks"], queryFn: () => api<{ stacks: { name: string }[] }>("GET", "/api/cloud/stacks") });
  const [target, setTarget] = useState("");
  const [selected, setSelected] = useState<RegistryItem | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["registry"] });
    qc.invalidateQueries({ queryKey: ["registry-installed"] });
  };

  const loadInstalled = () => {
    if (!target) return Promise.resolve({ installed: [] as InstalledItem[] });
    return api<{ installed: InstalledItem[] }>("GET", `/api/registry/installed?stack=${encodeURIComponent(target)}`);
  };

  const { data: installed } = useQuery({
    queryKey: ["registry-installed", target],
    queryFn: loadInstalled,
    enabled: !!target,
  });

  const installMut = useMutation({
    mutationFn: () => api("POST", `/api/registry/${encodeURIComponent(selected!.name)}/install`, { stack: target }),
    onSuccess: () => { toast.success(`${selected?.name} di-copy ke stack ${target}`); invalidate(); setSelected(null); },
    onError: (e: any) => toast.error(e?.message || "Install gagal"),
  });

  const uninstallMut = useMutation({
    mutationFn: (name: string) => api("POST", `/api/registry/${encodeURIComponent(name)}/uninstall`, { stack: target }),
    onSuccess: () => { toast.success("Di-uninstall"); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Uninstall gagal"),
  });

  const items = cat?.items ?? [];
  const stackNames = (stacks?.stacks ?? []).map((s) => s.name);

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Cloud" }, { label: "Code Registry" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-semibold flex items-center gap-2">
            <CodeBox className="h-5 w-5" /> Code Registry
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Bring Your Own Code: kode modul IaC &amp; role Ansible disimpan di registry, di-copy ke stack saat di-install (shadcn-style).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Target stack</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Select value={target} onChange={setTarget} placeholder="Pilih stack tujuan install…" className="w-72"
            options={stackNames.map((s) => ({ value: s, label: s }))} />
          {stackNames.length === 0 && (
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
              Create a cloud stack first before installing registry code.
            </p>
          )}
        </CardContent>
      </Card>

      {items.length === 0 && (
        <div className="text-sm text-[var(--color-muted-foreground)]">Registry kosong. Tambahkan item ke <code className="font-mono">server/registry/</code>.</div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((it) => (
          <Card key={`${it.type}:${it.name}`}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CodeBox className="h-4 w-4" /> {it.name}
                <Badge variant={it.type === "tofu-block" ? "success" : "warning"}>{TYPE_LABEL[it.type]}</Badge>
                <span className="text-[10px] font-mono text-[var(--color-muted-foreground)]">v{it.version}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 text-sm">
              <p className="text-[var(--color-muted-foreground)]">{it.description}</p>
              <div className="flex flex-wrap gap-1">
                {it.tags.map((t) => <span key={t} className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-mono">{t}</span>)}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setSelected(it); installMut.mutate(); }}
                  disabled={!target || installMut.isPending}>
                  <Download className="h-3.5 w-3.5" /> Install
                </Button>
                {target && (installed?.installed ?? []).some((i) => i.name === it.name) && (
                  <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]"
                    onClick={() => uninstallMut.mutate(it.name)}>
                    <Trash className="h-3.5 w-3.5" /> Uninstall
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {target && (installed?.installed ?? []).length > 0 && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Installed di {target}</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-1.5 text-xs">
            {(installed?.installed ?? []).map((i) => (
              <div key={i.name} className="flex items-center gap-2 border-b border-[var(--color-border)] last:border-0 py-1.5">
                <Badge variant="success">✓</Badge>
                <span className="font-mono">{i.name}</span>
                <span className="text-[var(--color-muted-foreground)]">v{i.version} · {i.files_copied.length} file</span>
                <span className="ml-auto text-[var(--color-muted-foreground)]">
                  {new Date(i.installed_at * 1000).toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}