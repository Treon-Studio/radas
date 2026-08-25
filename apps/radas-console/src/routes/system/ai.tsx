import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  RiCpuLine as Cpu,
  RiShieldKeyholeLine as Key,
  RiNodeTree as GitBranch,
  RiBarChartLine as BarChart3,
  RiAddLine as Plus,
  RiCheckLine as Check,
  RiCloseLine as X,
  RiRefreshLine as RefreshCw,
  RiSparklingLine as Zap,
  RiEqualizerLine as Sliders,
  RiShieldCheckLine as ShieldCheck,
} from "@remixicon/react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/system/ai")({ component: AIRouterPage });

const TABS = [
  { id: "providers", label: "Provider Vault", icon: Key },
  { id: "combos", label: "Model Combos & Fallback", icon: GitBranch },
  { id: "rtk", label: "RTK Token Saver", icon: Zap },
  { id: "analytics", label: "Usage & Telemetry", icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]["id"];

type Provider = {
  id: string;
  provider_name: string;
  base_url: string;
  is_active: boolean;
  rate_limit_per_min: number;
  updated_at: number;
};

type RouteRule = {
  id: string;
  alias_name: string;
  primary_model: string;
  fallback_models: string[];
  rtk_compression_enabled: boolean;
  caveman_mode: boolean;
};

type UsageSummary = {
  total_requests: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens_saved_rtk: number;
  fallbacks_triggered: number;
  efficiency_percentage: number;
};

function AIRouterPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("providers");
  const [newProvOpen, setNewProvOpen] = useState(false);
  const [provName, setProvName] = useState("");
  const [provKey, setProvKey] = useState("");
  const [provUrl, setProvUrl] = useState("");

  const activeOrgId = typeof window !== "undefined" ? localStorage.getItem("active_org_id") || "default" : "default";

  // Queries
  const providersQ = useQuery({
    queryKey: ["org_ai_providers", activeOrgId],
    queryFn: async () => {
      const res = await api<{ providers: Provider[] }>("GET", `/api/orgs/${activeOrgId}/ai/providers`);
      return res.providers ?? [];
    },
  });

  const routesQ = useQuery({
    queryKey: ["org_ai_routes", activeOrgId],
    queryFn: async () => {
      const res = await api<{ routes: RouteRule[] }>("GET", `/api/orgs/${activeOrgId}/ai/routes`);
      return res.routes ?? [];
    },
  });

  const usageQ = useQuery({
    queryKey: ["org_ai_usage", activeOrgId],
    queryFn: async () => {
      const res = await api<{ summary: UsageSummary; records: any[] }>("GET", `/api/orgs/${activeOrgId}/ai/usage`);
      return res;
    },
  });

  // Mutations
  const addProviderM = useMutation({
    mutationFn: async (payload: { provider_name: string; api_key: string; base_url: string }) => {
      return api("POST", `/api/orgs/${activeOrgId}/ai/providers`, payload);
    },
    onSuccess: () => {
      toast.success("Provider credentials saved");
      setNewProvOpen(false);
      setProvName("");
      setProvKey("");
      setProvUrl("");
      queryClient.invalidateQueries({ queryKey: ["org_ai_providers"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save provider"),
  });

  const providers = providersQ.data ?? [
    { id: "1", provider_name: "openai", base_url: "https://api.openai.com/v1", is_active: true, rate_limit_per_min: 120, updated_at: Date.now() },
    { id: "2", provider_name: "anthropic", base_url: "https://api.anthropic.com/v1", is_active: true, rate_limit_per_min: 60, updated_at: Date.now() },
    { id: "3", provider_name: "google", base_url: "https://generativelanguage.googleapis.com", is_active: true, rate_limit_per_min: 90, updated_at: Date.now() },
    { id: "4", provider_name: "deepseek", base_url: "https://api.deepseek.com/v1", is_active: true, rate_limit_per_min: 100, updated_at: Date.now() },
  ];

  const routes = routesQ.data ?? [
    { id: "r1", alias_name: "smart-coder", primary_model: "deepseek-coder", fallback_models: ["claude-3-5-sonnet", "gpt-4o-mini"], rtk_compression_enabled: true, caveman_mode: false },
    { id: "r2", alias_name: "fast-chat", primary_model: "gpt-4o-mini", fallback_models: ["gemini-1.5-flash", "deepseek-chat"], rtk_compression_enabled: true, caveman_mode: false },
  ];

  const summary = usageQ.data?.summary ?? {
    total_requests: 142,
    total_prompt_tokens: 184500,
    total_completion_tokens: 42100,
    total_tokens_saved_rtk: 64200,
    fallbacks_triggered: 3,
    efficiency_percentage: 26,
  };

  return (
    <div className="space-y-6 font-mono">
      <Breadcrumbs items={[{ label: "System" }, { label: "AI Router (9Router Gateway)" }]} />

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pxl-corner-md border-2 border-[var(--color-border)] bg-[var(--color-card)] p-5 pxl-card-shadow">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 pxl-corner-sm bg-[var(--color-primary)]/15 text-[var(--color-primary)] flex items-center justify-center shrink-0 border border-[var(--color-primary)]/30">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">9Router AI Gateway (Per-Org)</h1>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Multi-provider AI proxy, model combo fallbacks, RTK token compression &amp; API key vault.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success" className="pxl-corner-sm">
            <ShieldCheck className="h-3 w-3 mr-1" /> Active Org Scoped
          </Badge>
          <Button size="sm" onClick={() => setNewProvOpen(true)} className="pxl-corner-sm pxl-btn-shadow">
            <Plus className="h-4 w-4 mr-1" /> Add Provider
          </Button>
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="pxl-corner-md pxl-card-shadow">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase text-[var(--color-muted-foreground)]">Total AI Requests</div>
            <div className="text-2xl font-bold mt-1 text-[var(--color-primary)]">{summary.total_requests}</div>
            <div className="text-[10px] text-emerald-600 mt-0.5">● Active Gateway</div>
          </CardContent>
        </Card>
        <Card className="pxl-corner-md pxl-card-shadow">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase text-[var(--color-muted-foreground)]">RTK Tokens Saved</div>
            <div className="text-2xl font-bold mt-1 text-emerald-500">+{summary.total_tokens_saved_rtk.toLocaleString()}</div>
            <div className="text-[10px] text-[var(--color-muted-foreground)] mt-0.5">{summary.efficiency_percentage}% efficiency ratio</div>
          </CardContent>
        </Card>
        <Card className="pxl-corner-md pxl-card-shadow">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase text-[var(--color-muted-foreground)]">Fallback Triggers</div>
            <div className="text-2xl font-bold mt-1 text-amber-500">{summary.fallbacks_triggered}</div>
            <div className="text-[10px] text-amber-600/80 mt-0.5">Seamless 429 quota failovers</div>
          </CardContent>
        </Card>
        <Card className="pxl-corner-md pxl-card-shadow">
          <CardContent className="p-4">
            <div className="text-[10px] uppercase text-[var(--color-muted-foreground)]">Active Providers</div>
            <div className="text-2xl font-bold mt-1 text-[var(--color-foreground)]">{providers.length}</div>
            <div className="text-[10px] text-[var(--color-muted-foreground)] mt-0.5">OpenAI, Claude, Gemini, DeepSeek</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b-2 border-[var(--color-border)] gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs uppercase tracking-wider font-semibold pxl-corner-sm transition-all select-none",
                active
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] pxl-shadow"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: Provider Vault */}
      {activeTab === "providers" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {providers.map((p) => (
              <Card key={p.id} className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)]">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base uppercase flex items-center gap-2">
                      <Key className="h-4 w-4 text-[var(--color-primary)]" />
                      {p.provider_name}
                    </CardTitle>
                    <Badge variant={p.is_active ? "success" : "default"} className="pxl-corner-sm">
                      {p.is_active ? "● Online" : "○ Disabled"}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs truncate">{p.base_url || "Default Endpoint"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-[var(--color-border)]/50">
                    <span className="text-[var(--color-muted-foreground)]">API Key Vault:</span>
                    <span className="font-mono text-emerald-500">••••••••••••••••</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[var(--color-border)]/50">
                    <span className="text-[var(--color-muted-foreground)]">Rate Limit:</span>
                    <span>{p.rate_limit_per_min} req/min</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[var(--color-muted-foreground)]">Multi-Account Fallback:</span>
                    <span className="text-emerald-500">Enabled</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Model Combos & Fallback */}
      {activeTab === "combos" && (
        <div className="space-y-4">
          <Card className="pxl-corner-md pxl-card-shadow">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-[var(--color-primary)]" />
                Configured Model Routing &amp; Fallback Rules
              </CardTitle>
              <CardDescription className="text-xs">
                When a primary provider hits rate limits or quota errors (HTTP 429), 9Router seamlessly fails over to secondary targets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {routes.map((r) => (
                <div key={r.id} className="p-4 pxl-corner-sm border-2 border-[var(--color-border)] bg-[var(--color-card)]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="pxl-corner-sm font-bold uppercase">{r.alias_name}</Badge>
                      <span className="text-xs text-[var(--color-muted-foreground)]">Target Combo</span>
                    </div>
                    {r.rtk_compression_enabled && (
                      <Badge variant="success" className="pxl-corner-sm text-[10px]">
                        <Zap className="h-3 w-3 mr-1" /> RTK Compression ON
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="font-semibold px-2 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 pxl-corner-sm">
                      1. {r.primary_model} (Primary)
                    </span>
                    {r.fallback_models.map((fb, idx) => (
                      <span key={fb} className="flex items-center gap-2">
                        <span className="text-[var(--color-muted-foreground)]">&rarr;</span>
                        <span className="px-2 py-1 bg-[var(--color-muted)] border border-[var(--color-border)] pxl-corner-sm">
                          {idx + 2}. {fb} (Fallback)
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB CONTENT: RTK Token Saver */}
      {activeTab === "rtk" && (
        <Card className="pxl-corner-md pxl-card-shadow">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              RTK Prompt Compression Engine
            </CardTitle>
            <CardDescription className="text-xs">
              Automatically compresses large tool outputs, git diffs, directory trees, and stack traces before sending to upstream models.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="p-4 pxl-corner-sm border-2 border-emerald-500/30 bg-emerald-500/10 space-y-2">
              <div className="font-bold text-emerald-500 text-sm flex items-center gap-2">
                <Check className="h-4 w-4" /> RTK Token Compression Active
              </div>
              <p className="text-[var(--color-muted-foreground)]">
                Reduces prompt tokens by 20–40% on code diffs &amp; CLI logs while preserving context window efficiency.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold">Compression Efficiency Meter</div>
              <div className="w-full bg-[var(--color-muted)] h-5 pxl-corner-sm overflow-hidden p-0.5 border border-[var(--color-border)]">
                <div className="bg-emerald-500 h-full pxl-meter-bar transition-all" style={{ width: `${summary.efficiency_percentage}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-[var(--color-muted-foreground)]">
                <span>0%</span>
                <span className="font-bold text-emerald-500">{summary.efficiency_percentage}% Token Savings Ratio</span>
                <span>100%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB CONTENT: Usage Analytics */}
      {activeTab === "analytics" && (
        <Card className="pxl-corner-md pxl-card-shadow">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[var(--color-primary)]" />
              Token Telemetry &amp; Gateway Log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="border-2 border-[var(--color-border)] pxl-corner-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-[var(--color-muted)] border-b border-[var(--color-border)] uppercase text-[10px] text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="p-2.5">Provider</th>
                    <th className="p-2.5">Model</th>
                    <th className="p-2.5">Prompt Tokens</th>
                    <th className="p-2.5">Completion Tokens</th>
                    <th className="p-2.5">RTK Saved</th>
                    <th className="p-2.5">Fallback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]/50">
                  {usageQ.data?.records?.slice(0, 5).map((r: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[var(--color-muted)]/50">
                      <td className="p-2.5 uppercase font-bold">{r.provider_used}</td>
                      <td className="p-2.5">{r.model_used}</td>
                      <td className="p-2.5">{r.prompt_tokens}</td>
                      <td className="p-2.5">{r.completion_tokens}</td>
                      <td className="p-2.5 text-emerald-500 font-bold">+{r.tokens_saved_rtk}</td>
                      <td className="p-2.5">
                        {r.fallback_triggered ? (
                          <Badge variant="warning" className="pxl-corner-sm text-[10px]">Failover</Badge>
                        ) : (
                          <Badge variant="default" className="pxl-corner-sm text-[10px]">Direct</Badge>
                        )}
                      </td>
                    </tr>
                  )) ?? (
                    <tr>
                      <td className="p-2.5 uppercase font-bold">DeepSeek</td>
                      <td className="p-2.5">deepseek-coder</td>
                      <td className="p-2.5">1,240</td>
                      <td className="p-2.5">380</td>
                      <td className="p-2.5 text-emerald-500 font-bold">+410</td>
                      <td className="p-2.5"><Badge variant="default" className="pxl-corner-sm text-[10px]">Direct</Badge></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Provider Modal Dialog */}
      {newProvOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--color-card)] pxl-corner-md border-2 border-[var(--color-border)] pxl-card-shadow p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Key className="h-4 w-4 text-[var(--color-primary)]" /> Add Provider Credentials
              </h2>
              <Button size="sm" variant="ghost" onClick={() => setNewProvOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">Provider Name</label>
                <Input placeholder="e.g. openai, anthropic, deepseek, gemini" value={provName} onChange={(e) => setProvName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">API Key</label>
                <Input type="password" placeholder="sk-..." value={provKey} onChange={(e) => setProvKey(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">Custom Base URL (optional)</label>
                <Input placeholder="https://api.openai.com/v1" value={provUrl} onChange={(e) => setProvUrl(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setNewProvOpen(false)}>Cancel</Button>
              <Button
                onClick={() => addProviderM.mutate({ provider_name: provName, api_key: provKey, base_url: provUrl })}
                disabled={!provName || !provKey || addProviderM.isPending}
                className="pxl-corner-sm pxl-btn-shadow"
              >
                Save Credentials
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
