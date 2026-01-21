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
import { Switch } from "@radas/ui/ui/switch";
import type { Link, Category, CreateLinkDto, UpdateLinkDto } from "../entity";

interface LinkFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link?: Link;
  categories: Category[];
  onSubmit: (data: CreateLinkDto | UpdateLinkDto) => Promise<void>;
  loading?: boolean;
}

export function LinkFormDialog({
  open,
  onOpenChange,
  link,
  categories,
  onSubmit,
  loading = false,
}: LinkFormDialogProps) {
  const [formData, setFormData] = useState<CreateLinkDto>({
    title: "",
    url: "",
    description: "",
    categoryId: undefined,
    tags: [],
    isFavorite: false,
  });
  const [tagsInput, setTagsInput] = useState("");

  useEffect(() => {
    if (link) {
      setFormData({
        title: link.title,
        url: link.url,
        description: link.description || "",
        categoryId: link.categoryId,
        tags: link.tags || [],
        isFavorite: link.isFavorite || false,
      });
      setTagsInput(link.tags?.join(", ") || "");
    } else {
      setFormData({
        title: "",
        url: "",
        description: "",
        categoryId: undefined,
        tags: [],
        isFavorite: false,
      });
      setTagsInput("");
    }
  }, [link, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const tags = tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    await onSubmit({
      ...formData,
      tags,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{link ? "Edit Link" : "Tambah Link Baru"}</DialogTitle>
          <DialogDescription>
            {link
              ? "Ubah informasi link"
              : "Tambahkan link baru ke koleksi Anda"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Judul *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Nama link"
              required
            />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url">URL *</Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com"
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
              placeholder="Deskripsi singkat tentang link ini"
              rows={3}
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="category">Kategori</Label>
            <Select
              value={formData.categoryId || "none"}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  categoryId: value === "none" ? undefined : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Tanpa kategori</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tag1, tag2, tag3"
            />
            <p className="text-xs text-muted-foreground">
              Pisahkan dengan koma
            </p>
          </div>

          {/* Favorite */}
          <div className="flex items-center justify-between">
            <Label htmlFor="favorite">Favorit</Label>
            <Switch
              id="favorite"
              checked={formData.isFavorite}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, isFavorite: checked })
              }
            />
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
              {loading ? "Menyimpan..." : link ? "Simpan" : "Tambah"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
