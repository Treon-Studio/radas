import React, { useState, useMemo } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@radas/ui/ui/button";
import { Input } from "@radas/ui/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@radas/ui/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radas/ui/ui/tabs";
import { CategoryTree } from "./components/category-tree";
import { LinksList } from "./components/links-list";
import { LinkFormDialog } from "./components/link-form-dialog";
import { CategoryFormDialog } from "./components/category-form-dialog";
import {
  useLinks,
  useLinkMutations,
  useCategoryTree,
  useCategoryMutations,
} from "./hooks";
import type { Link, LinkSortBy, SortDirection } from "./entity";
import { toast } from "sonner";

export function LinksPage() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<LinkSortBy>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Dialogs
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<Link | undefined>();
  const [editingCategoryId, setEditingCategoryId] = useState<string | undefined>();
  const [parentCategoryId, setParentCategoryId] = useState<string | undefined>();

  // Data hooks
  const { links, loading: linksLoading } = useLinks({}, "createdAt", "desc", true);
  const { categoryTree, categories, loading: categoriesLoading, error: categoriesError } = useCategoryTree(links);
  const linkMutations = useLinkMutations();
  const categoryMutations = useCategoryMutations();

  // Filtered links
  const filteredLinks = useMemo(() => {
    let result = [...links];

    // Filter by category
    if (selectedCategoryId) {
      result = result.filter((link) => link.categoryId === selectedCategoryId);
    }

    // Filter by favorites
    if (showFavoritesOnly) {
      result = result.filter((link) => link.isFavorite);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (link) =>
          link.title.toLowerCase().includes(query) ||
          link.url.toLowerCase().includes(query) ||
          link.description?.toLowerCase().includes(query) ||
          link.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Sort
    result.sort((a, b) => {
      let aValue: any = a[sortBy];
      let bValue: any = b[sortBy];

      // Handle dates
      if (sortBy === "createdAt" || sortBy === "updatedAt") {
        aValue = aValue?.seconds || 0;
        bValue = bValue?.seconds || 0;
      }

      // Handle strings
      if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortDirection === "asc") {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });

    return result;
  }, [links, selectedCategoryId, showFavoritesOnly, searchQuery, sortBy, sortDirection]);

  // Handlers - Links
  const handleAddLink = () => {
    setEditingLink(undefined);
    setLinkDialogOpen(true);
  };

  const handleEditLink = (link: Link) => {
    setEditingLink(link);
    setLinkDialogOpen(true);
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!confirm("Hapus link ini?")) return;

    const result = await linkMutations.remove(linkId);
    if (result.success) {
      toast.success("Link berhasil dihapus");
    } else {
      toast.error("Gagal menghapus link");
    }
  };

  const handleToggleFavorite = async (linkId: string, isFavorite: boolean) => {
    const result = await linkMutations.update(linkId, { isFavorite });
    if (result.success) {
      toast.success(isFavorite ? "Ditambahkan ke favorit" : "Dihapus dari favorit");
    }
  };

  const handleSubmitLink = async (data: any) => {
    try {
      if (editingLink) {
        const result = await linkMutations.update(editingLink.id, data);
        if (result.success) {
          toast.success("Link berhasil diperbarui");
          handleCloseLinkDialog();
        } else {
          toast.error("Gagal memperbarui link");
        }
      } else {
        const result = await linkMutations.create(data);
        if (result.success) {
          toast.success("Link berhasil ditambahkan");
          handleCloseLinkDialog();
        } else {
          toast.error("Gagal menambahkan link");
        }
      }
    } catch (error) {
      console.error("Error submitting link:", error);
      toast.error("Terjadi kesalahan");
    }
  };

  const handleCloseLinkDialog = () => {
    setLinkDialogOpen(false);
    setEditingLink(undefined);
  };

  // Handlers - Categories
  const handleAddCategory = (parentId?: string) => {
    setEditingCategoryId(undefined);
    setParentCategoryId(parentId);
    setCategoryDialogOpen(true);
  };

  const handleEditCategory = (categoryId: string) => {
    setEditingCategoryId(categoryId);
    setParentCategoryId(undefined);
    setCategoryDialogOpen(true);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const linksInCategory = links.filter((l) => l.categoryId === categoryId);

    if (linksInCategory.length > 0) {
      if (!confirm(`Kategori ini memiliki ${linksInCategory.length} link. Tetap hapus?`)) {
        return;
      }
    }

    const result = await categoryMutations.remove(categoryId);
    if (result.success) {
      toast.success("Kategori berhasil dihapus");
      if (selectedCategoryId === categoryId) {
        setSelectedCategoryId(undefined);
      }
    } else {
      toast.error("Gagal menghapus kategori");
    }
  };

  const handleSubmitCategory = async (data: any) => {
    try {
      if (editingCategoryId) {
        const result = await categoryMutations.update(editingCategoryId, data);
        if (result.success) {
          toast.success("Kategori berhasil diperbarui");
          handleCloseCategoryDialog();
        } else {
          toast.error("Gagal memperbarui kategori");
        }
      } else {
        const result = await categoryMutations.create(data);
        if (result.success) {
          toast.success("Kategori berhasil ditambahkan");
          handleCloseCategoryDialog();
        } else {
          toast.error("Gagal menambahkan kategori");
        }
      }
    } catch (error) {
      console.error("Error submitting category:", error);
      toast.error("Terjadi kesalahan");
    }
  };

  const handleCloseCategoryDialog = () => {
    setCategoryDialogOpen(false);
    setEditingCategoryId(undefined);
    setParentCategoryId(undefined);
  };

  const editingCategory = editingCategoryId
    ? categories.find((c) => c.id === editingCategoryId)
    : undefined;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Link Manager</h2>
          <Button size="sm" onClick={handleAddLink}>
            <Plus size={16} className="mr-1" />
            Tambah Link
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="space-y-2">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Cari link..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as LinkSortBy)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Terbaru</SelectItem>
                <SelectItem value="title">Judul</SelectItem>
                <SelectItem value="visitCount">Paling Sering</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortDirection}
              onValueChange={(value) => setSortDirection(value as SortDirection)}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">↓</SelectItem>
                <SelectItem value="asc">↑</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={showFavoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            >
              ⭐ Favorit
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="links" className="h-full flex flex-col">
          <TabsList className="mx-4 mt-2">
            <TabsTrigger value="links">Links</TabsTrigger>
            <TabsTrigger value="categories">Kategori</TabsTrigger>
          </TabsList>

          <TabsContent value="links" className="flex-1 overflow-auto p-4 mt-0">
            <LinksList
              links={filteredLinks}
              loading={linksLoading}
              onEdit={handleEditLink}
              onDelete={handleDeleteLink}
              onToggleFavorite={handleToggleFavorite}
              emptyMessage={
                searchQuery
                  ? "Tidak ada link yang cocok"
                  : selectedCategoryId
                    ? "Belum ada link di kategori ini"
                    : "Belum ada link. Tambahkan link pertama Anda!"
              }
            />
          </TabsContent>

          <TabsContent value="categories" className="flex-1 overflow-auto p-4 mt-0">
            {categoriesLoading && (
              <div className="text-center py-8 text-muted-foreground">
                Loading categories...
              </div>
            )}
            {!categoriesLoading && categoriesError && (
              <div className="text-center py-8">
                <div className="text-destructive mb-2">Error loading categories</div>
                <div className="text-sm text-muted-foreground">
                  {categoriesError.message || "Failed to load categories"}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Check browser console for details
                </div>
              </div>
            )}
            {!categoriesLoading && !categoriesError && (
              <CategoryTree
                categories={categoryTree}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={setSelectedCategoryId}
                onAddCategory={handleAddCategory}
                onEditCategory={handleEditCategory}
                onDeleteCategory={handleDeleteCategory}
                showActions
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <LinkFormDialog
        open={linkDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseLinkDialog();
          } else {
            setLinkDialogOpen(open);
          }
        }}
        link={editingLink}
        categories={categories}
        onSubmit={handleSubmitLink}
        loading={linkMutations.loading}
      />

      <CategoryFormDialog
        open={categoryDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseCategoryDialog();
          } else {
            setCategoryDialogOpen(open);
          }
        }}
        category={editingCategory}
        categories={categories}
        parentId={parentCategoryId}
        onSubmit={handleSubmitCategory}
        loading={categoryMutations.loading}
      />
    </div>
  );
}
