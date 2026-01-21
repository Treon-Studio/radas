import React, { useEffect, useState } from "react";
import { Button } from "@radas/ui/ui/button";
import { Input } from "@radas/ui/ui/input";
import { Label } from "@radas/ui/ui/label";
import { Textarea } from "@radas/ui/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@radas/ui/ui/select";
import { ArrowLeft } from "lucide-react";
import type { JobPosition, CreateJobPositionDto, JobType, JobStatus } from "../entity";

interface JobPositionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position?: JobPosition;
  onSubmit: (data: CreateJobPositionDto) => Promise<void>;
  loading?: boolean;
}

export function JobPositionFormDialog({
  open,
  onOpenChange,
  position,
  onSubmit,
  loading,
}: JobPositionFormDialogProps) {
  if (!open) return null;
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState<JobType>("full_time" as JobType);
  const [description, setDescription] = useState("");
  const [openings, setOpenings] = useState(1);

  useEffect(() => {
    if (position) {
      setTitle(position.title);
      setDepartment(position.department);
      setLocation(position.location);
      setType(position.type);
      setDescription(position.description || "");
      setOpenings(position.openings);
    } else {
      setTitle("");
      setDepartment("");
      setLocation("");
      setType("full_time" as JobType);
      setDescription("");
      setOpenings(1);
    }
  }, [position]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !department.trim() || !location.trim()) return;

    await onSubmit({
      title: title.trim(),
      department: department.trim(),
      location: location.trim(),
      type,
      description: description.trim() || undefined,
      openings,
    } as CreateJobPositionDto);
  };

  return (
    <div className="absolute inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(false)}
          className="h-8 w-8 p-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">
            {position ? "Edit Position" : "Create New Position"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {position ? "Update job position details" : "Create a new job opening"}
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6">
          <div className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="title">
                Job Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Senior Software Engineer"
                required
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="department">
                  Department <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Engineering"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="location">
                  Location <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Remote"
                  required
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Job Type</Label>
                <Select value={type} onValueChange={(value) => setType(value as JobType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="internship">Internship</SelectItem>
                    <SelectItem value="freelance">Freelance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="openings">Openings</Label>
                <Input
                  id="openings"
                  type="number"
                  min={1}
                  value={openings}
                  onChange={(e) => setOpenings(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Job description..."
                rows={4}
              />
            </div>
          </div>

          {/* Footer - Sticky at bottom */}
          <div className="sticky bottom-0 bg-background border-t p-4 flex gap-2 justify-end mt-6 -mx-6 -mb-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !title.trim() || !department.trim() || !location.trim()}
            >
              {loading ? "Saving..." : position ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
