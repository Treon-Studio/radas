import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/shared/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { useProjectPages, usePageMutations } from "../hooks";
import type { Page, PageTreeNode, PageType, CreatePageDto } from "../entity";
import { PageType as PageTypeEnum } from "../entity";
import { PageTreeView } from "../components/page-tree-view";
import { PageEditor } from "../components/page-editor";
import { PageFormDialog } from "../components/page-form-dialog";
import { toast } from "sonner";

interface PagesSectionProps {
  projectId: string;
}

export function PagesSection({ projectId }: PagesSectionProps) {
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<PageTreeNode | undefined>();
  const [defaultParentId, setDefaultParentId] = useState<string | undefined>();
  const [defaultType, setDefaultType] = useState<PageType | undefined>();
  const [deletingPageId, setDeletingPageId] = useState<string | undefined>();

  const { pages, pageTree, loading } = useProjectPages(projectId);
  const pageMutations = usePageMutations();

  const handleSelectPage = (page: PageTreeNode) => {
    setSelectedPage(page);
    if (page.type === PageTypeEnum.PAGE) {
      setEditorOpen(true);
    }
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setSelectedPage(null);
  };

  const handleCreatePage = (parentId?: string, type?: PageType) => {
    setEditingPage(undefined);
    setDefaultParentId(parentId);
    setDefaultType(type);
    setFormDialogOpen(true);
  };

  const handleEditPage = (page: PageTreeNode) => {
    setEditingPage(page);
    setDefaultParentId(undefined);
    setDefaultType(undefined);
    setFormDialogOpen(true);
  };

  const handleFormSubmit = async (data: CreatePageDto) => {
    if (editingPage) {
      // Update existing page
      const result = await pageMutations.update(editingPage.id, {
        title: data.title,
        icon: data.icon,
      });

      if (result.success) {
        toast.success("Page renamed");
        setFormDialogOpen(false);
        setEditingPage(undefined);
        // Update selected page if it was the edited one
        const updatedPage = pages.find((p) => p.id === editingPage.id);
        if (selectedPage?.id === editingPage.id && updatedPage) {
          setSelectedPage(updatedPage);
        }
      } else {
        toast.error("Failed to rename page");
      }
    } else {
      // Create new page
      const result = await pageMutations.create(projectId, data);
      if (result.success && 'id' in result && result.id) {
        toast.success(`${data.type === PageTypeEnum.DIRECTORY ? "Folder" : "Page"} created`);
        setFormDialogOpen(false);
        setDefaultParentId(undefined);
        setDefaultType(undefined);
        // Select and open the new page if it's a page (not a directory)
        if (data.type === PageTypeEnum.PAGE) {
          const newPage = pages.find((p) => p.id === result.id);
          if (newPage) {
            setSelectedPage(newPage);
            setEditorOpen(true);
          }
        }
      } else {
        toast.error("Failed to create");
      }
    }
  };

  const handleSavePage = async (title: string, content: string) => {
    if (!selectedPage) return;

    // Optimistic update - update selectedPage immediately with new data
    const optimisticPage = {
      ...selectedPage,
      title,
      content,
      updatedAt: new Date(),
    };
    setSelectedPage(optimisticPage);

    const result = await pageMutations.update(selectedPage.id, {
      title,
      content,
    });

    if (result.success) {
      toast.success("Page saved");
      // The subscription will automatically update the pages array
      // No need to manually update selectedPage here
    } else {
      toast.error("Failed to save page");
      // Revert optimistic update on error
      setSelectedPage(selectedPage);
    }
  };

  const handleDeletePage = async (pageId: string) => {
    const result = await pageMutations.remove(pageId);
    if (result.success) {
      toast.success("Deleted");
      setDeletingPageId(undefined);
      if (selectedPage?.id === pageId) {
        setSelectedPage(null);
        setEditorOpen(false);
      }
    } else {
      toast.error("Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading pages...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Main Content - Page Tree (Full Width) */}
      <div className="h-full flex flex-col bg-background">
        <div className="px-4 py-3 border-b flex gap-2">
          <Button
            size="sm"
            onClick={() => handleCreatePage(undefined, PageTypeEnum.PAGE)}
            variant="ghost"
          >
            <Plus size={14} className="mr-1" />
            New Page
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleCreatePage(undefined, PageTypeEnum.DIRECTORY)}
          >
            <Plus size={14} className="mr-1" />
            New Folder
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-4">
          <PageTreeView
            nodes={pageTree}
            selectedPageId={selectedPage?.id}
            onSelectPage={handleSelectPage}
            onCreatePage={handleCreatePage}
            onEditPage={handleEditPage}
            onDeletePage={setDeletingPageId}
          />
        </div>
      </div>

      {/* Full Screen Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={(open) => !open && handleCloseEditor()}>
        <DialogContent className="max-w-full h-screen m-0 p-0 rounded-none">
          <PageEditor
            page={selectedPage}
            onSave={handleSavePage}
            onCancel={handleCloseEditor}
            loading={pageMutations.loading}
          />
        </DialogContent>
      </Dialog>

      {/* Create/Edit Form Dialog */}
      <PageFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        page={editingPage}
        defaultParentId={defaultParentId}
        defaultType={defaultType}
        onSubmit={handleFormSubmit}
        loading={pageMutations.loading}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingPageId}
        onOpenChange={(open) => !open && setDeletingPageId(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this item and all its content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPageId && handleDeletePage(deletingPageId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
