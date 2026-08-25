import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import {
  RiCodeBoxLine as CodeBox,
  RiDownload2Line as Download,
  RiDeleteBinLine as Trash,
  RiFileUploadLine as Upload,
  RiFileCopyLine as Copy,
} from "@remixicon/react"
import { toast } from "sonner"
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { api, getToken, unwrapData } from "@/lib/api"

export const Route = createFileRoute("/cloud/registry")({ component: RegistryPage })

type RegistryItem = { name: string; type: string; version: string; description: string; tags: string[] }
type InstalledItem = { name: string; type: string; version: string; installed_at: number; files_copied: string[] }
type PrivateModuleVersion = { version: string; sha256: string; size: number; published_at: number }
type PrivateModule = {
  slug: string
  current_version: string
  manifest: { description?: string; tags?: string[] }
  sha256?: string
  size?: number
  versions?: PrivateModuleVersion[]
}

type PublishForm = {
  namespace: string
  name: string
  provider: string
  version: string
  description: string
}

const TYPE_LABEL: Record<string, string> = { "tofu-block": "OpenTofu block", "ansible-role": "Ansible role" }
const INITIAL_PUBLISH_FORM: PublishForm = {
  namespace: "internal",
  name: "",
  provider: "aws",
  version: "1.0.0",
  description: "",
}

function privateSource(slug: string): string {
  const host = typeof window === "undefined" ? "<registry-host>" : window.location.host
  return `${host}/${slug}`
}

function formatBytes(value: number | undefined): string {
  if (!value) return "—"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KiB`
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`
}

function RegistryPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [target, setTarget] = useState("")
  const [selected, setSelected] = useState<RegistryItem | null>(null)
  const [publishForm, setPublishForm] = useState<PublishForm>(INITIAL_PUBLISH_FORM)
  const [archive, setArchive] = useState<File | null>(null)
  const { data: cat } = useQuery({ queryKey: ["registry"], queryFn: () => api<{ items: RegistryItem[] }>("GET", "/api/registry") })
  const { data: stacks } = useQuery({ queryKey: ["stacks"], queryFn: () => api<{ stacks: { name: string }[] }>("GET", "/api/cloud/stacks") })
  const { data: privateModules, error: privateModulesError } = useQuery({
    queryKey: ["private-tofu-modules"],
    queryFn: () => api<{ data: { modules: PrivateModule[] } }>("GET", "/api/projects/_current/tofu-modules"),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["registry"] })
    void qc.invalidateQueries({ queryKey: ["registry-installed"] })
  }
  const invalidatePrivateModules = () => void qc.invalidateQueries({ queryKey: ["private-tofu-modules"] })

  const loadInstalled = () => {
    if (!target) return Promise.resolve({ installed: [] as InstalledItem[] })
    return api<{ installed: InstalledItem[] }>("GET", `/api/registry/installed?stack=${encodeURIComponent(target)}`)
  }

  const { data: installed } = useQuery({
    queryKey: ["registry-installed", target],
    queryFn: loadInstalled,
    enabled: !!target,
  })

  const installMut = useMutation({
    mutationFn: () => api("POST", `/api/registry/${encodeURIComponent(selected!.name)}/install`, { stack: target }),
    onSuccess: () => {
      toast.success(`${selected?.name} di-copy ke stack ${target}`)
      invalidate()
      setSelected(null)
    },
    onError: (error: Error) => toast.error(error.message || "Install gagal"),
  })

  const uninstallMut = useMutation({
    mutationFn: (name: string) => api("POST", `/api/registry/${encodeURIComponent(name)}/uninstall`, { stack: target }),
    onSuccess: () => {
      toast.success("Di-uninstall")
      invalidate()
    },
    onError: (error: Error) => toast.error(error.message || "Uninstall gagal"),
  })

  const publishMut = useMutation({
    mutationFn: async () => {
      if (!archive) throw new Error("Pilih archive .tar.gz terlebih dahulu")
      const projectId = window.localStorage.getItem("current_project_id")
      if (!projectId) throw new Error("Pilih project terlebih dahulu")
      const form = new FormData()
      form.append("manifest", JSON.stringify({
        slug: `${publishForm.namespace}/${publishForm.name}/${publishForm.provider}`,
        version: publishForm.version,
        description: publishForm.description,
      }))
      form.append("archive", archive)
      const response = await fetch(`${import.meta.env.VITE_API_BASE ?? ""}/api/projects/${encodeURIComponent(projectId)}/tofu-modules`, {
        method: "POST",
        headers: {
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          "X-Project-Id": projectId,
        },
        body: form,
        credentials: "include",
      })
      const text = await response.text()
      let payload: unknown = null
      try { payload = text ? JSON.parse(text) : null } catch { payload = text }
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: { message?: string } }).error?.message || "Module publication failed")
          : "Module publication failed"
        throw new Error(message)
      }
      return unwrapData<{ module: PrivateModule }>(payload as { data: { module: PrivateModule } })
    },
    onSuccess: (result) => {
      toast.success(`${result?.module.slug ?? "Module"} published`)
      setPublishForm(INITIAL_PUBLISH_FORM)
      setArchive(null)
      if (fileRef.current) fileRef.current.value = ""
      invalidatePrivateModules()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const copySource = async (source: string) => {
    try {
      await navigator.clipboard.writeText(source)
      toast.success("OpenTofu source copied")
    } catch {
      toast.error("Unable to copy source")
    }
  }

  const items = cat?.items ?? []
  const stackNames = (stacks?.stacks ?? []).map((stack) => stack.name)
  const modules = privateModules?.data?.modules ?? []

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Cloud" }, { label: "Code Registry" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-mono font-semibold">
            <CodeBox className="h-5 w-5" /> Code Registry
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Bring Your Own Code: kode modul IaC &amp; role Ansible disimpan di registry, di-copy ke stack saat di-install (shadcn-style).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Private OpenTofu modules</CardTitle></CardHeader>
        <CardContent className="space-y-5 pt-0">
          <form
            className="grid gap-3 rounded-md border border-[var(--color-border)] p-3 md:grid-cols-2 xl:grid-cols-3"
            onSubmit={(event) => { event.preventDefault(); publishMut.mutate() }}
          >
            <Input aria-label="Module namespace" placeholder="Namespace" value={publishForm.namespace} required onChange={(event) => setPublishForm((current) => ({ ...current, namespace: event.target.value }))} />
            <Input aria-label="Module name" placeholder="Module name" value={publishForm.name} required onChange={(event) => setPublishForm((current) => ({ ...current, name: event.target.value }))} />
            <Input aria-label="Module provider" placeholder="Provider" value={publishForm.provider} required onChange={(event) => setPublishForm((current) => ({ ...current, provider: event.target.value }))} />
            <Input aria-label="Module version" placeholder="Version" value={publishForm.version} required onChange={(event) => setPublishForm((current) => ({ ...current, version: event.target.value }))} />
            <Input aria-label="Module description" placeholder="Description" value={publishForm.description} required onChange={(event) => setPublishForm((current) => ({ ...current, description: event.target.value }))} />
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                aria-label="Module archive"
                type="file"
                accept=".tar.gz,application/gzip"
                required
                className="min-w-0 text-xs"
                onChange={(event) => setArchive(event.target.files?.[0] ?? null)}
              />
              <Button type="submit" size="sm" disabled={publishMut.isPending}>
                <Upload className="h-3.5 w-3.5" /> Publish
              </Button>
            </div>
          </form>

          {privateModulesError ? (
            <p className="text-xs text-[var(--color-muted-foreground)]">Private modules are unavailable for the current project.</p>
          ) : modules.length === 0 ? (
            <p className="text-xs text-[var(--color-muted-foreground)]">No private modules published for this project organization.</p>
          ) : (
            modules.map((module) => {
              const source = privateSource(module.slug)
              return (
                <div key={module.slug} className="space-y-2 rounded-md border border-[var(--color-border)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CodeBox className="h-4 w-4" />
                    <span className="font-mono text-sm">{module.slug}</span>
                    <Badge variant="success">v{module.current_version}</Badge>
                  </div>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{module.manifest?.description || "Private OpenTofu module"}</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded bg-[var(--color-muted)] px-2 py-1 text-[11px] font-mono">source = "{source}"</code>
                    <Button type="button" variant="outline" size="sm" onClick={() => void copySource(source)} aria-label={`Copy source for ${module.slug}`}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--color-muted-foreground)]">
                    {module.sha256 && <span className="font-mono">sha256: {module.sha256}</span>}
                    <span>{formatBytes(module.size)}</span>
                    {(module.versions ?? []).map((version) => <span key={version.version}>v{version.version}</span>)}
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Target stack</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Select value={target} onChange={setTarget} placeholder="Pilih stack tujuan install…" className="w-72" options={stackNames.map((stack) => ({ value: stack, label: stack }))} />
          {stackNames.length === 0 && <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">Create a cloud stack first before installing registry code.</p>}
        </CardContent>
      </Card>

      {items.length === 0 && <div className="text-sm text-[var(--color-muted-foreground)]">Registry kosong. Tambahkan item ke <code className="font-mono">server/registry/</code>.</div>}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <Card key={`${item.type}:${item.name}`}>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CodeBox className="h-4 w-4" /> {item.name}
                <Badge variant={item.type === "tofu-block" ? "success" : "warning"}>{TYPE_LABEL[item.type]}</Badge>
                <span className="text-[10px] font-mono text-[var(--color-muted-foreground)]">v{item.version}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <p className="text-[var(--color-muted-foreground)]">{item.description}</p>
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => <span key={tag} className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-mono">{tag}</span>)}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setSelected(item); installMut.mutate() }} disabled={!target || installMut.isPending}>
                  <Download className="h-3.5 w-3.5" /> Install
                </Button>
                {target && (installed?.installed ?? []).some((installedItem) => installedItem.name === item.name) && (
                  <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" onClick={() => uninstallMut.mutate(item.name)}>
                    <Trash className="h-3.5 w-3.5" /> Uninstall
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {target && (installed?.installed ?? []).length > 0 && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">Installed di {target}</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 pt-0 text-xs">
            {(installed?.installed ?? []).map((item) => (
              <div key={item.name} className="flex items-center gap-2 border-b border-[var(--color-border)] py-1.5 last:border-0">
                <Badge variant="success">✓</Badge>
                <span className="font-mono">{item.name}</span>
                <span className="text-[var(--color-muted-foreground)]">v{item.version} · {item.files_copied.length} file</span>
                <span className="ml-auto text-[var(--color-muted-foreground)]">{new Date(item.installed_at * 1000).toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
