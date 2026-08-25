import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { RiRefreshLine as RefreshCw, RiArchiveStackLine as Boxes, RiCloseLine as X, RiNodeTree as Network, RiDownload2Line as Download, RiErrorWarningLine as AlertTriangle } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type VM = {
  hostname?: string; instance_id?: string; status?: string; az?: string;
  flavor_id?: string; image_id?: string;
  private_ip?: string; public_ip?: string | null; mac?: string;
  subnet_name?: string; subnet_cidr?: string; subnet_gateway?: string;
  vpc_name?: string; vpc_cidr?: string;
  security_groups?: string[];
  system_disk_type?: string; system_disk_size?: number;
};

type Inventory = {
  vms: VM[]; count: number; generated_at?: number; state_present?: boolean;
  message?: string;
};

export function VmInventoryDialog({ stackId, onClose }: { stackId: string; onClose: () => void }) {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["cloud", "stack", stackId, "inventory"],
    queryFn: () => api<Inventory>("GET", `/api/cloud/stacks/${encodeURIComponent(stackId)}/inventory`),
  });

  function downloadJson() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${stackId}-inventory.json`; a.click();
    URL.revokeObjectURL(url);
  }

  const vms = data?.vms || [];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in" onClick={onClose}>
      <div className="bg-[var(--color-card)] text-[var(--color-card-foreground)] pxl-corner-md shadow-xl w-full max-w-6xl border-2 border-[var(--color-border)] pxl-card-shadow overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <Boxes className="h-5 w-5" />
            <div>
              <h2 className="text-lg font-semibold">Inventory Resources · {stackId}</h2>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {data?.generated_at
                  ? `Last refreshed: ${new Date(data.generated_at * 1000).toLocaleString()}`
                  : "Parsed from terraform.tfstate · persisted snapshot"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={downloadJson} disabled={!data}>
              <Download className="h-4 w-4" /> Export JSON
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">Loading inventory…</div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-[var(--color-destructive)] flex flex-col items-center gap-2">
              <AlertTriangle className="h-6 w-6" />
              <span>{(error as Error).message}</span>
            </div>
          ) : vms.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)] flex flex-col items-center gap-2">
              <Network className="h-8 w-8 text-[var(--color-muted-foreground)] opacity-50" />
              <p className="font-medium">No VMs provisioned yet</p>
              <p className="text-xs text-[var(--color-muted-foreground)] max-w-sm">
                {data?.message || "Run Apply on this stack to provision infrastructure, then return here to see the VM inventory."}
              </p>
            </div>
          ) : (
            <>
              <div className="text-xs text-[var(--color-muted-foreground)] flex items-center justify-between">
                <span>{vms.length} instance(s) discovered</span>
                {data?.state_present === false && <Badge variant="warning">State uninitialized</Badge>}
              </div>
              <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--color-muted)] text-[var(--color-muted-foreground)] font-mono uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Hostname / ID</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">IP Addr</th>
                      <th className="px-3 py-2 font-medium">Subnet / VPC</th>
                      <th className="px-3 py-2 font-medium">AZ</th>
                      <th className="px-3 py-2 font-medium">Flavor</th>
                      <th className="px-3 py-2 font-medium">Disk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {vms.map((vm, i) => (
                      <tr key={vm.instance_id || i} className="hover:bg-[var(--color-muted)]/50">
                        <td className="px-3 py-2">
                          <div className="font-medium">{vm.hostname || "—"}</div>
                          <div className="text-[10px] font-mono text-[var(--color-muted-foreground)]">{vm.instance_id}</div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={vm.status?.toLowerCase() === "active" ? "success" : "default"}>
                            {vm.status || "unknown"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-mono">
                          <div>Priv: {vm.private_ip || "—"}</div>
                          {vm.public_ip && <div className="text-[var(--color-muted-foreground)]">Pub: {vm.public_ip}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Network className="h-3 w-3 shrink-0" />
                            <span>{vm.subnet_name || vm.vpc_name || "—"}</span>
                          </div>
                          {vm.subnet_cidr && <div className="text-[10px] font-mono text-[var(--color-muted-foreground)]">{vm.subnet_cidr}</div>}
                        </td>
                        <td className="px-3 py-2 font-mono">{vm.az || "—"}</td>
                        <td className="px-3 py-2 font-mono">{vm.flavor_id || "—"}</td>
                        <td className="px-3 py-2 font-mono">
                          {vm.system_disk_size ? `${vm.system_disk_size} GB` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
