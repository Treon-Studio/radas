import React, { useState, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { Page, PageType, CreatePageDto } from "../entity";
import { PageType as PageTypeEnum } from "../entity";

interface PageFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page?: Page;
  defaultParentId?: string;
  defaultType?: PageType;
  onSubmit: (data: CreatePageDto) => void;
  loading?: boolean;
}

export function PageFormDialog({
  open,
  onOpenChange,
  page,
  defaultParentId,
  defaultType,
  onSubmit,
  loading,
}: PageFormDialogProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<PageType>(defaultType || PageTypeEnum.PAGE);
  const [icon, setIcon] = useState("");

  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setType(page.type);
      setIcon(page.icon || "");
    } else {
      setTitle("");
      setType(defaultType || PageTypeEnum.PAGE);
      setIcon("");
    }
  }, [page, defaultType, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;

    onSubmit({
      title: title.trim(),
      type,
      content: type === PageTypeEnum.PAGE ? "" : undefined,
      parentId: defaultParentId,
      icon: icon || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full h-screen m-0 rounded-none">
        <form onSubmit={handleSubmit} className="h-full flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {page ? "Rename" : `New ${type === PageTypeEnum.DIRECTORY ? "Folder" : "Page"}`}
            </DialogTitle>
            <DialogDescription>
              {page
                ? "Update the name of this item"
                : `Create a new ${type === PageTypeEnum.DIRECTORY ? "folder" : "page"} in your project`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <div className="max-w-2xl mx-auto p-6 grid gap-6">
              {!page && (
                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Select value={type} onValueChange={(value) => setType(value as PageType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PageTypeEnum.PAGE}>Page</SelectItem>
                      <SelectItem value={PageTypeEnum.DIRECTORY}>Folder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter title..."
                  autoFocus
                  className="text-lg"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="icon">Icon (optional)</Label>
                <Input
                  id="icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="😀"
                  maxLength={2}
                  className="text-2xl"
                />
                <p className="text-xs text-muted-foreground">
                  Add an emoji to personalize this item
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t p-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || loading}>
              {page ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
