import React, { useState } from "react";
import { ChevronRight, ChevronDown, Folder, Link as LinkIcon, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { LinkTreeNode, LinkType } from "../entity";
import { LinkType as LinkTypeEnum } from "../entity";

interface LinkTreeViewProps {
  nodes: LinkTreeNode[];
  selectedLinkId?: string;
  onSelectLink: (link: LinkTreeNode) => void;
  onCreateLink: (parentId?: string, type?: LinkType) => void;
  onEditLink: (link: LinkTreeNode) => void;
  onDeleteLink: (linkId: string) => void;
  onMoveLink?: (linkId: string, newParentId: string | undefined, newOrder: number) => void;
}

export function LinkTreeView({
  nodes,
  selectedLinkId,
  onSelectLink,
  onCreateLink,
  onEditLink,
  onDeleteLink,
  onMoveLink,
}: LinkTreeViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeNode, setActiveNode] = useState<LinkTreeNode | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const toggleExpanded = (nodeId: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const node = event.active.data.current?.node as LinkTreeNode;
    setActiveNode(node);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | null;
    setDragOverId(overId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !onMoveLink) {
      setActiveNode(null);
      setDragOverId(null);
      return;
    }

    const draggedNode = active.data.current?.node as LinkTreeNode;
    const dropTargetId = over.id as string;

    // Don't allow dropping on itself
    if (draggedNode.id === dropTargetId) {
      setActiveNode(null);
      setDragOverId(null);
      return;
    }

    // Find the drop target node
    const findNode = (nodes: LinkTreeNode[]): LinkTreeNode | null => {
      for (const node of nodes) {
        if (node.id === dropTargetId) return node;
        const found = findNode(node.children);
        if (found) return found;
      }
      return null;
    };

    const dropTarget = findNode(nodes);

    // Don't allow dropping a folder into its own children
    if (draggedNode.type === LinkTypeEnum.FOLDER && dropTarget) {
      const isDescendant = (node: LinkTreeNode, ancestorId: string): boolean => {
        if (node.id === ancestorId) return true;
        return node.children.some(child => isDescendant(child, ancestorId));
      };
      if (isDescendant(draggedNode, dropTargetId)) {
        setActiveNode(null);
        setDragOverId(null);
        return;
      }
    }

    // Determine new parent (only folders can be parents, or root if dropped on "root")
    let newParentId: string | undefined;
    if (dropTargetId === "root") {
      newParentId = undefined;
    } else if (dropTarget?.type === LinkTypeEnum.FOLDER) {
      newParentId = dropTargetId;
      // Auto-expand the folder when something is dropped into it
      if (!expandedIds.has(dropTargetId)) {
        toggleExpanded(dropTargetId);
      }
    } else {
      // If dropped on a link (not folder), use its parent
      newParentId = dropTarget?.parentId;
    }

    // Calculate new order (append to end of siblings)
    const siblings = nodes.filter(n => n.parentId === newParentId);
    const newOrder = siblings.length;

    onMoveLink(draggedNode.id, newParentId, newOrder);

    setActiveNode(null);
    setDragOverId(null);
  };

  const DraggableTreeNode = ({ node, children }: { node: LinkTreeNode; children: React.ReactNode }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: node.id,
      data: { node },
    });

    const { setNodeRef: setDropRef, isOver } = useDroppable({
      id: node.id,
      data: { node },
    });

    const style = transform
      ? {
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
          opacity: isDragging ? 0.5 : 1,
        }
      : undefined;

    const isFolder = node.type === LinkTypeEnum.FOLDER;
    const isDraggedOver = dragOverId === node.id && isFolder;

    return (
      <div ref={setDropRef}>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          className={isDraggedOver ? "bg-primary/10 rounded" : ""}
        >
          {children}
        </div>
      </div>
    );
  };

  const renderNode = (node: LinkTreeNode) => {
    const isFolder = node.type === LinkTypeEnum.FOLDER;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = node.id === selectedLinkId;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id}>
        <DraggableTreeNode node={node}>
          <div
            className={`group flex items-center gap-1.5 px-1 py-1 hover:bg-muted/50 rounded-sm transition-colors ${
              isSelected ? "bg-muted/70" : ""
            }`}
            style={{ paddingLeft: `${node.depth * 18 + 4}px` }}
          >
          {/* Expand/Collapse Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isFolder || hasChildren) {
                toggleExpanded(node.id);
              }
            }}
            className="h-5 w-5 flex items-center justify-center flex-shrink-0 hover:bg-muted/70 rounded transition-colors"
          >
            {(isFolder || hasChildren) && (
              isExpanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />
            )}
          </button>

          {/* Icon + Title - Clickable area */}
          <div
            onClick={() => onSelectLink(node)}
            className="flex-1 flex items-center gap-1.5 min-w-0 py-0.5 cursor-pointer"
          >
            {node.icon ? (
              <span className="text-base flex-shrink-0">{node.icon}</span>
            ) : (
              <div className="flex-shrink-0">
                {isFolder ? (
                  <Folder size={16} className="text-muted-foreground" />
                ) : (
                  <LinkIcon size={16} className="text-muted-foreground" />
                )}
              </div>
            )}
            <span className="text-sm truncate text-foreground/90">{node.title}</span>
          </div>

          {/* Actions */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center flex-shrink-0 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 hover:bg-muted"
                >
                  <MoreVertical size={14} className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEditLink(node)}>
                  Rename
                </DropdownMenuItem>
                {isFolder && (
                  <>
                    <DropdownMenuItem onClick={() => onCreateLink(node.id, LinkTypeEnum.LINK)}>
                      New Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCreateLink(node.id, LinkTypeEnum.FOLDER)}>
                      New Folder
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDeleteLink(node.id)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {isFolder && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateLink(node.id, LinkTypeEnum.LINK);
                }}
                className="h-6 w-6 p-0 hover:bg-muted ml-0.5"
              >
                <Plus size={14} className="text-muted-foreground" />
              </Button>
            )}
          </div>
          </div>
        </DraggableTreeNode>

        {/* Render Children */}
        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <LinkIcon size={40} className="text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground/70 mb-4 text-center">
          No links yet
        </p>
      </div>
    );
  }

  const RootDroppable = () => {
    const { setNodeRef } = useDroppable({
      id: "root",
    });

    return (
      <div ref={setNodeRef} className="py-1 px-1 min-h-[200px]">
        {nodes.map((node) => renderNode(node))}
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <RootDroppable />
      <DragOverlay>
        {activeNode && (
          <div className="bg-background border rounded-sm shadow-lg opacity-90 px-1 py-1">
            <div className="flex items-center gap-1.5">
              {activeNode.icon ? (
                <span className="text-base">{activeNode.icon}</span>
              ) : (
                activeNode.type === LinkTypeEnum.FOLDER ? (
                  <Folder size={16} className="text-muted-foreground" />
                ) : (
                  <LinkIcon size={16} className="text-muted-foreground" />
                )
              )}
              <span className="text-sm text-foreground/90">{activeNode.title}</span>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
