import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RiAddLine as Plus, RiDeleteBinLine as Trash2, RiKey2Line as Key } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type SA = { id: string; name: string; roles: string[]; expires_at?: number | null; revoked?: boolean };

export function ServiceAccountsCard() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<string[]>(["readonly"]);
  const [expires, setExpires] = useState("30");
  const [newToken, setNewToken] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["service-accounts"],
    queryFn: () => api<{ service_accounts: SA[] }>("GET", "/api/service-accounts"),
  });
  const sas = q.data?.service_accounts ?? [];

  const toggleRole = (r: string) =>
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const create = async () => {
    if (!name.trim()) return toast.error("Name required");
    const res = await api<{ token: string }>("POST", "/api/service-accounts", {
      name: name.trim(), roles, expires_days: Number(expires) || 0,
    });
    setNewToken(res.token);
    setName("");
    qc.invalidateQueries({ queryKey: ["service-accounts"] });
  };

  const remove = async (id: string) => {
    await api("DELETE", `/api/service-accounts/${id}`, {});
    toast.success("Service account revoked");
    qc.invalidateQueries({ queryKey: ["service-accounts"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" /> Service Accounts</CardTitle>
        <p className="text-sm text-[var(--color-muted-foreground)]">Programmatic tokens for CI/integrations. Tokens are shown once.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Input placeholder="Name (e.g. ci-deploy)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap gap-2 items-center">
            {["admin", "readonly", "operator"].map((r) => (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={roles.includes(r) ? "default" : "outline"}
                onClick={() => toggleRole(r)}
                aria-pressed={roles.includes(r)}
              >
                {r}
              </Button>
            ))}
            <Input type="number" className="w-24" value={expires} onChange={(e) => setExpires(e.target.value)} placeholder="days" title="Expiry days (0 = never)" />
            <Button size="sm" onClick={create}><Plus className="h-4 w-4" /> Create</Button>
          </div>
          {newToken && (
            <div className="rounded-lg border border-[var(--color-success)] bg-[var(--color-muted)] p-3">
              <div className="text-xs font-medium mb-1">Token (copy now — shown once):</div>
              <code className="font-mono text-xs break-all">{newToken}</code>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => { navigator.clipboard?.writeText(newToken); toast.success("Copied"); }}>Copy</Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {sas.length === 0 && <div className="text-sm text-[var(--color-muted-foreground)]">No service accounts.</div>}
          {sas.map((sa) => (
            <div key={sa.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{sa.name}</div>
                <div className="flex gap-1 mt-1">
                  {(sa.roles || []).map((r) => <Badge key={r} className="text-[10px]">{r}</Badge>)}
                  {sa.revoked && <Badge variant="destructive" className="text-[10px]">revoked</Badge>}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => remove(sa.id)} aria-label="Revoke service account"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
