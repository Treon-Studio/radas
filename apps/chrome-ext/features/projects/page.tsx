import React, { useState } from "react";
import {
  Rocket,
  GitBranch,
  Clock,
  FileText,
  FolderOpen,
  Link2,
  FlaskConical,
  Repeat,
  LayoutGrid,
} from "lucide-react";
import { ProjectLayout } from "./components/project-layout";
import { ProjectFormDialog } from "./components/project-form-dialog";
import type { ProjectSection } from "./components/project-sidebar";
import { TasksSection } from "./sections/tasks-section";
import { EpicsSection } from "./sections/epics-section";
import { StatusSection } from "./sections/status-section";
import { EstimationSection } from "./sections/estimation-section";
import { PagesSection } from "./sections/pages-section";
import { DocumentsSection } from "./sections/documents-section";
import { LinksSection } from "./sections/links-section";
import { TestCasesSection } from "./sections/test-cases-section";
import { CyclesSection } from "./sections/cycles-section";
import { ViewsSection } from "./sections/views-section";
import { ComingSoonSection } from "./sections/coming-soon-section";
import {
  useUserProjects,
  useProjectMutations,
} from "./hooks";
import type { Project, CreateProjectDto } from "./entity";
import { toast } from "sonner";

interface ProjectsPageProps {
  onViewChange?: (isDetailView: boolean) => void;
}

export function ProjectsPage({ onViewChange }: ProjectsPageProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [currentSection, setCurrentSection] = useState<ProjectSection>(() => {
    // Load last active section from localStorage
    const saved = localStorage.getItem("lastProjectSection");
    return (saved as ProjectSection) || "tasks";
  });
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>();

  // Save current section to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem("lastProjectSection", currentSection);
  }, [currentSection]);

  // Notify parent about view change
  React.useEffect(() => {
    onViewChange?.(!!selectedProjectId);
  }, [selectedProjectId, onViewChange]);

  const { projects, loading: projectsLoading } = useUserProjects();
  const projectMutations = useProjectMutations();

  // Project Handlers
  const handleAddProject = () => {
    setEditingProject(undefined);
    setProjectDialogOpen(true);
  };

  const handleEditProject = () => {
    const project = projects.find((p) => p.id === selectedProjectId);
    if (project) {
      setEditingProject(project);
      setProjectDialogOpen(true);
    }
  };

  const handleSubmitProject = async (data: CreateProjectDto) => {
    try {
      if (editingProject) {
        const result = await projectMutations.update(editingProject.id, data);
        if (result.success) {
          toast.success("Project updated successfully");
          handleCloseProjectDialog();
        } else {
          toast.error("Failed to update project");
        }
      } else {
        const result = await projectMutations.create(data);
        if (result.success) {
          toast.success("Project created successfully");
          handleCloseProjectDialog();
          if (result.id) {
            setSelectedProjectId(result.id);
          }
        } else {
          toast.error("Failed to create project");
        }
      }
    } catch (error) {
      console.error("Error submitting project:", error);
      toast.error("An error occurred");
    }
  };

  const handleCloseProjectDialog = () => {
    setProjectDialogOpen(false);
    setEditingProject(undefined);
  };

  // Render section content
  const renderSectionContent = () => {
    if (!selectedProjectId) return null;

    switch (currentSection) {
      case "tasks":
        return <TasksSection projectId={selectedProjectId} />;

      case "epics":
        return <EpicsSection projectId={selectedProjectId} />;

      case "status":
        return <StatusSection projectId={selectedProjectId} />;

      case "estimation":
        return <EstimationSection projectId={selectedProjectId} />;

      case "pages":
        return <PagesSection projectId={selectedProjectId} />;

      case "documents":
        return <DocumentsSection projectId={selectedProjectId} />;

      case "links":
        return <LinksSection projectId={selectedProjectId} />;

      case "test-cases":
        return <TestCasesSection projectId={selectedProjectId} />;

      case "cycles":
        return <CyclesSection projectId={selectedProjectId} />;

      case "views":
        return <ViewsSection projectId={selectedProjectId} />;

      default:
        return null;
    }
  };

  return (
    <div className="h-full">
      <ProjectLayout
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        onCreateProject={handleAddProject}
        onEditProject={handleEditProject}
        currentSection={currentSection}
        onSectionChange={setCurrentSection}
        loading={projectsLoading}
      >
        {renderSectionContent()}
      </ProjectLayout>

      {/* Project Dialog */}
      <ProjectFormDialog
        open={projectDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseProjectDialog();
          else setProjectDialogOpen(open);
        }}
        project={editingProject}
        onSubmit={handleSubmitProject}
        loading={projectMutations.loading}
      />
    </div>
  );
}
