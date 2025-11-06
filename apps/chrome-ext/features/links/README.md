# Links Module

Module untuk mengelola dan mengorganisir link/bookmark dengan sistem kategori nested.

## Fitur

### 📌 Link Management
- ✅ Tambah, edit, dan hapus link
- ✅ Simpan URL dengan judul dan deskripsi
- ✅ Auto-fetch favicon dari URL
- ✅ Tandai link sebagai favorit
- ✅ Tag system untuk link
- ✅ Track visit count
- ✅ Search & filter links
- ✅ Sort by: tanggal, judul, atau visit count

### 📁 Category Management
- ✅ Buat kategori untuk mengorganisir links
- ✅ **Nested categories** - kategori bisa punya sub-kategori
- ✅ Color coding untuk kategori
- ✅ Drag & drop untuk reorder (planned)
- ✅ Link count per kategori
- ✅ Breadcrumb navigation

### 🎨 UI Components
- ✅ Tree view untuk nested categories
- ✅ Card-based link display
- ✅ Modal forms untuk add/edit
- ✅ Real-time updates (Firestore)
- ✅ Loading states & skeletons
- ✅ Toast notifications

## Struktur Data

### Link
```typescript
interface Link {
  id: string;
  title: string;
  url: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  favicon?: string;
  userId: string;
  isFavorite?: boolean;
  visitCount?: number;
  lastVisited?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Category
```typescript
interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string | null; // null = root category
  userId: string;
  color?: string;
  icon?: string;
  order?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

## Firestore Collections

### `links`
Menyimpan semua link user:
```
links/{linkId}
  - title: string
  - url: string
  - userId: string (indexed)
  - categoryId: string (indexed)
  - ...
```

### `link_categories`
Menyimpan kategori dengan support nested:
```
link_categories/{categoryId}
  - name: string
  - userId: string (indexed)
  - parentId: string | null (indexed)
  - ...
```

## Nested Categories

Kategori bisa memiliki struktur nested seperti:

```
📁 Development
  ├─ 📁 Frontend
  │  ├─ 📁 React
  │  ├─ 📁 Vue
  │  └─ 📁 CSS
  └─ 📁 Backend
     ├─ 📁 Node.js
     └─ 📁 Python

📁 Design
  ├─ 📁 UI/UX
  └─ 📁 Resources

📁 Personal
```

## Penggunaan

### Import Hook

```tsx
import { useLinks, useLinkMutations, useCategoryTree } from "@/features/links/hooks";
```

### Menggunakan Links

```tsx
function MyComponent() {
  // Get all links with real-time updates
  const { links, loading, error } = useLinks();

  // Get links with filters
  const { links: favoriteLinks } = useLinks({
    isFavorite: true,
  });

  // CRUD operations
  const { create, update, remove } = useLinkMutations();

  const handleAddLink = async () => {
    await create({
      title: "Google",
      url: "https://google.com",
      categoryId: "cat-123",
      tags: ["search", "tool"],
      isFavorite: true,
    });
  };

  return (
    <div>
      {links.map((link) => (
        <div key={link.id}>{link.title}</div>
      ))}
    </div>
  );
}
```

### Menggunakan Categories

```tsx
function CategoryView() {
  // Get category tree with link counts
  const { categoryTree, categories, loading } = useCategoryTree(links);

  // CRUD operations
  const { create, update, remove } = useCategoryMutations();

  const handleAddCategory = async () => {
    await create({
      name: "Development",
      parentId: null, // Root category
      color: "#3b82f6",
    });
  };

  const handleAddSubcategory = async (parentId: string) => {
    await create({
      name: "Frontend",
      parentId: parentId, // Nested under parent
      color: "#22c55e",
    });
  };

  return (
    <CategoryTree
      categories={categoryTree}
      selectedCategoryId={selectedId}
      onSelectCategory={setSelectedId}
      showActions
    />
  );
}
```

## Components

### CategoryTree
Tree view untuk menampilkan nested categories:

