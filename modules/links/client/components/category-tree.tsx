import React, { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Edit, Trash } from "lucide-react";
import { Button } from "@radas/ui/ui/button";
import type { CategoryWithChildren } from "../entity";

interface CategoryTreeProps {
  categories: CategoryWithChildren[];
  selectedCategoryId?: string;
  onSelectCategory: (categoryId: string | undefined) => void;
  onAddCategory?: (parentId?: string) => void;
  onEditCategory?: (categoryId: string) => void;
  onDeleteCategory?: (categoryId: string) => void;
  showActions?: boolean;
}

interface CategoryNodeProps {
  category: CategoryWithChildren;
  level: number;
  isSelected: boolean;
  onSelect: (categoryId: string | undefined) => void;
  onAddChild?: (parentId: string) => void;
  onEdit?: (categoryId: string) => void;
  onDelete?: (categoryId: string) => void;
  showActions?: boolean;
}

function CategoryNode({
  category,
  level,
  isSelected,
  onSelect,
  onAddChild,
  onEdit,
  onDelete,
  showActions = false,
}: CategoryNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = category.children && category.children.length > 0;

  return (
    <div>
      <div
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer
          hover:bg-accent transition-colors group
          ${isSelected ? "bg-accent" : ""}
        `}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {/* Expand/Collapse Icon */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="p-0.5 hover:bg-muted rounded"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={16} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={16} className="text-muted-foreground" />
            )
          ) : (
            <div className="w-4" />
          )}
        </button>

        {/* Folder Icon */}
        <div
          onClick={() => onSelect(category.id)}
          className="flex items-center gap-2 flex-1"
        >
          {isExpanded && hasChildren ? (
            <FolderOpen
              size={16}
              className="text-muted-foreground"
              style={{ color: category.color }}
            />
          ) : (
            <Folder
              size={16}
              className="text-muted-foreground"
              style={{ color: category.color }}
            />
          )}

          {/* Category Name */}
          <span className="text-sm flex-1">{category.name}</span>

          {/* Link Count */}
          {category.linkCount !== undefined && category.linkCount > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {category.linkCount}
            </span>
          )}
        </div>

        {/* Actions */}
        {showActions && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
            {onAddChild && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChild(category.id);
                }}
              >
                <Plus size={14} />
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(category.id);
                }}
              >
                <Edit size={14} />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(category.id);
                }}
              >
                <Trash size={14} />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {category.children.map((child) => (
            <CategoryNode
              key={child.id}
              category={child}
              level={level + 1}
              isSelected={child.id === category.id}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              showActions={showActions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryTree({
  categories,
  selectedCategoryId,
  onSelectCategory,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  showActions = false,
}: CategoryTreeProps) {
  return (
    <div className="space-y-1">
      {/* All Links */}
      <div
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer
          hover:bg-accent transition-colors
          ${!selectedCategoryId ? "bg-accent" : ""}
        `}
        onClick={() => onSelectCategory(undefined)}
      >
        <div className="w-4" />
        <Folder size={16} className="text-muted-foreground" />
        <span className="text-sm flex-1">Semua Link</span>
      </div>

      {/* Categories */}
      {categories.map((category) => (
        <CategoryNode
          key={category.id}
          category={category}
          level={0}
          isSelected={selectedCategoryId === category.id}
          onSelect={onSelectCategory}
          onAddChild={onAddCategory}
          onEdit={onEditCategory}
          onDelete={onDeleteCategory}
          showActions={showActions}
        />
      ))}

      {/* Add Root Category */}
      {showActions && onAddCategory && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={() => onAddCategory()}
        >
          <Plus size={14} className="mr-2" />
          Tambah Kategori
        </Button>
      )}
    </div>
  );
}
