import React from "react";
import { LinkItem } from "./link-item";
import type { Link } from "../entity";

interface LinksListProps {
  links: Link[];
  loading?: boolean;
  onEdit?: (link: Link) => void;
  onDelete?: (linkId: string) => void;
  onToggleFavorite?: (linkId: string, isFavorite: boolean) => void;
  showActions?: boolean;
  emptyMessage?: string;
}

export function LinksList({
  links,
  loading = false,
  onEdit,
  onDelete,
  onToggleFavorite,
  showActions = true,
  emptyMessage = "Belum ada link",
}: LinksListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-lg bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {links.map((link) => (
        <LinkItem
          key={link.id}
          link={link}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleFavorite={onToggleFavorite}
          showActions={showActions}
        />
      ))}
    </div>
  );
}
