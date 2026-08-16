import { RiArrowRightLine as ArrowRight, RiDatabase2Line as Database, RiHardDrive3Line as Storage, RiServerLine as Server } from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export type ServiceManifest = {
  slug?: string;
  name: string;
  category?: string;
  summary?: string;
  version?: string;
  runtime?: string;
  image?: string;
  production_ready?: boolean;
  persistence?: string;
  supported_runtimes?: string[];
  minimum_resources?: { cpu_millicores?: number; memory_mb?: number; storage_gb?: number };
  storage?: Array<{ name?: string; size_gb?: number; required?: boolean }>;
  secrets?: Array<{ name: string; required?: boolean; description?: string }>;
  inputs?: Array<{ name: string; type?: string; required?: boolean; default?: unknown; min?: number; max?: number; choices?: string[] }>;
  ports?: Array<{ name?: string; port?: number; public?: boolean }>;
  endpoints?: Array<{ name?: string; path?: string; public?: boolean }>;
  lifecycle?: Record<string, boolean>;
  dependencies?: string[];
};

export type ServiceDefinition = { id?: string; slug: string; version: string; manifest: ServiceManifest };
type Props = { definition: ServiceDefinition; onSelect: (definition: ServiceDefinition) => void };

function formatResources(resources?: ServiceManifest["minimum_resources"]) {
  if (!resources) return "Not specified";
  const values = [resources.cpu_millicores ? `${resources.cpu_millicores}m CPU` : null, resources.memory_mb ? `${resources.memory_mb} MB RAM` : null, resources.storage_gb != null ? `${resources.storage_gb} GB storage` : null].filter(Boolean);
  return values.join(" · ") || "Not specified";
}

export function ServiceCatalogCard({ definition, onSelect }: Props) {
  const manifest = definition.manifest;
  const advanced = definition.slug === "custom-container";
  const Icon = manifest.category === "data" ? Database : manifest.category === "storage" ? Storage : Server;
  const ports = manifest.ports?.map((port) => port.port).filter(Boolean).join(", ") || "Not specified";
  const endpoints = manifest.endpoints?.map((endpoint) => endpoint.path || endpoint.name).filter(Boolean).join(", ") || "Not specified";
  return (
    <Card className="flex h-full flex-col transition-colors hover:border-[var(--color-primary)]/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-muted)]"><Icon className="h-5 w-5" /></div><div className="min-w-0"><CardTitle className="truncate text-sm">{manifest.name}</CardTitle><p className="mt-1 text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">{manifest.category || "service"}</p></div></div>{advanced && <Badge variant="warning">Advanced</Badge>}</div>
        <p className="pt-2 text-sm text-[var(--color-muted-foreground)]">{manifest.summary || "Deploy this service inside the current project."}</p>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-xs"><div className="grid gap-2 sm:grid-cols-2"><div><span className="text-[var(--color-muted-foreground)]">Persistence</span><div className="mt-0.5 font-medium">{manifest.persistence || "Not specified"}</div></div><div><span className="text-[var(--color-muted-foreground)]">Minimum resources</span><div className="mt-0.5 font-medium">{formatResources(manifest.minimum_resources)}</div></div><div><span className="text-[var(--color-muted-foreground)]">Ports</span><div className="mt-0.5 font-medium">{ports}</div></div><div><span className="text-[var(--color-muted-foreground)]">Endpoints</span><div className="mt-0.5 font-medium">{endpoints}</div></div><div><span className="text-[var(--color-muted-foreground)]">Runtime</span><div className="mt-0.5 font-medium">{manifest.supported_runtimes?.join(", ") || "Not specified"}</div></div><div><span className="text-[var(--color-muted-foreground)]">Production</span><div className="mt-0.5"><Badge variant={manifest.production_ready ? "success" : "warning"}>{manifest.production_ready ? "Ready" : "Review first"}</Badge></div></div></div><p className="text-[var(--color-muted-foreground)]">Version {definition.version} · {manifest.secrets?.length || 0} secret reference{manifest.secrets?.length === 1 ? "" : "s"}</p></CardContent>
      <CardFooter className="pt-0"><Button type="button" size="sm" className="w-full" onClick={() => onSelect(definition)} aria-label={`${advanced ? "Use advanced template" : "Deploy service"} ${manifest.name}`}>{advanced ? "Use advanced template" : "Deploy service"} <ArrowRight className="h-3.5 w-3.5" /></Button></CardFooter>
    </Card>
  );
}
