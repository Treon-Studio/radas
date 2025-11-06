import React, { useState } from "react";
import { Plus, ArrowLeft, Search, X, Filter, MoreVertical } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { ProjectSidebar, type ProjectSection } from "./project-sidebar";
import type { Project } from "../entity";

interface ProjectLayoutProps {
  projects: Project[];
  selectedProjectId: string | undefined;
  onSelectProject: (projectId: string | undefined) => void;
  onCreateProject: () => void;
  onEditProject: () => void;
  currentSection: ProjectSection;
  onSectionChange: (section: ProjectSection) => void;
  children: React.ReactNode;
  loading?: boolean;
}

export function ProjectLayout({
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onEditProject,
  currentSection,
  onSectionChange,
  children,
  loading,
}: ProjectLayoutProps) {
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Show empty state only when not loading and no projects
  if (!loading && projects.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-lg font-semibold mb-2">No Projects Yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first project to start managing tasks, documents, and more.
          </p>
          <Button onClick={onCreateProject}>
            <Plus size={16} className="mr-2" />
            Create Project
          </Button>
        </div>
      </div>
    );
  }

  if (!selectedProjectId) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b bg-background">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Projects</h3>
            <Button size="sm" variant="outline" onClick={onCreateProject} className="h-8">
              <Plus size={14} className="mr-1" />
              New Project
            </Button>
          </div>
        </div>

        {/* Project List */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="p-4 border rounded-lg bg-background hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded flex-shrink-0"
                      style={{ backgroundColor: project.color || "#3b82f6" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold truncate">{project.name}</h4>
                        <span className="text-xs text-muted-foreground">({project.key})</span>
                      </div>
                      {project.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="flex-shrink-0 px-3 py-3 flex items-center gap-2"
        style={{
          backgroundColor: searchMode ? "#f5f5f5" : selectedProject?.color || "#3b82f6",
        }}
      >
        {searchMode ? (
          <>
            {/* Search Mode */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 bg-white"
                autoFocus
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-3 gap-1 bg-white"
            >
              <Filter size={14} />
              Filters
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchMode(false);
                setSearchQuery("");
              }}
              className="h-9 w-9 p-0"
            >
              <X size={18} />
            </Button>
          </>
        ) : (
          <>
            {/* Normal Mode */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSelectProject(undefined)}
              className="h-9 w-9 p-0 text-white hover:bg-white/20 hover:text-white"
            >
              <ArrowLeft size={18} />
            </Button>

            <h1 className="text-white font-semibold text-base flex-1 text-center truncate px-2">
              {selectedProject?.name}
            </h1>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSearchMode(true)}
              className="h-9 w-9 p-0 text-white hover:bg-white/20 hover:text-white"
            >
              <Search size={18} />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0 text-white hover:bg-white/20 hover:text-white"
                >
                  <MoreVertical size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditProject}>
                  Edit Project
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCreateProject}>
                  New Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {/* Horizontal Tabs */}
      <ProjectSidebar
        currentSection={currentSection}
        onSectionChange={onSectionChange}
        projectId={selectedProjectId}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 space-y-4">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between mb-4">
              <div className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-9 w-24" />
            </div>

            {/* Filters Skeleton */}
            <div className="flex gap-2 mb-4">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 w-24" />
            </div>

            {/* Content Skeleton */}
            <div className="flex gap-4 overflow-x-auto">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex-shrink-0 w-80 space-y-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
