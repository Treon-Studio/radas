import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { RiArrowRightLine as ArrowRight, RiCloudLine as Cloud, RiFolder2Line as FolderKanban, RiStackLine as ServicesIcon } from "@remixicon/react";
import { Card, CardContent } from "@/components/ui/card";
import { useProjects } from "@/lib/project";

export const Route = createFileRoute("/projects/$projectId")({ component: ProjectOverview });

function ProjectOverview() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { projectId } = Route.useParams();
  const { projects, current, loading, setCurrent } = useProjects();
  const project = projects.find((item) => item.id === projectId);

  useEffect(() => {
    if (!loading && !project) {
      void navigate({ to: "/dashboard", replace: true });
      return;
    }
    if (project && current?.id !== project.id) {
      void setCurrent(project.id);
    }
  }, [current?.id, loading, navigate, project, setCurrent]);

  if (loading || !project) {
    return <div className="py-16 text-center text-sm text-[var(--color-muted-foreground)]">Loading project…</div>;
  }

  if (pathname !== `/projects/${projectId}`) return <Outlet />;

  return (
    <div className="space-y-8 animate-enter">
      <div>
        <p className="text-xs font-mono uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">Project</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{project.name}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">{project.description || "Your project workspace"}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ProjectAreaCard
          icon={<ServicesIcon className="h-5 w-5" />}
          title="Services"
          description="Choose, deploy, and operate project-scoped services from the RADAS catalog."
          to="/projects/$projectId/services"
          params={{ projectId }}
        />
        <ProjectAreaCard
          icon={<Cloud className="h-5 w-5" />}
          title="Cloud"
          description="Manage OpenTofu stacks, runs, costs, and providers."
          to="/cloud/summary"
        />
        <ProjectAreaCard
          icon={<FolderKanban className="h-5 w-5" />}
          title="Infrastructure"
          description="Manage Ansible playbooks, hosts, secrets, and templates."
          to="/infrastructure/deployment"
        />
      </div>
    </div>
  );
}

function ProjectAreaCard({
  icon,
  title,
  description,
  to,
  params,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  to: "/projects/$projectId/services" | "/cloud/summary" | "/infrastructure/deployment";
  params?: { projectId: string };
}) {
  return (
    <Card className="group transition-all hover:border-[var(--color-primary)]/50">
      <Link to={to} params={params as never} className="block rounded-[inherit] p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" aria-label={`${title}: ${description}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="h-10 w-10 rounded-lg bg-[var(--color-muted)] flex items-center justify-center">{icon}</div>
          <ArrowRight className="h-4 w-4 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-1" />
        </div>
        <h2 className="mt-5 text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{description}</p>
      </Link>
    </Card>
  );
}
