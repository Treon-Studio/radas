import React from "react";
import { ExternalLink, Star, Edit, Trash, Eye } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import type { Link } from "../entity";

interface LinkItemProps {
  link: Link;
  onEdit?: (link: Link) => void;
  onDelete?: (linkId: string) => void;
  onToggleFavorite?: (linkId: string, isFavorite: boolean) => void;
  showActions?: boolean;
}

export function LinkItem({
  link,
  onEdit,
  onDelete,
  onToggleFavorite,
  showActions = true,
}: LinkItemProps) {
  const handleOpenLink = () => {
    window.open(link.url, "_blank");
  };

  const getFaviconUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch {
      return null;
    }
  };

  const faviconUrl = link.favicon || getFaviconUrl(link.url);

  return (
    <div className="group flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors border border-border">
      {/* Favicon */}
      <div className="flex-shrink-0 mt-0.5">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-5 h-5 rounded"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="w-5 h-5 rounded bg-muted flex items-center justify-center">
            <ExternalLink size={12} className="text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title and URL */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <button
              onClick={handleOpenLink}
              className="text-sm font-medium hover:underline text-left truncate block w-full"
            >
              {link.title}
            </button>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline truncate block"
            >
              {link.url}
            </a>
          </div>

          {/* Favorite Star */}
          {showActions && onToggleFavorite && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 flex-shrink-0"
              onClick={() => onToggleFavorite(link.id, !link.isFavorite)}
            >
              <Star
                size={14}
                className={link.isFavorite ? "fill-yellow-400 text-yellow-400" : ""}
              />
            </Button>
          )}
        </div>

        {/* Description */}
        {link.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {link.description}
          </p>
        )}

        {/* Tags */}
        {link.tags && link.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {link.tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className="text-xs px-1.5 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Stats and Actions */}
        <div className="flex items-center justify-between mt-2">
          {/* Visit Count */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {link.visitCount !== undefined && link.visitCount > 0 && (
              <span className="flex items-center gap-1">
                <Eye size={12} />
                {link.visitCount}
              </span>
            )}
          </div>

          {/* Actions */}
          {showActions && (
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
              {onEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => onEdit(link)}
                >
                  <Edit size={12} />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={() => onDelete(link.id)}
                >
                  <Trash size={12} />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
