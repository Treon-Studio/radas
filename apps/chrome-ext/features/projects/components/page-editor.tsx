import React, { useState, useEffect } from "react";
import { Save, FileText } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import type { Page } from "../entity";
import { PageType } from "../entity";

interface PageEditorProps {
  page: Page | null;
  onSave: (title: string, content: string) => void;
  onCancel?: () => void;
  loading?: boolean;
}

export function PageEditor({ page, onSave, onCancel, loading }: PageEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [lastPageId, setLastPageId] = useState<string | null>(null);

  // Load page data only when page changes (different page selected)
  useEffect(() => {
    if (page && page.id !== lastPageId) {
      setTitle(page.title);
      setContent(page.content || "");
      setHasChanges(false);
      setLastPageId(page.id);
    }
  }, [page, lastPageId]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setHasChanges(true);
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasChanges(true);
  };

  const handleSave = () => {
    if (title.trim()) {
      onSave(title.trim(), content);
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

  if (!page) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">No Page Selected</h3>
          <p className="text-sm text-muted-foreground">
            Select a page from the sidebar to start editing
          </p>
        </div>
      </div>
    );
  }

  // Don't allow editing directories
  if (page.type === PageType.DIRECTORY) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">Folder Selected</h3>
          <p className="text-sm text-muted-foreground">
            This is a folder. Select a page to edit its content.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Editor Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-background flex items-center justify-between gap-3">
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Page title..."
          className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 px-0"
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || !title.trim() || loading}
          >
            <Save size={14} className="mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-hidden">
        <Textarea
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Start writing..."
          className="h-full w-full resize-none border-none shadow-none focus-visible:ring-0 p-4 font-mono text-sm"
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Help Text */}
      <div className="flex-shrink-0 px-4 py-2 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground">
          Supports Markdown formatting • Press <kbd className="px-1 py-0.5 bg-background border rounded text-xs">Cmd/Ctrl + S</kbd> to save
        </p>
      </div>
    </div>
  );
}
