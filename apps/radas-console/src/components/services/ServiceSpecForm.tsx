import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ServiceDefinition } from "./ServiceCatalogCard";

export type ServiceSpec = {
  name: string;
  environment: string;
  runtime_id: string;
  spec: Record<string, unknown>;
};

type Props = {
  definition: ServiceDefinition;
  value: ServiceSpec;
  onChange: (value: ServiceSpec) => void;
  onReview: () => void;
  busy?: boolean;
};

const ENVIRONMENTS = [
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
];
const RUNTIMES = [
  { value: "mock", label: "Mock runtime", description: "Safe deterministic runtime for development and acceptance checks" },
  { value: "docker", label: "Docker" },
  { value: "podman", label: "Podman" },
  { value: "kubernetes", label: "Kubernetes" },
];

function fieldLabel(name: string) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

export function ServiceSpecForm({ definition, value, onChange, onReview, busy }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const manifest = definition.manifest;
  const declaredInputs = useMemo(() => manifest.inputs || [], [manifest.inputs]);
  const update = (patch: Partial<ServiceSpec>) => onChange({ ...value, ...patch });
  const updateSpec = (key: string, next: unknown) => onChange({ ...value, spec: { ...value.spec, [key]: next } });
  const updateSecret = (key: string, next: string) => onChange({ ...value, spec: { ...value.spec, secrets: { ...((value.spec.secrets as Record<string, unknown> | undefined) || {}), [key]: { secret_ref: next } } } });
  const validate = () => {
    const next: Record<string, string> = {};
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(value.name.trim())) next.name = "Use 1–63 characters: letters, numbers, hyphens, or underscores.";
    if (!value.environment) next.environment = "Choose an environment.";
    if (!value.runtime_id) next.runtime_id = "Choose a runtime.";
    for (const input of declaredInputs) {
      if (input.required && (value.spec[input.name] === undefined || value.spec[input.name] === "")) next[input.name] = "This field is required.";
    }
    setErrors(next);
    if (!Object.keys(next).length) onReview();
  };
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); validate(); }} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="service-name" className="text-sm font-medium">Service name</label>
          <Input id="service-name" className="mt-1" value={value.name} onChange={(event) => update({ name: event.target.value })} aria-invalid={!!errors.name} aria-describedby={errors.name ? "service-name-error" : undefined} placeholder="my-service" />
          {errors.name && <p id="service-name-error" className="mt-1 text-xs text-[var(--color-destructive)]">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="service-environment" className="text-sm font-medium">Environment</label>
          <Select value={value.environment} onChange={(next) => update({ environment: next })} options={ENVIRONMENTS} className="mt-1" label="Environment" />
          {errors.environment && <p className="mt-1 text-xs text-[var(--color-destructive)]">{errors.environment}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="service-runtime" className="text-sm font-medium">Runtime</label>
        <Select value={value.runtime_id} onChange={(next) => update({ runtime_id: next })} options={RUNTIMES.filter((option) => option.value === "mock" || manifest.supported_runtimes?.includes(option.value))} className="mt-1" label="Runtime" />
        {errors.runtime_id && <p className="mt-1 text-xs text-[var(--color-destructive)]">{errors.runtime_id}</p>}
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Runtime availability is checked by the server before the instance is created.</p>
      </div>
      {declaredInputs.length > 0 && <div className="space-y-4 rounded-md border border-[var(--color-border)] p-4"><div><h2 className="text-sm font-semibold">Service settings</h2><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Only settings declared by {manifest.name} are shown.</p></div>{declaredInputs.map((input) => {
        const inputId = `service-input-${input.name}`;
        const current = value.spec[input.name] ?? input.default ?? "";
        const numeric = input.type === "integer" || input.type === "number" || input.type === "port";
        return <div key={input.name}><label htmlFor={inputId} className="text-sm font-medium">{fieldLabel(input.name)}{input.required ? " *" : ""}</label><Input id={inputId} className="mt-1" type={numeric ? "number" : input.type === "url" || input.type === "domain" ? "text" : "text"} value={String(current)} min={input.min} max={input.max} onChange={(event) => updateSpec(input.name, numeric ? Number(event.target.value) : event.target.value)} aria-invalid={!!errors[input.name]} />{errors[input.name] && <p className="mt-1 text-xs text-[var(--color-destructive)]">{errors[input.name]}</p>}</div>;
      })}</div>}
      {manifest.storage?.length ? <div className="rounded-md border border-[var(--color-border)] p-4"><h2 className="text-sm font-semibold">Persistent storage</h2><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">This service declares {manifest.storage.map((item) => `${item.name || "data"} (${item.size_gb || 0} GB)`).join(", ")}. Storage is provisioned by the selected runtime.</p></div> : null}
      {manifest.secrets?.length ? <div className="rounded-md border border-[var(--color-border)] p-4"><h2 className="text-sm font-semibold">Secret references</h2><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Select or create project secret references. Raw secret values are never entered here or sent to the browser.</p><div className="mt-3 space-y-3">{manifest.secrets.map((secret) => <div key={secret.name}><label htmlFor={`service-secret-${secret.name}`} className="text-sm font-medium">{secret.name}{secret.required === false ? " (optional)" : ""}</label><Input id={`service-secret-${secret.name}`} className="mt-1" placeholder="secret://project/name" value={String(((value.spec.secrets as Record<string, { secret_ref?: string }> | undefined)?.[secret.name]?.secret_ref) || "")} onChange={(event) => updateSecret(secret.name, event.target.value)} aria-describedby={`service-secret-help-${secret.name}`} /><p id={`service-secret-help-${secret.name}`} className="mt-1 text-xs text-[var(--color-muted-foreground)]">Reference only; the secret value is never entered here.</p></div>)}</div></div> : null}
      <div className="flex justify-end"><button type="submit" className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={busy}>Review deployment</button></div>
    </form>
  );
}
