import React, { useState, useEffect } from "react";
import { Save, Link as LinkIcon, ExternalLink } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { Link, LinkCategory } from "../entity";
import { LinkType, LinkCategory as LinkCategoryEnum, LINK_CATEGORY_LABELS } from "../entity";

interface LinkEditorProps {
  link: Link | null;
  onSave: (data: {
    title: string;
    url?: string;
    description?: string;
    category?: LinkCategory;
  }) => void;
  onCancel?: () => void;
  loading?: boolean;
}

export function LinkEditor({ link, onSave, onCancel, loading }: LinkEditorProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<LinkCategory>(LinkCategoryEnum.OTHER);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastLinkId, setLastLinkId] = useState<string | null>(null);

  // Load link data only when link changes (different link selected)
  useEffect(() => {
    if (link && link.id !== lastLinkId) {
      setTitle(link.title);
      setUrl(link.url || "");
      setDescription(link.description || "");
      setCategory(link.category || LinkCategoryEnum.OTHER);
      setHasChanges(false);
      setLastLinkId(link.id);
    }
  }, [link, lastLinkId]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setHasChanges(true);
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setHasChanges(true);
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    setHasChanges(true);
  };

  const handleCategoryChange = (value: LinkCategory) => {
    setCategory(value);
    setHasChanges(true);
  };

  const handleSave = () => {
    if (title.trim() && (link?.type === LinkType.FOLDER || url.trim())) {
      onSave({
        title: title.trim(),
        url: url.trim() || undefined,
        description: description.trim() || undefined,
        category: category || undefined,
      });
      setHasChanges(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + S to save
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  const handleOpenLink = () => {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  if (!link) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <LinkIcon size={48} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">No Link Selected</h3>
          <p className="text-sm text-muted-foreground">
            Select a link from the sidebar to view or edit
          </p>
        </div>
      </div>
    );
  }

  // Don't allow editing folders - they're just containers
  if (link.type === LinkType.FOLDER) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <LinkIcon size={48} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">Folder Selected</h3>
          <p className="text-sm text-muted-foreground">
            This is a folder. Select a link to view or edit its details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Editor Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-background flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Link Details</h2>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
          {url && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenLink}
            >
              <ExternalLink size={14} className="mr-1" />
              Open
            </Button>
          )}
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || !title.trim() || !url.trim() || loading}
          >
            <Save size={14} className="mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-6 grid gap-6">
          {/* Title */}
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Link title..."
              className="text-base"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* URL */}
          <div className="grid gap-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://example.com"
              className="text-base font-mono"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Category */}
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger id="category">
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

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Add a description..."
              rows={4}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>
      </div>

      {/* Help Text */}
      <div className="flex-shrink-0 px-4 py-2 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground">
          Press <kbd className="px-1 py-0.5 bg-background border rounded text-xs">Cmd/Ctrl + S</kbd> to save
        </p>
      </div>
    </div>
  );
}
