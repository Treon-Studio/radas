import { useEffect, useState } from "react";
import { RiGitPullRequestLine as PullRequest, RiAddLine as Plus, RiDeleteBinLine as Trash, RiRefreshLine as Refresh } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

type Preview = {
  name: string;
  base_stack: string;
  pr_number: number;
  repo: string;
  status: string;
  execution_id?: string;
};

export function PreviewEnvsCard({ baseStack }: { baseStack: string }) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [prNumber, setPrNumber] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api<{ previews: Preview[] }>("GET", "/api/preview-envs");
      setPreviews(res.previews.filter((p) => p.base_stack === baseStack));
    } catch {
      setPreviews([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseStack]);

  const createPreview = async () => {
    const n = Number(prNumber);
    if (!Number.isInteger(n) || n <= 0) return toast.error("PR number harus angka positif");
    setBusy(true);
    try {
      await api("POST", "/api/preview-envs", { base_stack: baseStack, pr_number: n });
      toast.success(`Preview pr-${n} dibuat, apply di-queue`);
      setPrNumber("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat preview");
    } finally {
      setBusy(false);
    }
  };

  const refreshPreview = async (name: string) => {
    const pr = previews.find((p) => p.name === name)?.pr_number;
    if (!pr) return;
    setBusy(true);
    try {
      await api("POST", "/api/preview-envs", { base_stack: baseStack, pr_number: pr, refresh: true });
      toast.success(`${name} di-refresh (apply di-queue)`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Gagal refresh preview");
    } finally {
      setBusy(false);
    }
  };

  const teardownPreview = async (name: string) => {
    setBusy(true);
    try {
      const res = await api<{ preview: Preview }>("DELETE", `/api/preview-envs/${encodeURIComponent(name)}`);
      toast.success(`Teardown: ${res.preview.status}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Gagal teardown preview");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <PullRequest className="h-4 w-4" /> Preview Environments (per PR)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex gap-2">
          <Input value={prNumber} onChange={(e) => setPrNumber(e.target.value)}
            placeholder="PR number" inputMode="numeric" className="w-32" />
          <Button size="sm" onClick={createPreview} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> Create preview
          </Button>
        </div>
        {previews.length === 0 && (
          <div className="text-xs text-[var(--color-muted-foreground)]">
            Belum ada preview env. Masukkan nomor PR untuk membuat environment sementara dari stack ini.
          </div>
        )}
        {previews.map((p) => (
          <div key={p.name} className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs">
            <div className="min-w-0">
              <div className="font-medium">{p.name} <span className="text-[var(--color-muted-foreground)]">(PR #{p.pr_number})</span></div>
              <div className="flex items-center gap-2 text-[var(--color-muted-foreground)]">
                <span className={`h-1.5 w-1.5 rounded-full ${p.status === "active" ? "bg-[var(--color-success)]" : p.status === "tearing_down" ? "bg-[var(--color-warning)]" : "bg-[var(--color-muted-foreground)]"}`} />
                {p.status}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => refreshPreview(p.name)} disabled={busy} aria-label={`Refresh ${p.name}`}>
                <Refresh className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]"
                onClick={() => teardownPreview(p.name)} disabled={busy} aria-label={`Teardown ${p.name}`}>
                <Trash className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
