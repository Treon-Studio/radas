/**
 * Base response types
 */

export type BaseRequestSchema = {
    'x-device-id': string;
    'x-store-id': string;
    'x-organization-id': string;
  };

export type BaseResponseSchema<T> = {
  status: "success" | "error";
  message: string;
  data: T;
  code: number;
};

export type FieldError = {
  field: string;
  message: string;
};

export type ErrorResponseSchema = {
  code: number;
  status: "error";
  name: string;
  message: string;
  data?: {
    errors?: FieldError[];
  };
};

export type SearchSchema = {
  search: string;
};

export interface Pagination {
    totalItems: number;
    totalPages: number;
    currentPage: number;
}

export interface BaseResponseSchemaPagination<T> extends BaseResponseSchema<T> {
    pagination: Pagination;
}
    
    