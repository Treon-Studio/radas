import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RiDownload2Line as Download, RiFileUploadLine as FileUp, RiCloseLine as X } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, getToken } from "@/lib/api";
import { STATIC_PROVIDERS, PROVIDER_LABELS } from "@/lib/providers";

function downloadExport(kind: "stacks" | "executions" | "cost", format: "json" | "csv") {
  const token = getToken();
  const pid = window.localStorage.getItem("current_project_id") || "_current";
  window.open(
    `/api/export/${kind}?format=${format}&access_token=${encodeURIComponent(token || "")}&project_id=${encodeURIComponent(pid)}`,
    "_blank",
  );
}

export function ExportButtons() {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => downloadExport("stacks", "json")}>
        <Download className="h-4 w-4" /> JSON
      </Button>
      <Button variant="outline" size="sm" onClick={() => downloadExport("stacks", "csv")}>
        <Download className="h-4 w-4" /> CSV
      </Button>
    </div>
  );
}

export function ImportStackButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("bytedc");
  const [tfvars, setTfvars] = useState("");
  const [state, setState] = useState("");

  const doImport = async () => {
    if (!name.trim()) return toast.error("Stack name required");
    try {
      await api("POST", "/api/cloud/stacks/import", { name: name.trim(), provider, tfvars, state_json: state });
      toast.success("Stack imported");
      setOpen(false);
      setName(""); setTfvars(""); setState("");
      qc.invalidateQueries({ queryKey: ["cloud", "stacks"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="h-4 w-4" /> Import
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4 sm:p-8" onClick={() => setOpen(false)}>
      <div className="bg-[var(--color-card)] text-[var(--color-card-foreground)] rounded-lg shadow-2xl w-full max-w-lg border border-[var(--color-border)] flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold">Import existing stack</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <label className="text-sm font-medium">Stack name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-stack" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Provider</label>
            <Select
              value={provider}
              onChange={setProvider}
              options={STATIC_PROVIDERS.filter((p) => p.enabled).map((p) => ({
                value: p.id, label: p.label || PROVIDER_LABELS[p.id] || p.id,
              }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">terraform.tfvars</label>
            <Textarea
              className="h-28 font-mono text-xs"
              value={tfvars}
              onChange={(e) => setTfvars(e.target.value)}
              placeholder={'env = "dev"\nproject_name = "demo"'}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">State JSON (optional)</label>
            <Textarea
              className="h-24 font-mono text-xs"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder='{"version":4,"resources":[]}'
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={doImport}>Import</Button>
        </div>
      </div>
    </div>
  );
}
