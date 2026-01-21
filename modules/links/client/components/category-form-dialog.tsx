import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@radas/ui/ui/dialog";
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
import type { Category, CreateCategoryDto, UpdateCategoryDto } from "../entity";

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
  categories: Category[];
  parentId?: string;
  onSubmit: (data: CreateCategoryDto | UpdateCategoryDto) => Promise<void>;
  loading?: boolean;
}

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
];

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  categories,
  parentId,
  onSubmit,
  loading = false,
}: CategoryFormDialogProps) {
  const [formData, setFormData] = useState<CreateCategoryDto>({
    name: "",
    description: "",
    parentId: parentId || null,
    color: PRESET_COLORS[0],
    icon: "",
    order: 0,
  });

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        description: category.description || "",
        parentId: category.parentId || null,
        color: category.color || PRESET_COLORS[0],
        icon: category.icon || "",
        order: category.order || 0,
      });
    } else {
      setFormData({
        name: "",
        description: "",
        parentId: parentId || null,
        color: PRESET_COLORS[0],
        icon: "",
        order: 0,
      });
    }
  }, [category, parentId, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const availableParents = categories.filter(
    (c) => c.id !== category?.id // Can't be its own parent
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? "Edit Kategori" : "Tambah Kategori Baru"}
          </DialogTitle>
          <DialogDescription>
            {category
              ? "Ubah informasi kategori"
              : "Buat kategori baru untuk mengorganisir link Anda"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nama Kategori *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="Nama kategori"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Deskripsi singkat"
              rows={2}
            />
          </div>

          {/* Parent Category */}
          <div className="space-y-2">
            <Label htmlFor="parent">Kategori Induk</Label>
            <Select
              value={formData.parentId || "none"}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  parentId: value === "none" ? null : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih kategori induk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Root (tanpa induk)</SelectItem>
                {availableParents.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Warna</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    formData.color === color
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({ ...formData, color })}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan..." : category ? "Simpan" : "Tambah"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
