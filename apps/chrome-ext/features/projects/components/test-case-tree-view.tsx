import React, { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FileText, MoreVertical, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import type { TestCaseTreeNode, TestCaseType } from "../entity";
import { TestCaseType as TestCaseTypeEnum } from "../entity";

interface TestCaseTreeViewProps {
  nodes: TestCaseTreeNode[];
  selectedTestCaseId?: string;
  onSelectTestCase: (testCase: TestCaseTreeNode) => void;
  onCreateTestCase: (parentId?: string, type?: TestCaseType) => void;
  onEditTestCase: (testCase: TestCaseTreeNode) => void;
  onDeleteTestCase: (testCaseId: string) => void;
}

export function TestCaseTreeView({
  nodes,
  selectedTestCaseId,
  onSelectTestCase,
  onCreateTestCase,
  onEditTestCase,
  onDeleteTestCase,
}: TestCaseTreeViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  const renderNode = (node: TestCaseTreeNode) => {
    const isFolder = node.type === TestCaseTypeEnum.FOLDER;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = node.id === selectedTestCaseId;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1.5 px-1 py-1 hover:bg-muted/50 rounded-sm cursor-pointer transition-colors ${
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
            onClick={() => onSelectTestCase(node)}
            className="flex-1 flex items-center gap-1.5 min-w-0 py-0.5 cursor-pointer"
          >
            {node.icon ? (
              <span className="text-base flex-shrink-0">{node.icon}</span>
            ) : (
              <div className="flex-shrink-0">
                {isFolder ? (
                  <Folder size={16} className="text-muted-foreground" />
                ) : (
                  <FileText size={16} className="text-muted-foreground" />
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
                <DropdownMenuItem onClick={() => onEditTestCase(node)}>
                  Rename
                </DropdownMenuItem>
                {isFolder && (
                  <>
                    <DropdownMenuItem onClick={() => onCreateTestCase(node.id, TestCaseTypeEnum.TEST_CASE)}>
                      New Test Case
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCreateTestCase(node.id, TestCaseTypeEnum.FOLDER)}>
                      New Folder
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDeleteTestCase(node.id)}
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
                  onCreateTestCase(node.id, TestCaseTypeEnum.TEST_CASE);
                }}
                className="h-6 w-6 p-0 hover:bg-muted ml-0.5"
              >
                <Plus size={14} className="text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>

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
        <FileText size={40} className="text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground/70 mb-4 text-center">
          No test cases yet
        </p>
      </div>
    );
  }

  return (
    <div className="py-1 px-1">
      {nodes.map((node) => renderNode(node))}
    </div>
  );
}
