/**
 * Utility functions for generating consistent React Query keys
 */
import { 
    PaginationParams, 
    SearchParams, 
    SortingParams, 
    ParamValue 
  } from './url';
  
  /**
   * Type for parameters that could be included in query keys
   */
  export type QueryKeyParam = ParamValue | ParamValue[];
  
  /**
   * Creates a standard query key for React Query
   * @param baseKey The base key name (usually the API function name)
   * @param params Additional parameters to include in the query key
   * @returns An array suitable for use as a React Query key
   */
  export function createQueryKey(
    baseKey: string,
    ...params: QueryKeyParam[]
  ): unknown[] {
    return [
      baseKey,
      ...params.filter(param => param !== undefined && param !== null)
    ];
  }
  
  /**
   * Creates a query key for paginated API endpoints
   * @param baseKey The base key name
   * @param params Pagination parameters (page, per_page)
   * @returns Query key array including pagination parameters
   */
  export function createPaginatedQueryKey(
    baseKey: string,
    params: PaginationParams
  ): unknown[] {
    return createQueryKey(baseKey, params.page, params.per_page);
  }
  
  /**
   * Creates a query key for search API endpoints
   * @param baseKey The base key name
   * @param params Search parameters
   * @returns Query key array including search parameter
   */
  export function createSearchQueryKey(
    baseKey: string,
    params: SearchParams
  ): unknown[] {
    return createQueryKey(baseKey, params.search);
  }
  
  /**
   * Creates a query key for sorted API endpoints
   * @param baseKey The base key name
   * @param params Sorting parameters
   * @returns Query key array including sorting parameters
   */
  export function createSortedQueryKey(
    baseKey: string,
    params: SortingParams
  ): unknown[] {
    return createQueryKey(baseKey, params.sort_by, params.sort_direction);
  }
  
  /**
   * Creates a standard query key for paginated, searchable, and sortable API endpoints
   * @param baseKey The base key name
   * @param params Combined parameters object
   * @returns Complete query key array
   */
  export function createStandardQueryKey<T extends PaginationParams & SearchParams & SortingParams>(
    baseKey: string,
    params: T
  ): unknown[] {
    return createQueryKey(
      baseKey,
      params.page,
      params.per_page,
      params.search,
      params.sort_by,
      params.sort_direction
    );
  }
  