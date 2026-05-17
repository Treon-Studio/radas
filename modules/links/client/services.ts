import {
  createDocument,
  updateDocument,
  deleteDocument,
  queryDocuments,
  subscribeToCollection,
  serverTimestamp,
  type Unsubscribe,
} from "@radas/config/lib/firebase";
import type {
  Link,
  Category,
  CreateLinkDto,
  UpdateLinkDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  LinkFilters,
  LinkSortBy,
  SortDirection,
  CategoryWithChildren,
} from "./entity";

const LINKS_COLLECTION = "links";
const CATEGORIES_COLLECTION = "link_categories";

// ============ Link Services ============

export const createLink = async (userId: string, data: CreateLinkDto) => {
  return await createDocument<Omit<Link, "id">>(LINKS_COLLECTION, {
    ...data,
    userId,
    visitCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateLink = async (linkId: string, data: UpdateLinkDto) => {
  return await updateDocument(LINKS_COLLECTION, linkId, {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const deleteLink = async (linkId: string) => {
  return await deleteDocument(LINKS_COLLECTION, linkId);
};

export const incrementLinkVisitCount = async (linkId: string) => {
  return await updateDocument(LINKS_COLLECTION, linkId, {
    visitCount: (await queryDocuments(LINKS_COLLECTION, {})).data.find(
      (l: any) => l.id === linkId
    )?.visitCount || 0 + 1,
    lastVisited: serverTimestamp(),
  });
};

export const getUserLinks = async (
  userId: string,
  filters?: LinkFilters,
  sortBy: LinkSortBy = "createdAt",
  sortDirection: SortDirection = "desc"
) => {
  const queryOptions: any = {
    field: "userId",
    operator: "==",
    value: userId,
    orderByField: sortBy,
    orderByDirection: sortDirection,
  };

  const result = await queryDocuments<Link>(LINKS_COLLECTION, queryOptions);

  if (!result.success) return result;

  let filteredLinks = result.data;

  // Apply additional filters
  if (filters) {
    if (filters.categoryId) {
      filteredLinks = filteredLinks.filter(
        (link) => link.categoryId === filters.categoryId
      );
    }

    if (filters.isFavorite !== undefined) {
      filteredLinks = filteredLinks.filter(
        (link) => link.isFavorite === filters.isFavorite
      );
    }

    if (filters.tags && filters.tags.length > 0) {
      filteredLinks = filteredLinks.filter((link) =>
        filters.tags?.some((tag) => link.tags?.includes(tag))
      );
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filteredLinks = filteredLinks.filter(
        (link) =>
          link.title.toLowerCase().includes(query) ||
          link.url.toLowerCase().includes(query) ||
          link.description?.toLowerCase().includes(query)
      );
    }
  }

  return {
    ...result,
    data: filteredLinks,
  };
};

export const subscribeToUserLinks = (
  userId: string,
  callback: (links: Link[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Link>(
    LINKS_COLLECTION,
    callback,
    {
      field: "userId",
      operator: "==",
      value: userId,
      orderByField: "createdAt",
      orderByDirection: "desc",
    }
  );
};

// ============ Category Services ============

export const createCategory = async (userId: string, data: CreateCategoryDto) => {
  return await createDocument<Omit<Category, "id">>(CATEGORIES_COLLECTION, {
    ...data,
    userId,
    parentId: data.parentId || null,
    order: data.order || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

export const updateCategory = async (categoryId: string, data: UpdateCategoryDto) => {
  return await updateDocument(CATEGORIES_COLLECTION, categoryId, {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

export const deleteCategory = async (categoryId: string, action: "delete" | "uncategorize" = "uncategorize") => {
  const linksQuery = queryDocuments<Link>(LINKS_COLLECTION, {
    field: "categoryId",
    operator: "==",
    value: categoryId,
  });

  if (action === "delete") {
    for (const link of linksQuery) {
      await deleteDocument(LINKS_COLLECTION, link.id);
    }
  } else {
    for (const link of linksQuery) {
      await updateDocument(LINKS_COLLECTION, link.id, { categoryId: null, updatedAt: serverTimestamp() });
    }
  }

  return await deleteDocument(CATEGORIES_COLLECTION, categoryId);
};

export const getUserCategories = async (userId: string) => {
  return await queryDocuments<Category>(CATEGORIES_COLLECTION, {
    field: "userId",
    operator: "==",
    value: userId,
    orderByField: "order",
    orderByDirection: "asc",
  });
};

export const subscribeToUserCategories = (
  userId: string,
  callback: (categories: Category[], error?: Error) => void
): Unsubscribe => {
  return subscribeToCollection<Category>(
    CATEGORIES_COLLECTION,
    callback,
    {
      field: "userId",
      operator: "==",
      value: userId,
      orderByField: "order",
      orderByDirection: "asc",
    }
  );
};

// ============ Helper Functions ============

export const buildCategoryTree = (
  categories: Category[],
  links?: Link[]
): CategoryWithChildren[] => {
  const categoryMap = new Map<string, CategoryWithChildren>();
  const rootCategories: CategoryWithChildren[] = [];

  // First pass: Create all category objects with children array
  categories.forEach((category) => {
    categoryMap.set(category.id, {
      ...category,
      children: [],
      linkCount: links?.filter((link) => link.categoryId === category.id).length || 0,
    });
  });

  // Second pass: Build the tree structure
  categories.forEach((category) => {
    const categoryWithChildren = categoryMap.get(category.id);
    if (!categoryWithChildren) return;

    if (!category.parentId) {
      // Root category
      rootCategories.push(categoryWithChildren);
    } else {
      // Child category
      const parent = categoryMap.get(category.parentId);
      if (parent) {
        parent.children.push(categoryWithChildren);
      } else {
        // Parent not found, treat as root
        rootCategories.push(categoryWithChildren);
      }
    }
  });

  return rootCategories;
};

export const getCategoryPath = (
  categoryId: string,
  categories: Category[]
): Category[] => {
  const path: Category[] = [];
  let currentId: string | undefined = categoryId;

  while (currentId) {
    const category = categories.find((c) => c.id === currentId);
    if (!category) break;

    path.unshift(category);
    currentId = category.parentId || undefined;
  }

  return path;
};

export const getAllSubcategoryIds = (
  categoryId: string,
  categories: Category[]
): string[] => {
  const subcategoryIds: string[] = [categoryId];
  const children = categories.filter((c) => c.parentId === categoryId);

  children.forEach((child) => {
    subcategoryIds.push(...getAllSubcategoryIds(child.id, categories));
  });

  return subcategoryIds;
};