```tsx
<CategoryTree
  categories={categoryTree}
  selectedCategoryId={selectedCategoryId}
  onSelectCategory={(id) => setSelectedCategoryId(id)}
  onAddCategory={(parentId) => handleAdd(parentId)}
  onEditCategory={(id) => handleEdit(id)}
  onDeleteCategory={(id) => handleDelete(id)}
  showActions={true}
/>
```

### LinksList
List view untuk menampilkan links:

```tsx
<LinksList
  links={filteredLinks}
  loading={loading}
  onEdit={(link) => setEditingLink(link)}
  onDelete={(id) => handleDelete(id)}
  onToggleFavorite={(id, isFavorite) => handleToggleFavorite(id, isFavorite)}
  showActions={true}
  emptyMessage="Belum ada link"
/>
```

### LinkFormDialog
Modal form untuk add/edit link:

```tsx
<LinkFormDialog
  open={dialogOpen}
  onOpenChange={setDialogOpen}
  link={editingLink}
  categories={categories}
  onSubmit={handleSubmit}
  loading={loading}
/>
```

### CategoryFormDialog
Modal form untuk add/edit category:

```tsx
<CategoryFormDialog
  open={dialogOpen}
  onOpenChange={setDialogOpen}
  category={editingCategory}
  categories={categories}
  parentId={parentCategoryId}
  onSubmit={handleSubmit}
  loading={loading}
/>
```

## Helper Functions

### buildCategoryTree
Mengubah flat categories menjadi tree structure:

```typescript
const tree = buildCategoryTree(categories, links);
// Returns: CategoryWithChildren[] with nested structure
```

### getCategoryPath
Mendapatkan breadcrumb path untuk kategori:

```typescript
const path = getCategoryPath(categoryId, categories);
// Returns: [rootCategory, parentCategory, currentCategory]
```

### getAllSubcategoryIds
Mendapatkan semua ID subcategory (recursive):

```typescript
const subcategoryIds = getAllSubcategoryIds(categoryId, categories);
// Returns: ["cat-1", "cat-2", "cat-3", ...] (termasuk categoryId sendiri)
```

## Firestore Security Rules

Tambahkan rules berikut ke Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Links
    match /links/{linkId} {
      allow read, write: if request.auth != null &&
                          request.auth.uid == resource.data.userId;
      allow create: if request.auth != null &&
                     request.auth.uid == request.resource.data.userId;
    }

    // Categories
    match /link_categories/{categoryId} {
      allow read, write: if request.auth != null &&
                          request.auth.uid == resource.data.userId;
      allow create: if request.auth != null &&
                     request.auth.uid == request.resource.data.userId;
    }
  }
}
```

## Features Roadmap

### ✅ Implemented
- [x] CRUD operations for links
- [x] CRUD operations for categories
- [x] Nested categories (unlimited depth)
- [x] Real-time updates
- [x] Search & filter
- [x] Favorites system
- [x] Tags system
- [x] Visit tracking
- [x] Color coding for categories
- [x] Responsive UI

### 🚧 Planned
- [ ] Drag & drop for reordering
- [ ] Import/export bookmarks
- [ ] Browser bookmark sync
- [ ] Bulk operations
- [ ] Category icons
- [ ] Link previews
- [ ] Sharing links
- [ ] Link collections (groups)
- [ ] Dark mode
- [ ] Keyboard shortcuts

## Integration

Module ini sudah terintegrasi dengan:
- ✅ Firebase Authentication (user-specific data)
- ✅ Firestore Database (real-time sync)
- ✅ Main App (tab navigation)
- ✅ Toast notifications (Sonner)

## Performance

- **Real-time updates**: Menggunakan Firestore subscriptions
- **Optimistic UI**: Updates langsung tanpa tunggu server
- **Indexed queries**: userId, categoryId, parentId di-index
- **Lazy loading**: Planned untuk large datasets

## Tips

1. **Nested Categories**: Bisa unlimited depth, tapi recommended max 3-4 levels
2. **Color Coding**: Gunakan warna berbeda untuk kategori utama
3. **Tags**: Gunakan tags untuk cross-category organization
4. **Favorites**: Quick access untuk links yang sering digunakan
5. **Search**: Search akan mencari di title, URL, description, dan tags
