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
import type { TestCase, TestCaseType, CreateTestCaseDto } from "../entity";
import { TestCaseType as TestCaseTypeEnum } from "../entity";

interface TestCaseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testCase?: TestCase;
  defaultParentId?: string;
  defaultType?: TestCaseType;
  onSubmit: (data: CreateTestCaseDto) => void;
  loading?: boolean;
}

export function TestCaseFormDialog({
  open,
  onOpenChange,
  testCase,
  defaultParentId,
  defaultType,
  onSubmit,
  loading,
}: TestCaseFormDialogProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TestCaseType>(defaultType || TestCaseTypeEnum.TEST_CASE);
  const [icon, setIcon] = useState("");

  useEffect(() => {
    if (testCase) {
      setTitle(testCase.title);
      setType(testCase.type);
      setIcon(testCase.icon || "");
    } else {
      setTitle("");
      setType(defaultType || TestCaseTypeEnum.TEST_CASE);
      setIcon("");
    }
  }, [testCase, defaultType, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;

    onSubmit({
      title: title.trim(),
      type,
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
              {testCase
                ? "Rename"
                : `New ${type === TestCaseTypeEnum.FOLDER ? "Folder" : "Test Case"}`}
            </DialogTitle>
            <DialogDescription>
              {testCase
                ? "Update the name of this item"
                : `Create a new ${
                    type === TestCaseTypeEnum.FOLDER ? "folder" : "test case"
                  } in your project`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <div className="max-w-2xl mx-auto p-6 grid gap-6">
              {!testCase && (
                <div className="grid gap-2">
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={type}
                    onValueChange={(value) => setType(value as TestCaseType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TestCaseTypeEnum.TEST_CASE}>Test Case</SelectItem>
                      <SelectItem value={TestCaseTypeEnum.FOLDER}>Folder</SelectItem>
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
                  placeholder="📝"
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
              {testCase ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
