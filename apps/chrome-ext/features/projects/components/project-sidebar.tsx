import React from "react";
import {
  CheckSquare,
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
import { cn } from "@/shared/lib/utils";

export type ProjectSection =
  | "tasks"
  | "epics"
  | "status"
  | "estimation"
  | "pages"
  | "documents"
  | "links"
  | "test-cases"
  | "cycles"
  | "views";

interface SectionItem {
  id: ProjectSection;
  label: string;
  icon: React.ReactNode;
  description: string;
  badge?: string | number;
  comingSoon?: boolean;
}

const SECTIONS: SectionItem[] = [
  {
    id: "tasks",
    label: "Tasks",
    icon: <CheckSquare size={16} />,
    description: "Manage tasks, bugs, and stories",
  },
  {
    id: "epics",
    label: "Epics",
    icon: <Rocket size={16} />,
    description: "Group and track large features",
  },
  {
    id: "status",
    label: "Status",
    icon: <GitBranch size={16} />,
    description: "Configure workflow statuses",
  },
  {
    id: "estimation",
    label: "Estimation",
    icon: <Clock size={16} />,
    description: "Time tracking and estimates",
  },
  {
    id: "pages",
    label: "Pages",
    icon: <FileText size={16} />,
    description: "Project wiki and documentation",
  },
  {
    id: "documents",
    label: "Documents",
    icon: <FolderOpen size={16} />,
    description: "File and document storage",
  },
  {
    id: "links",
    label: "Links",
    icon: <Link2 size={16} />,
    description: "Important project links",
  },
  {
    id: "test-cases",
    label: "Test Cases",
    icon: <FlaskConical size={16} />,
    description: "QA test cases and scenarios",
  },
  {
    id: "cycles",
    label: "Cycles",
    icon: <Repeat size={16} />,
    description: "Sprints and release cycles",
  },
  {
    id: "views",
    label: "Views",
    icon: <LayoutGrid size={16} />,
    description: "Custom views and dashboards",
  },
];

interface ProjectSidebarProps {
  currentSection: ProjectSection;
  onSectionChange: (section: ProjectSection) => void;
  projectId: string;
}

export function ProjectSidebar({
  currentSection,
  onSectionChange,
}: ProjectSidebarProps) {
  return (
    <div className="w-full border-b bg-background flex-shrink-0 overflow-x-auto">
      <div className="flex p-2 gap-1 min-w-max">
        {SECTIONS.map((section) => {
          const isActive = currentSection === section.id;
          const isDisabled = section.comingSoon;

          return (
            <button
              key={section.id}
              onClick={() => !isDisabled && onSectionChange(section.id)}
              disabled={isDisabled}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors whitespace-nowrap",
                isActive && !isDisabled
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-muted",
                isDisabled && "opacity-50 cursor-not-allowed"
              )}
              title={section.description}
            >
              <span className="flex-shrink-0">{section.icon}</span>
              <span>{section.label}</span>
              {section.comingSoon && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted-foreground/20 text-muted-foreground">
                  Soon
                </span>
              )}
              {section.badge && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {section.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
