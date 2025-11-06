import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { ImageUpload } from "@/shared/components/ui/image-upload";
import { toast } from "sonner";
import { useWorkspaceMutations } from "../hooks";
import { uploadWorkspaceLogo } from "@/shared/lib/firebase/storage";
import type { Workspace } from "../entity";

interface WorkspaceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace?: Workspace | null; // For editing
}

export function WorkspaceFormDialog({
  open,
  onOpenChange,
  workspace,
}: WorkspaceFormDialogProps) {
  const workspaceMutations = useWorkspaceMutations();
  const [loading, setLoading] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [logo, setLogo] = useState("");

  const isEditing = !!workspace;

  // Populate form when editing
  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description || "");
      setSlug(workspace.slug);
      setLogo(workspace.logo || "");
    } else {
      setName("");
      setDescription("");
      setSlug("");
      setLogo("");
    }
  }, [workspace, open]);

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEditing) {
      // Only auto-generate slug when creating new workspace
      const generatedSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setSlug(generatedSlug);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }

    setLoading(true);

    try {
      if (isEditing) {
        const result = await workspaceMutations.update(workspace.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          slug: slug.trim(),
          logo: logo.trim() || undefined,
        });

        if (result.success) {
          toast.success("Workspace updated successfully");
          onOpenChange(false);
        } else {
          toast.error(result.error?.message || "Failed to update workspace");
        }
      } else {
        const result = await workspaceMutations.create({
          name: name.trim(),
          description: description.trim() || undefined,
          slug: slug.trim(),
          logo: logo.trim() || undefined,
        });

        if (result.success) {
          toast.success("Workspace created successfully");
          onOpenChange(false);
        } else {
          toast.error(result.error?.message || "Failed to create workspace");
        }
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Workspace" : "Create Workspace"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update workspace details"
                : "Create a new workspace for your team"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="My Workspace"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">
                Slug <span className="text-red-500">*</span>
              </Label>
              <Input
                id="slug"
                placeholder="my-workspace"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={loading}
                required
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (lowercase, no spaces)
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of this workspace"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <ImageUpload
                value={logo}
                onChange={(url) => setLogo(url || "")}
                onUpload={(file, onProgress) => {
                  // We need workspace ID for upload
                  // For new workspaces, we'll use a temporary ID
                  const tempId = workspace?.id || `temp-${Date.now()}`;
                  return uploadWorkspaceLogo(file, tempId, onProgress);
                }}
                disabled={loading}
                label="Workspace Logo"
                description="Upload logo image (JPEG, PNG, GIF, or WebP - Max 5MB)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEditing ? "Save Changes" : "Create Workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
