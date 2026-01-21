import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@radas/config/contexts/auth-context";
import {
  createLink,
  updateLink,
  deleteLink,
  getUserLinks,
  subscribeToUserLinks,
  createCategory,
  updateCategory,
  deleteCategory,
  subscribeToUserCategories,
  buildCategoryTree,
  getCategoryPath,
  getAllSubcategoryIds,
} from "./services";
import type {
  Link,
  Category,
  CategoryWithChildren,
  CreateLinkDto,
  UpdateLinkDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  LinkFilters,
  LinkSortBy,
  SortDirection,
} from "./entity";

// ============ Links Hooks ============

export const useLinks = (
  filters?: LinkFilters,
  sortBy: LinkSortBy = "createdAt",
  sortDirection: SortDirection = "desc",
  realtime = true
) => {
  const { user } = useAuth();
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setLinks([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      // Real-time subscription
      const unsubscribe = subscribeToUserLinks(user.uid, (data, err) => {
        if (err) {
          setError(err);
          setLinks([]);
        } else {
          setLinks(data);
          setError(null);
        }
        setLoading(false);
      });

      return () => unsubscribe();
    } else {
      // One-time fetch
      const fetchLinks = async () => {
        setLoading(true);
        const result = await getUserLinks(user.uid, filters, sortBy, sortDirection);

        if (result.success) {
          setLinks(result.data);
          setError(null);
        } else {
          setError(result.error as Error);
          setLinks([]);
        }
        setLoading(false);
      };

      fetchLinks();
    }
  }, [user, JSON.stringify(filters), sortBy, sortDirection, realtime]);

  return { links, loading, error };
};

export const useLinkMutations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(
    async (data: CreateLinkDto) => {
      if (!user) throw new Error("User not authenticated");

      setLoading(true);
      setError(null);

      const result = await createLink(user.uid, data);
      setLoading(false);

      if (!result.success) {
        setError(result.error as Error);
      }

      return result;
    },
    [user]
  );

  const update = useCallback(async (linkId: string, data: UpdateLinkDto) => {
    setLoading(true);
    setError(null);

    const result = await updateLink(linkId, data);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  const remove = useCallback(async (linkId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteLink(linkId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return {
    create,
    update,
    remove,
    loading,
    error,
  };
};

// ============ Categories Hooks ============

export const useCategories = (realtime = true) => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setCategories([]);
      setLoading(false);
      return;
    }

    if (realtime) {
      // Real-time subscription
      const unsubscribe = subscribeToUserCategories(user.uid, (data, err) => {
        if (err) {
          console.error("[useCategories] Error:", err);
          setError(err);
          setCategories([]);
        } else {
          setCategories(data);
          setError(null);
        }
        setLoading(false);
      });

      return () => unsubscribe();
    }
  }, [user, realtime]);

  return { categories, loading, error };
};

export const useCategoryTree = (links?: Link[]) => {
  const { categories, loading, error } = useCategories(true);
  const [categoryTree, setCategoryTree] = useState<CategoryWithChildren[]>([]);

  useEffect(() => {
    if (categories.length > 0) {
      const tree = buildCategoryTree(categories, links);
      setCategoryTree(tree);
    } else {
      setCategoryTree([]);
    }
  }, [categories, links]);

  return { categoryTree, categories, loading, error };
};

export const useCategoryMutations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(
    async (data: CreateCategoryDto) => {
      if (!user) throw new Error("User not authenticated");

      setLoading(true);
      setError(null);

      const result = await createCategory(user.uid, data);
      setLoading(false);

      if (!result.success) {
        setError(result.error as Error);
      }

      return result;
    },
    [user]
  );

  const update = useCallback(
    async (categoryId: string, data: UpdateCategoryDto) => {
      setLoading(true);
      setError(null);

      const result = await updateCategory(categoryId, data);
      setLoading(false);

      if (!result.success) {
        setError(result.error as Error);
      }

      return result;
    },
    []
  );

  const remove = useCallback(async (categoryId: string) => {
    setLoading(true);
    setError(null);

    const result = await deleteCategory(categoryId);
    setLoading(false);

    if (!result.success) {
      setError(result.error as Error);
    }

    return result;
  }, []);

  return {
    create,
    update,
    remove,
    loading,
    error,
  };
};

// ============ Helper Hooks ============

export const useCategoryPath = (categoryId: string | undefined) => {
  const { categories } = useCategories(true);
  const [path, setPath] = useState<Category[]>([]);

  useEffect(() => {
    if (categoryId && categories.length > 0) {
      const categoryPath = getCategoryPath(categoryId, categories);
      setPath(categoryPath);
    } else {
      setPath([]);
    }
  }, [categoryId, categories]);

  return path;
};

export const useSubcategoryIds = (categoryId: string | undefined) => {
  const { categories } = useCategories(true);
  const [subcategoryIds, setSubcategoryIds] = useState<string[]>([]);

  useEffect(() => {
    if (categoryId && categories.length > 0) {
      const ids = getAllSubcategoryIds(categoryId, categories);
      setSubcategoryIds(ids);
    } else {
      setSubcategoryIds([]);
    }
  }, [categoryId, categories]);

  return subcategoryIds;
};
