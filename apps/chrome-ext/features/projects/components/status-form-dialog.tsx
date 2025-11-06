import React, { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import type { ProjectStatus, CreateProjectStatusDto } from "../entity";

interface StatusFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status?: ProjectStatus;
  existingStatuses: ProjectStatus[];
  onSubmit: (data: CreateProjectStatusDto) => Promise<void>;
  loading?: boolean;
}

export function StatusFormDialog({
  open,
  onOpenChange,
  status,
  existingStatuses,
  onSubmit,
  loading,
}: StatusFormDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [order, setOrder] = useState(1);
  const [isDefault, setIsDefault] = useState(false);
  const [isFinal, setIsFinal] = useState(false);

  useEffect(() => {
    if (status) {
      setName(status.name);
      setColor(status.color);
      setOrder(status.order);
      setIsDefault(status.isDefault || false);
      setIsFinal(status.isFinal || false);
    } else {
      setName("");
      setColor("#3b82f6");
      // Auto set order to be after last status
      const maxOrder = Math.max(0, ...existingStatuses.map((s) => s.order));
      setOrder(maxOrder + 1);
      setIsDefault(false);
      setIsFinal(false);
    }
  }, [status, existingStatuses, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    await onSubmit({
      name: name.trim(),
      color,
      order,
      isDefault,
      isFinal,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{status ? "Edit Status" : "Create New Status"}</DialogTitle>
            <DialogDescription>
              {status ? "Update status details" : "Add a new status to your workflow"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">
                Status Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="In Progress"
                required
              />
            </div>

            {/* Color */}
            <div className="grid gap-2">
              <Label htmlFor="color">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{color}</span>
              </div>
            </div>

            {/* Order */}
            <div className="grid gap-2">
              <Label htmlFor="order">
                Order <span className="text-destructive">*</span>
              </Label>
              <Input
                id="order"
                type="number"
                min="1"
                value={order}
                onChange={(e) => setOrder(parseInt(e.target.value) || 1)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Position in the board (1 = first column)
              </p>
            </div>

            {/* Flags */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isDefault"
                  checked={isDefault}
                  onCheckedChange={(checked) => setIsDefault(checked as boolean)}
                />
                <Label
                  htmlFor="isDefault"
                  className="text-sm font-normal cursor-pointer"
                >
                  Default status for new tasks
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isFinal"
                  checked={isFinal}
                  onCheckedChange={(checked) => setIsFinal(checked as boolean)}
                />
                <Label
                  htmlFor="isFinal"
                  className="text-sm font-normal cursor-pointer"
                >
                  Final status (completed state)
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Saving..." : status ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
