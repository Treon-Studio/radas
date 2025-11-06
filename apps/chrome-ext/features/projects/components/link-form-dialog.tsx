import React, { useState, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
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
import type { Link, LinkType, CreateLinkDto, LinkCategory } from "../entity";
import { LinkType as LinkTypeEnum, LinkCategory as LinkCategoryEnum, LINK_CATEGORY_LABELS } from "../entity";

interface LinkFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link?: Link;
  defaultParentId?: string;
  defaultType?: LinkType;
  onSubmit: (data: CreateLinkDto) => void;
  loading?: boolean;
}

export function LinkFormDialog({
  open,
  onOpenChange,
  link,
  defaultParentId,
  defaultType,
  onSubmit,
  loading,
}: LinkFormDialogProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<LinkType>(defaultType || LinkTypeEnum.LINK);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<LinkCategory>(LinkCategoryEnum.OTHER);
  const [icon, setIcon] = useState("");

  useEffect(() => {
    if (link) {
      setTitle(link.title);
      setType(link.type);
      setUrl(link.url || "");
      setDescription(link.description || "");
      setCategory(link.category || LinkCategoryEnum.OTHER);
      setIcon(link.icon || "");
    } else {
      setTitle("");
      setType(defaultType || LinkTypeEnum.LINK);
      setUrl("");
      setDescription("");
      setCategory(LinkCategoryEnum.OTHER);
      setIcon("");
    }
  }, [link, defaultType, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;
    if (type === LinkTypeEnum.LINK && !url.trim()) return;

    onSubmit({
      title: title.trim(),
      type,
      url: type === LinkTypeEnum.LINK ? url.trim() : undefined,
      description: description.trim() || undefined,
      category: type === LinkTypeEnum.LINK ? category : undefined,
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
              {link
                ? "Rename"
                : `New ${type === LinkTypeEnum.FOLDER ? "Folder" : "Link"}`}
            </DialogTitle>
            <DialogDescription>
              {link
                ? "Update the name of this item"
                : `Create a new ${
                    type === LinkTypeEnum.FOLDER ? "folder" : "link"
                  } in your project`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <div className="max-w-2xl mx-auto p-6 grid gap-6">
              {!link && (
                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={type}
                    onValueChange={(value) => setType(value as LinkType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LinkTypeEnum.LINK}>Link</SelectItem>
                      <SelectItem value={LinkTypeEnum.FOLDER}>Folder</SelectItem>
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

              {type === LinkTypeEnum.LINK && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="url">URL</Label>
                    <Input
                      id="url"
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="text-base font-mono"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={category}
                      onValueChange={(value) => setCategory(value as LinkCategory)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(LinkCategoryEnum).map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {LINK_CATEGORY_LABELS[cat]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Add a description..."
                      rows={3}
                    />
                  </div>
                </>
              )}

              <div className="grid gap-2">
                <Label htmlFor="icon">Icon (optional)</Label>
                <Input
                  id="icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="🔗"
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
            <Button
              type="submit"
              disabled={
                !title.trim() ||
                (type === LinkTypeEnum.LINK && !url.trim()) ||
                loading
              }
            >
              {link ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
