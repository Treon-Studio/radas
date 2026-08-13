import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  RiArrowRightLine as ArrowRight,
  RiAddLine as Plus,
  RiFolder2Line as FolderKanban,
} from "@remixicon/react";
import { Breadcrumbs } from "@/components/app-shell/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProjects, type Project } from "@/lib/project";
import { NewProjectDialog } from "@/components/project/NewProjectDialog";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  const t = useT();
  const navigate = useNavigate();
  const { projects, loading, setCurrent } = useProjects();
  const [createOpen, setCreateOpen] = useState(false);

  const openProject = async (project: Project) => {
    await setCurrent(project.id);
    await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  };

  return (
    <div className="space-y-8 animate-enter">
      <Breadcrumbs items={[{ label: t("nav.homeDashboard") }]} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
            Workspace
          </p>
          <h1 className="text-3xl font-bold tracking-tight mt-2">{t("page.home.title")}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-2 max-w-xl">
            Choose a project to open its cloud and infrastructure workspace.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t("common.newProject")}
        </Button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your projects</h2>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {loading ? "Loading…" : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {loading ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-6 py-12 text-center text-sm text-[var(--color-muted-foreground)]">
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-6 py-16 text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-[var(--color-muted)] flex items-center justify-center">
              <FolderKanban className="h-6 w-6 text-[var(--color-muted-foreground)]" />
            </div>
            <h2 className="mt-4 text-base font-semibold">No projects yet</h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Create your first project to start managing stacks and playbooks.
            </p>
            <Button className="mt-5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.filter((p) => !p.isArchived && !p.archived).map((project) => (
              <ProjectCard key={project.id} project={project} onOpen={() => void openProject(project)} />
            ))}
          </div>
        )}
      </section>

      <NewProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => void navigate({ to: "/projects/$projectId", params: { projectId: id } })}
      />
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  return (
    <Card
      className="group cursor-pointer transition-all hover:border-[var(--color-primary)]/50 hover:-translate-y-0.5"
      onClick={onOpen}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="h-10 w-10 rounded-lg bg-[var(--color-muted)] flex items-center justify-center">
            <FolderKanban className="h-5 w-5" />
          </div>
          <ArrowRight className="h-4 w-4 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-1" />
        </div>
        <h3 className="mt-5 text-base font-semibold truncate">{project.name}</h3>
        <p className="mt-1 min-h-10 text-sm text-[var(--color-muted-foreground)] line-clamp-2">
          {project.description || "No description"}
        </p>
        <button
          type="button"
          className="mt-5 text-xs font-medium text-[var(--color-primary)] hover:underline"
          onClick={(event) => { event.stopPropagation(); onOpen(); }}
        >
          Open project
        </button>
      </CardContent>
    </Card>
  );
}
