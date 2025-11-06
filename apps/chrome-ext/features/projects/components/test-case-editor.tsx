import React, { useState, useEffect } from "react";
import { Save, FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import type { TestCase, TestStep, TestCasePriority, TestCaseStatus } from "../entity";
import {
  TestCaseType,
  TestCasePriority as PriorityEnum,
  TestCaseStatus as StatusEnum,
  TEST_CASE_PRIORITY_LABELS,
  TEST_CASE_STATUS_LABELS,
} from "../entity";

interface TestCaseEditorProps {
  testCase: TestCase | null;
  onSave: (data: {
    title: string;
    description?: string;
    preconditions?: string;
    steps: TestStep[];
    priority: TestCasePriority;
    status: TestCaseStatus;
  }) => void;
  onCancel?: () => void;
  loading?: boolean;
}

export function TestCaseEditor({ testCase, onSave, onCancel, loading }: TestCaseEditorProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [preconditions, setPreconditions] = useState("");
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [priority, setPriority] = useState<TestCasePriority>(PriorityEnum.MEDIUM);
  const [status, setStatus] = useState<TestCaseStatus>(StatusEnum.DRAFT);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastTestCaseId, setLastTestCaseId] = useState<string | null>(null);

  // Load test case data only when test case changes (different test case selected)
  useEffect(() => {
    if (testCase && testCase.id !== lastTestCaseId) {
      setTitle(testCase.title);
      setDescription(testCase.description || "");
      setPreconditions(testCase.preconditions || "");
      setSteps(testCase.steps || []);
      setPriority(testCase.priority);
      setStatus(testCase.status);
      setHasChanges(false);
      setLastTestCaseId(testCase.id);
    }
  }, [testCase, lastTestCaseId]);

  const handleAddStep = () => {
    setSteps([...steps, { step: "", expectedResult: "" }]);
    setHasChanges(true);
  };

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleStepChange = (index: number, field: keyof TestStep, value: string) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
    setHasChanges(true);
  };

  const handleSave = () => {
    if (title.trim()) {
      onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        preconditions: preconditions.trim() || undefined,
        steps,
        priority,
        status,
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

  if (!testCase) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">No Test Case Selected</h3>
          <p className="text-sm text-muted-foreground">
            Select a test case from the sidebar to start editing
          </p>
        </div>
      </div>
    );
  }

  // Don't allow editing folders
  if (testCase.type === TestCaseType.FOLDER) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">Folder Selected</h3>
          <p className="text-sm text-muted-foreground">
            This is a folder. Select a test case to edit its details.
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
          onChange={(e) => {
            setTitle(e.target.value);
            setHasChanges(true);
          }}
          placeholder="Test case title..."
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
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Priority & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) => {
                  setPriority(value as TestCasePriority);
                  setHasChanges(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEST_CASE_PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as TestCaseStatus);
                  setHasChanges(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEST_CASE_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setHasChanges(true);
              }}
              placeholder="Describe what this test case validates..."
              className="min-h-[80px]"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Preconditions */}
          <div className="space-y-2">
            <Label>Preconditions</Label>
            <Textarea
              value={preconditions}
              onChange={(e) => {
                setPreconditions(e.target.value);
                setHasChanges(true);
              }}
              placeholder="What needs to be set up before running this test..."
              className="min-h-[60px]"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Test Steps */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Test Steps</Label>
              <Button size="sm" variant="outline" onClick={handleAddStep}>
                <Plus size={14} className="mr-1" />
                Add Step
              </Button>
            </div>
            <div className="space-y-3">
              {steps.length === 0 ? (
                <div className="text-center py-8 border border-dashed rounded-lg">
                  <p className="text-sm text-muted-foreground">No steps defined yet</p>
                  <Button size="sm" variant="ghost" onClick={handleAddStep} className="mt-2">
                    <Plus size={14} className="mr-1" />
                    Add First Step
                  </Button>
                </div>
              ) : (
                steps.map((step, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Step {index + 1}
                      </Label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveStep(index)}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Input
                        value={step.step}
                        onChange={(e) => handleStepChange(index, "step", e.target.value)}
                        placeholder="Action to perform..."
                        onKeyDown={handleKeyDown}
                      />
                      <Input
                        value={step.expectedResult}
                        onChange={(e) =>
                          handleStepChange(index, "expectedResult", e.target.value)
                        }
                        placeholder="Expected result..."
                        onKeyDown={handleKeyDown}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
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
