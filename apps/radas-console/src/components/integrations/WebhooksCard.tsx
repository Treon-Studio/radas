import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RiAddLine as Plus, RiDeleteBinLine as Trash2, RiSendPlaneLine as Send } from "@remixicon/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type Webhook = { id: string; url: string; events: string[]; enabled: boolean };

const EVENTS = ["run.finished", "stack.applied", "stack.drifted", "budget.alert"];

export function WebhooksCard() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["run.finished"]);

  const q = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api<{ webhooks: Webhook[] }>("GET", "/api/webhooks"),
  });
  const whs = q.data?.webhooks ?? [];

  const toggleEvent = (e: string) =>
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));

  const add = async () => {
    if (!url.trim()) return toast.error("URL required");
    await api("POST", "/api/webhooks", { url: url.trim(), events });
    setUrl("");
    toast.success("Webhook created");
    qc.invalidateQueries({ queryKey: ["webhooks"] });
  };

  const remove = async (id: string) => {
    await api("DELETE", `/api/webhooks/${id}`, {});
    toast.success("Webhook deleted");
    qc.invalidateQueries({ queryKey: ["webhooks"] });
  };

  const test = async (id: string) => {
    await api("POST", `/api/webhooks/${id}/test`, {});
    toast.success("Test event dispatched");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Outbound Webhooks</CardTitle>
        <p className="text-sm text-[var(--color-muted-foreground)]">Notify external services on run/stack/budget events.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Input placeholder="https://example.com/hook" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {EVENTS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggleEvent(e)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  events.includes(e)
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] border-transparent"
                    : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={add}>
            <Plus className="h-4 w-4" /> Add webhook
          </Button>
        </div>

        <div className="space-y-2">
          {whs.length === 0 && (
            <div className="text-sm text-[var(--color-muted-foreground)]">No webhooks yet.</div>
          )}
          {whs.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2">
              <div className="min-w-0">
                <div className="font-mono text-xs truncate">{w.url}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(w.events || []).map((e) => (
                    <Badge key={e} variant="default" className="text-[10px]">{e}</Badge>
                  ))}
                  <Badge variant={w.enabled ? "success" : "default"} className="text-[10px]">{w.enabled ? "enabled" : "disabled"}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={() => test(w.id)} aria-label="Test webhook"><Send className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="sm" onClick={() => remove(w.id)} aria-label="Delete webhook"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
