import React, { useState } from "react";
import { Plus } from "lucide-react";
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
import { useProjectLinks, useLinkMutations } from "../hooks";
import type { Link, LinkTreeNode, LinkType, CreateLinkDto } from "../entity";
import { LinkType as LinkTypeEnum } from "../entity";
import { LinkTreeView } from "../components/link-tree-view";
import { LinkEditor } from "../components/link-editor";
import { LinkFormDialog } from "../components/link-form-dialog";
import { toast } from "sonner";

interface LinksSectionProps {
  projectId: string;
}

export function LinksSection({ projectId }: LinksSectionProps) {
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkTreeNode | undefined>();
  const [defaultParentId, setDefaultParentId] = useState<string | undefined>();
  const [defaultType, setDefaultType] = useState<LinkType | undefined>();
  const [deletingLinkId, setDeletingLinkId] = useState<string | undefined>();

  const { links, linkTree, loading } = useProjectLinks(projectId);
  const linkMutations = useLinkMutations();

  const handleSelectLink = (link: LinkTreeNode) => {
    setSelectedLink(link);
    if (link.type === LinkTypeEnum.LINK) {
      setEditorOpen(true);
    }
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setSelectedLink(null);
  };

  const handleCreateLink = (parentId?: string, type?: LinkType) => {
    setEditingLink(undefined);
    setDefaultParentId(parentId);
    setDefaultType(type);
    setFormDialogOpen(true);
  };

  const handleEditLink = (link: LinkTreeNode) => {
    setEditingLink(link);
    setDefaultParentId(undefined);
    setDefaultType(undefined);
    setFormDialogOpen(true);
  };

  const handleFormSubmit = async (data: CreateLinkDto) => {
    if (editingLink) {
      // Update existing link
      const result = await linkMutations.update(editingLink.id, {
        title: data.title,
        icon: data.icon,
      });

      if (result.success) {
        toast.success("Link renamed");
        setFormDialogOpen(false);
        setEditingLink(undefined);
        // Update selected link if it was the edited one
        const updatedLink = links.find((l) => l.id === editingLink.id);
        if (selectedLink?.id === editingLink.id && updatedLink) {
          setSelectedLink(updatedLink);
        }
      } else {
        toast.error("Failed to rename link");
      }
    } else {
      // Create new link
      const result = await linkMutations.create(projectId, data);
      if (result.success && 'id' in result && result.id) {
        toast.success(`${data.type === LinkTypeEnum.FOLDER ? "Folder" : "Link"} created`);
        setFormDialogOpen(false);
        setDefaultParentId(undefined);
        setDefaultType(undefined);
        // Select and open the new link if it's a link (not a folder)
        if (data.type === LinkTypeEnum.LINK) {
          const newLink = links.find((l) => l.id === result.id);
          if (newLink) {
            setSelectedLink(newLink);
            setEditorOpen(true);
          }
        }
      } else {
        toast.error("Failed to create");
      }
    }
  };

  const handleSaveLink = async (data: {
    title: string;
    url?: string;
    description?: string;
    category?: any;
  }) => {
    if (!selectedLink) return;

    // Optimistic update - update selectedLink immediately with new data
    const optimisticLink = {
      ...selectedLink,
      title: data.title,
      url: data.url,
      description: data.description,
      category: data.category,
      updatedAt: new Date(),
    };
    setSelectedLink(optimisticLink);

    const result = await linkMutations.update(selectedLink.id, {
      title: data.title,
      url: data.url,
      description: data.description,
      category: data.category,
    });

    if (result.success) {
      toast.success("Link saved");
      // The subscription will automatically update the links array
    } else {
      toast.error("Failed to save link");
      // Revert optimistic update on error
      setSelectedLink(selectedLink);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    const result = await linkMutations.remove(linkId);
    if (result.success) {
      toast.success("Deleted");
      setDeletingLinkId(undefined);
      if (selectedLink?.id === linkId) {
        setSelectedLink(null);
        setEditorOpen(false);
      }
    } else {
      toast.error("Failed to delete");
    }
  };

  const handleMoveLink = async (linkId: string, newParentId: string | undefined, newOrder: number) => {
    const result = await linkMutations.update(linkId, {
      parentId: newParentId,
      order: newOrder,
    });

    if (result.success) {
      toast.success("Link moved");
    } else {
      toast.error("Failed to move link");
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading links...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Main Content - Link Tree (Full Width) */}
      <div className="h-full flex flex-col bg-background">
        <div className="px-4 py-3 border-b flex gap-2">
          <Button
            size="sm"
            onClick={() => handleCreateLink(undefined, LinkTypeEnum.LINK)}
            variant="ghost"
          >
            <Plus size={14} className="mr-1" />
            New Link
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleCreateLink(undefined, LinkTypeEnum.FOLDER)}
          >
            <Plus size={14} className="mr-1" />
            New Folder
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-4">
          <LinkTreeView
            nodes={linkTree}
            selectedLinkId={selectedLink?.id}
            onSelectLink={handleSelectLink}
            onCreateLink={handleCreateLink}
            onEditLink={handleEditLink}
            onDeleteLink={setDeletingLinkId}
            onMoveLink={handleMoveLink}
          />
        </div>
      </div>

      {/* Full Screen Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={(open) => !open && handleCloseEditor()}>
        <DialogContent className="max-w-full h-screen m-0 p-0 rounded-none">
          <LinkEditor
            link={selectedLink}
            onSave={handleSaveLink}
            onCancel={handleCloseEditor}
            loading={linkMutations.loading}
          />
        </DialogContent>
      </Dialog>

      {/* Create/Edit Form Dialog */}
      <LinkFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        link={editingLink}
        defaultParentId={defaultParentId}
        defaultType={defaultType}
        onSubmit={handleFormSubmit}
        loading={linkMutations.loading}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingLinkId}
        onOpenChange={(open) => !open && setDeletingLinkId(undefined)}
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
              onClick={() => deletingLinkId && handleDeleteLink(deletingLinkId)}
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
