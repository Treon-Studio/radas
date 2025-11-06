import React, { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/shared/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { useProjectTestCases, useTestCaseMutations } from "../hooks";
import type { TestCase, TestCaseTreeNode, TestCaseType, CreateTestCaseDto } from "../entity";
import { TestCaseType as TestCaseTypeEnum } from "../entity";
import { TestCaseTreeView } from "../components/test-case-tree-view";
import { TestCaseEditor } from "../components/test-case-editor";
import { TestCaseFormDialog } from "../components/test-case-form-dialog";
import { toast } from "sonner";

interface TestCasesSectionProps {
  projectId: string;
}

export function TestCasesSection({ projectId }: TestCasesSectionProps) {
  const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState<TestCaseTreeNode | undefined>();
  const [defaultParentId, setDefaultParentId] = useState<string | undefined>();
  const [defaultType, setDefaultType] = useState<TestCaseType | undefined>();
  const [deletingTestCaseId, setDeletingTestCaseId] = useState<string | undefined>();

  const { testCases, testCaseTree, loading } = useProjectTestCases(projectId);
  const testCaseMutations = useTestCaseMutations();

  const handleSelectTestCase = (testCase: TestCaseTreeNode) => {
    setSelectedTestCase(testCase);
    if (testCase.type === TestCaseTypeEnum.TEST_CASE) {
      setEditorOpen(true);
    }
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setSelectedTestCase(null);
  };

  const handleCreateTestCase = (parentId?: string, type?: TestCaseType) => {
    setEditingTestCase(undefined);
    setDefaultParentId(parentId);
    setDefaultType(type);
    setFormDialogOpen(true);
  };

  const handleEditTestCase = (testCase: TestCaseTreeNode) => {
    setEditingTestCase(testCase);
    setDefaultParentId(undefined);
    setDefaultType(undefined);
    setFormDialogOpen(true);
  };

  const handleFormSubmit = async (data: CreateTestCaseDto) => {
    if (editingTestCase) {
      // Update existing test case
      const result = await testCaseMutations.update(editingTestCase.id, {
        title: data.title,
        icon: data.icon,
      });

      if (result.success) {
        toast.success("Test case renamed");
        setFormDialogOpen(false);
        setEditingTestCase(undefined);
        // Update selected test case if it was the edited one
        const updatedTestCase = testCases.find((tc) => tc.id === editingTestCase.id);
        if (selectedTestCase?.id === editingTestCase.id && updatedTestCase) {
          setSelectedTestCase(updatedTestCase);
        }
      } else {
        toast.error("Failed to rename test case");
      }
    } else {
      // Create new test case
      const result = await testCaseMutations.create(projectId, data);
      if (result.success && 'id' in result && result.id) {
        toast.success(`${data.type === TestCaseTypeEnum.FOLDER ? "Folder" : "Test Case"} created`);
        setFormDialogOpen(false);
        setDefaultParentId(undefined);
        setDefaultType(undefined);
        // Select and open the new test case if it's a test case (not a folder)
        if (data.type === TestCaseTypeEnum.TEST_CASE) {
          const newTestCase = testCases.find((tc) => tc.id === result.id);
          if (newTestCase) {
            setSelectedTestCase(newTestCase);
            setEditorOpen(true);
          }
        }
      } else {
        toast.error("Failed to create");
      }
    }
  };

  const handleSaveTestCase = async (data: {
    title: string;
    description?: string;
    preconditions?: string;
    steps: any[];
    priority: any;
    status: any;
  }) => {
    if (!selectedTestCase) return;

    // Optimistic update - update selectedTestCase immediately with new data
    const optimisticTestCase = {
      ...selectedTestCase,
      title: data.title,
      description: data.description,
      preconditions: data.preconditions,
      steps: data.steps,
      priority: data.priority,
      status: data.status,
      updatedAt: new Date(),
    };
    setSelectedTestCase(optimisticTestCase);

    const result = await testCaseMutations.update(selectedTestCase.id, {
      title: data.title,
      description: data.description,
      preconditions: data.preconditions,
      steps: data.steps,
      priority: data.priority,
      status: data.status,
    });

    if (result.success) {
      toast.success("Test case saved");
      // The subscription will automatically update the testCases array
    } else {
      toast.error("Failed to save test case");
      // Revert optimistic update on error
      setSelectedTestCase(selectedTestCase);
    }
  };

  const handleDeleteTestCase = async (testCaseId: string) => {
    const result = await testCaseMutations.remove(testCaseId);
    if (result.success) {
      toast.success("Deleted");
      setDeletingTestCaseId(undefined);
      if (selectedTestCase?.id === testCaseId) {
        setSelectedTestCase(null);
        setEditorOpen(false);
      }
    } else {
      toast.error("Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading test cases...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Main Content - Test Case Tree (Full Width) */}
      <div className="h-full flex flex-col bg-background">
        <div className="px-4 py-3 border-b flex gap-2">
          <Button
            size="sm"
            onClick={() => handleCreateTestCase(undefined, TestCaseTypeEnum.TEST_CASE)}
            variant="ghost"
          >
            <Plus size={14} className="mr-1" />
            New Test
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleCreateTestCase(undefined, TestCaseTypeEnum.FOLDER)}
          >
            <Plus size={14} className="mr-1" />
            New Folder
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-4">
          <TestCaseTreeView
            nodes={testCaseTree}
            selectedTestCaseId={selectedTestCase?.id}
            onSelectTestCase={handleSelectTestCase}
            onCreateTestCase={handleCreateTestCase}
            onEditTestCase={handleEditTestCase}
            onDeleteTestCase={setDeletingTestCaseId}
          />
        </div>
      </div>

      {/* Full Screen Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={(open) => !open && handleCloseEditor()}>
        <DialogContent className="max-w-full h-screen m-0 p-0 rounded-none">
          <TestCaseEditor
            testCase={selectedTestCase}
            onSave={handleSaveTestCase}
            onCancel={handleCloseEditor}
            loading={testCaseMutations.loading}
          />
        </DialogContent>
      </Dialog>

      {/* Create/Edit Form Dialog */}
      <TestCaseFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        testCase={editingTestCase}
        defaultParentId={defaultParentId}
        defaultType={defaultType}
        onSubmit={handleFormSubmit}
        loading={testCaseMutations.loading}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingTestCaseId}
        onOpenChange={(open) => !open && setDeletingTestCaseId(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this item and all its content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTestCaseId && handleDeleteTestCase(deletingTestCaseId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
