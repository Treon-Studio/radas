import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RiCloudLine as Cloud, RiGithubLine as Github } from "@remixicon/react";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { qk } from "@/lib/query";
import { PROVIDER_LABELS, PROVIDER_LOGOS, ProviderLogo, STATIC_PROVIDERS, providerCategory, sortProviders, useProviderLogo, type ProviderMeta } from "@/lib/providers";
import { useT } from "@/lib/i18n";

const GITHUB_ISSUES_URL = "https://github.com/opensible/opensible/issues/new";


export const Route = createFileRoute("/cloud/stacks/new")({ component: NewStackRoute });

type Provider = ProviderMeta;

function NewStackRoute() {
  const location = useLocation();
  return location.pathname === "/cloud/stacks/new" ? <NewStackPicker /> : <Outlet />;
}

const PROVIDER_DESC_KEYS: Record<string, string> = {
  bytedc: "cloud.new.bytedcDesc",
  hetzner: "cloud.new.hetznerDesc",
  aws: "cloud.new.awsDesc",
  azure: "cloud.new.azureDesc",
  cloudflare: "cloud.new.cloudflareDesc",
  vcenter: "cloud.new.vcenterDesc",
  esxi: "cloud.new.vcenterDesc",
  proxmox: "cloud.new.proxmoxDesc",
  kubernetes: "cloud.new.kubernetesDesc",
  k8s: "cloud.new.kubernetesDesc",
};

function NewStackPicker() {
  const navigate = useNavigate();
  const t = useT();

  const { data } = useQuery({
    queryKey: qk.providers,
    queryFn: () => api<{ providers: Provider[] }>("GET", "/api/cloud/providers"),
  });
  const backendProviders = (data?.providers ?? []).map(p => ({
    ...p,
    label: PROVIDER_LABELS[p.id] || p.label,
    category: p.category || providerCategory(p.id),
  }));
  const providers: Provider[] = [
    ...backendProviders,
    ...STATIC_PROVIDERS.filter(s => !backendProviders.some(p => p.id === s.id)),
  ];
  const cloudProviders = sortProviders(providers.filter(p => p.category === "cloud"));
  const onpremProviders = sortProviders(providers.filter(p => p.category === "onprem"));

  function pickProvider(p: Provider) {
    if (p.enabled === false) {
      toast.info(`${p.label} provider is coming soon.`);
      return;
    }
    if (p.id === "bytedc") navigate({ to: "/cloud/stacks/new/bytedc" });
    else if (p.id === "hetzner") navigate({ to: "/cloud/stacks/new/hetzner" });
    else if (p.id === "biznet") navigate({ to: "/cloud/stacks/new/biznet" });
    else if (p.id === "idcloudhost") navigate({ to: "/cloud/stacks/new/idcloudhost" });
    else if (p.id === "cloudflare") navigate({ to: "/cloud/stacks/new/cloudflare" });
    else if (p.id === "aws") navigate({ to: "/cloud/stacks/new/aws" });
    else if (p.id === "eks") navigate({ to: "/cloud/stacks/new/eks" });
    else if (p.id === "gcp") navigate({ to: "/cloud/stacks/new/gcp" });
    else if (p.id === "gke") navigate({ to: "/cloud/stacks/new/gke" });
    else if (p.id === "kubernetes" || p.id === "k8s") navigate({ to: "/cloud/stacks/new/kubernetes" });
    else toast.info(`Provider '${p.id}' not yet implemented.`);
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t("cloud.new.title") }]} />
      <div>
        <h1 className="text-2xl font-bold">{t("cloud.new.title")}</h1>
        <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
          {t("cloud.new.subtitle")}
        </p>
      </div>
      {renderSection(t("cloud.new.sectionCloud"), cloudProviders, pickProvider, t, 4)}
      {renderSection(t("cloud.new.sectionOnprem"), onpremProviders, pickProvider, t, 3)}

      <CustomTemplatesSection />


      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-[var(--color-muted-foreground)]">
          Missing something or want to improve a provider? OpenSible is open source — your feedback shapes the roadmap.
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5">
            <Github className="h-3.5 w-3.5" />
            Suggest an issue
          </a>
        </Button>
      </div>
    </div>
  );
}


function renderSection(title: string, items: Provider[], pick: (p: Provider) => void, t: (k: string) => string, cols = 3) {
  if (items.length === 0) return null;
  const gridClass = cols === 4 ? "grid-cols-2 md:grid-cols-4 gap-3" : "grid-cols-2 md:grid-cols-3 gap-3";
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-3">{title}</h2>
      <div className={`grid ${gridClass}`}>
        {items.map(p => {
          const descKey = PROVIDER_DESC_KEYS[p.id];
          const desc = descKey ? t(descKey) : (p.description || "");
          return (
          <Card
            key={p.id}
            onClick={() => pick(p)}
            className={`p-4 text-center h-full flex flex-col items-center justify-center gap-2 relative transition-colors ${
              p.enabled === false ? "opacity-60 cursor-not-allowed" : "hover:border-[var(--color-primary)] cursor-pointer"
            }`}
          >
            {p.enabled === false && (
              <span className="absolute top-2 right-2 text-[10px] bg-[var(--color-warning)]/15 text-[var(--color-warning)] px-2 py-0.5 rounded-full uppercase tracking-wider">{t("common.comingSoon")}</span>
            )}
            {p.id === "bytedc" ? (
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-700 text-white flex items-center justify-center font-bold text-xl">B</div>
            ) : p.id === "kubernetes" || p.id === "k8s" ? (
              <ProviderLogo id={p.id} className="h-10 w-10" />
            ) : PROVIDER_LOGOS[p.id] ? (
              <ProviderCardLogo id={p.id} label={p.label} />
            ) : (
              <Cloud className="h-10 w-10 text-[var(--color-muted-foreground)]" />
            )}
            <div className="font-semibold text-sm">{p.label}</div>
            <p className="text-xs text-[var(--color-muted-foreground)] leading-snug">{desc}</p>
          </Card>
          );
        })}
      </div>
    </div>
  );
}

function ProviderCardLogo({ id, label }: { id: string; label: string }) {
  const url = useProviderLogo(id);
  const largeIds = ["aws", "gcp", "cloudflare", "gke"];
  const sizeClass = largeIds.includes(id) ? "h-12 w-auto" : "h-10 w-auto";
  return <img src={url} alt={label} className={`${sizeClass} object-contain`} />;
}


type CustomTpl = { name: string; path: string };

function CustomTemplatesSection() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["custom-templates"],
    queryFn: () => api<{ templates: CustomTpl[] }>("GET", "/api/templates/custom"),
  });
  const templates = data?.templates ?? [];
  const [name, setName] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const useTpl = async (tpl: string) => {
    const stackName = (name[tpl] || "").trim();
    if (!stackName) return toast.error("Enter a stack name first");
    setBusy(tpl);
    try {
      await api("POST", "/api/cloud/stacks/from-template", { name: stackName, template: tpl });
      toast.success("Stack created from template");
      navigate({ to: "/cloud/stacks" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (templates.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] mb-3">
        Custom templates
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {templates.map((t) => (
          <div key={t.name} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 flex flex-col gap-2">
            <div className="font-medium text-sm truncate">{t.name}</div>
            <Input
              aria-label={"Stack name for " + t.name}
              placeholder="Stack name"
              value={name[t.name] || ""}
              onChange={(e) => setName((p) => ({ ...p, [t.name]: e.target.value }))}
            />
            <Button size="sm" onClick={() => useTpl(t.name)} disabled={busy === t.name}>
              {busy === t.name ? "Creating…" : "Use template"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

