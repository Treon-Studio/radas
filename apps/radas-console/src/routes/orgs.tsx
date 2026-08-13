import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RiTeamLine as Team, RiAddLine as Plus, RiUserAddLine as UserAdd, RiDeleteBinLine as Trash, RiPencilLine as Pencil } from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

export const Route = createFileRoute("/orgs")({ component: OrgsPage });

type Org = { id: string; name: string; role: string };
type Member = { user_id: string; role: string; username: string | null; email: string | null };

const ROLES = ["owner", "admin", "member", "readonly"];

function OrgsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["orgs"], queryFn: () => api<{ orgs: Org[] }>("GET", "/api/orgs") });
  const [name, setName] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState("member");

  const orgs = data?.orgs ?? [];
  const active = selectedOrg || orgs[0]?.id || "";

  const { data: members } = useQuery({
    queryKey: ["org-members", active],
    queryFn: () => api<{ members: Member[] }>("GET", `/api/orgs/${active}/members`),
    enabled: !!active,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["orgs"] });
    qc.invalidateQueries({ queryKey: ["org-members"] });
  };

  const createOrg = useMutation({
    mutationFn: () => api("POST", "/api/orgs", { name }),
    onSuccess: () => { toast.success("Org dibuat"); setName(""); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Gagal buat org"),
  });

  const addMember = useMutation({
    mutationFn: () => api("POST", `/api/orgs/${active}/members`, { user_id: newUserId, role: newRole }),
    onSuccess: () => { toast.success("Member ditambahkan"); setNewUserId(""); invalidate(); },
    onError: (e: any) => toast.error(e?.message || "Gagal tambah member"),
  });

  const setRole = useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: string }) => api("PATCH", `/api/orgs/${active}/members/${uid}`, { role }),
    onSuccess: () => { invalidate(); toast.success("Role diubah"); },
  });

  const removeMember = useMutation({
    mutationFn: (uid: string) => api("DELETE", `/api/orgs/${active}/members/${uid}`),
    onSuccess: () => { invalidate(); toast.success("Member dihapus"); },
  });

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Settings" }, { label: "Organizations" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-semibold flex items-center gap-2">
            <Team className="h-5 w-5" /> Organizations
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Multi-tenant: kelola org, anggota, dan peran per org.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama org baru…" className="w-64" />
        <Button size="sm" onClick={() => createOrg.mutate()} disabled={!name.trim() || createOrg.isPending}>
          <Plus className="h-3.5 w-3.5" /> Create org
        </Button>
      </div>

      {orgs.length === 0 && (
        <div className="text-sm text-[var(--color-muted-foreground)]">Belum ada org. Buat org pertama untuk mulai multi-tenant.</div>
      )}

      <div className="flex gap-2 flex-wrap">
        {orgs.map((o) => (
          <button key={o.id} onClick={() => setSelectedOrg(o.id)}
            className={`rounded-md border px-3 py-1.5 text-sm ${active === o.id ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)]/40" : "hover:bg-[var(--color-muted)]/50"}`}>
            {o.name} <Badge variant="default">{o.role}</Badge>
          </button>
        ))}
      </div>

      {active && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Members</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-1.5 text-sm">
              {(members?.members ?? []).map((m) => (
                <div key={m.user_id} className="flex items-center gap-2 border-b border-[var(--color-border)] last:border-0 py-1.5">
                  <span className="font-medium">{m.username || m.email || m.user_id}</span>
                  <Select value={m.role} onChange={(r) => setRole.mutate({ uid: m.user_id, role: r })}
                    options={ROLES.map((r) => ({ value: r, label: r }))} className="w-28" />
                  <Button size="sm" variant="ghost" className="ml-auto text-[var(--color-destructive)]"
                    onClick={() => removeMember.mutate(m.user_id)}>
                    <Trash className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Add member</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-2">
              <Input value={newUserId} onChange={(e) => setNewUserId(e.target.value)} placeholder="User ID" />
              <Select value={newRole} onChange={setNewRole} options={ROLES.map((r) => ({ value: r, label: r }))} className="w-32" />
              <Button size="sm" onClick={() => addMember.mutate()} disabled={!newUserId || addMember.isPending}>
                <UserAdd className="h-3.5 w-3.5" /> Add
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
