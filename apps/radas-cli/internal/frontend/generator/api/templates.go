package api

// Templates embedded directly in the code
var templates = map[string]string{
	"client.tmpl": `// AUTO-GENERATED API client
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, AxiosInstance } from 'axios';
import { z } from 'zod';
import * as DTO from './dto';

// Define Zod schemas for validation
{{ range .Schemas }}export const {{ .Name }}Schema = {{ schemaToZod . }}
{{ end }}

// Type exports from schemas
{{ range .Schemas }}export type {{ .Name }} = z.infer<typeof {{ .Name }}Schema>;
{{ end }}

// Custom error handling
export class ValidationError extends Error {
  constructor(public issues: z.ZodIssue[], message: string = 'Validation failed') {
    super(message);
    this.name = 'ValidationError';
  }
}

// API configuration
const API_CONFIG = {
  baseURL: '{{ or .BaseURL "http://localhost:3000" }}',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
};

// Create axios instance with defaults
const axiosInstance: AxiosInstance = axios.create(API_CONFIG);

// Add response interceptor for error handling
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Enhance error with more information if available
    if (error.response) {
      const { status, data } = error.response;
      error.message = 'API Error ' + status + ': ' + (data && data.message || error.message);
      error.data = data;
    }
    return Promise.reject(error);
  }
);

// Set auth token for requests
export const setAuthToken = (token: string | null) => {
  if (token) {
    axiosInstance.defaults.headers.common['Authorization'] = 'Bearer ' + token;
  } else {
    delete axiosInstance.defaults.headers.common['Authorization'];
  }
};

// Helper to validate response with Zod schema
const validateResponse = <T>(data: unknown, schema: z.ZodType<T>): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues);
    }
    throw error;
  }
};

// API client with validation
const api = {
{{ range .Operations }}
  /**
   * {{ .Description }}
   */
  {{ .ID }}: async ({{ if or (gt (len .Parameters) 0) .RequestBody }}params: {
    {{ range .Parameters }}{{ .Name }}{{ if not .Required }}?{{ end }}: {{ extractTSType .Schema }};
    {{ end }}{{ if .RequestBody }}{{ if .RequestBody.Required }}body: DTO.{{ extractDTOType .RequestBody.Schema }}{{ else }}body?: DTO.{{ extractDTOType .RequestBody.Schema }}{{ end }};
    {{ end }}
  }{{ end }}) => {
    try {
      {{ if or (hasPathParams .) (hasQueryParams .) }}
      {{ if hasPathParams . }}
      let url = '{{ .Path }}'.replace(/\{([^}]+)\}/g, (_, p) => params[p]);
      {{ else }}
      let url = '{{ .Path }}';
      {{ end }}
      
      {{ if hasQueryParams . }}
      const queryParams = new URLSearchParams();
      {{ range .Parameters }}{{ if eq .In "query" }}
      if (params.{{ .Name }} !== undefined) {
        queryParams.append('{{ .Name }}', String(params.{{ .Name }}));
      }
      {{ end }}{{ end }}
      const queryString = queryParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
      {{ end }}
      {{ else }}
      const url = '{{ .Path }}';
      {{ end }}

      {{ if eq (toLower .Method) "get" }}
      const response = await axiosInstance.get(url);
      {{ else if eq (toLower .Method) "post" }}
      const response = await axiosInstance.post(url, {{ if .RequestBody }}params.body{{ else }}{}{{ end }});
      {{ else if eq (toLower .Method) "put" }}
      const response = await axiosInstance.put(url, {{ if .RequestBody }}params.body{{ else }}{}{{ end }});
      {{ else if eq (toLower .Method) "patch" }}
      const response = await axiosInstance.patch(url, {{ if .RequestBody }}params.body{{ else }}{}{{ end }});
      {{ else if eq (toLower .Method) "delete" }}
      const response = await axiosInstance.delete(url);
      {{ else }}
      const response = await axiosInstance.request({
        method: '{{ toLower .Method }}',
        url,
        {{ if .RequestBody }}data: params.body,{{ end }}
      });
      {{ end }}
      
      {{ if getSuccessResponseSchema .Responses }}
      return validateResponse(response.data, {{ getSuccessResponseSchema .Responses }});
      {{ else }}
      return response.data;
      {{ end }}
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error instanceof z.ZodError) throw new ValidationError(error.issues);
      if (axios.isAxiosError(error)) {
        if (error.response && error.response.status === 401) console.error('Authentication required');
        if (error.response && error.response.status === 403) console.error('Access denied');
        throw new Error('HTTP ' + (error.response ? error.response.status : 'unknown') + ': ' + error.message);
      }
      throw error;
    }
  },
{{ end }}
};

export default api;`,

	"dto.tmpl": `// AUTO-GENERATED TypeScript DTOs
{{ range .Schemas }}export interface {{ .Name }} {
{{ range $propName, $propType := .Properties }}  {{ $propName }}: {{ tsType $propType }};
{{ end }}}
{{ end }}`,

	"queries.tmpl": `// AUTO-GENERATED React Query hooks
import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import api from './client';

import { queryClient } from './queryClient';

{{ range $namespace, $operations := .GroupedOps }}// {{ capitalize $namespace }} hooks
{{ range $operations }}{{ if eq (toUpper .Method) "GET" }}
/**
 * {{ .Description }}
 */
export function use{{ capitalize .ID }}(
  {{ if hasParams . }}params: { 
    {{ range .Parameters }}{{ .Name }}{{ if not .Required }}?{{ end }}: {{ extractTSType .Schema }};
    {{ end }}{{ if .RequestBody }}body{{ if not .RequestBody.Required }}?{{ end }}: DTO.{{ extractDTOType .RequestBody.Schema }};
    {{ end }}
  },{{ end }}
  options: UseQueryOptions<ReturnType<typeof api.{{ .ID }}>> = {}
) {
  return useQuery({
    queryKey: ['{{ .ID }}'{{ if hasParams . }}, params{{ end }}],
    queryFn: () => api.{{ .ID }}({{ if hasParams . }}params{{ end }}),
    ...options,
  });
}
{{ else }}
/**
 * {{ .Description }}
 */
export function use{{ capitalize .ID }}(options: UseMutationOptions<
  ReturnType<typeof api.{{ .ID }}>,
  unknown,
  Parameters<typeof api.{{ .ID }}>[0]
> = {}) {
  return useMutation({
    mutationFn: api.{{ .ID }},
    onSuccess: (data, variables) => {
      {{ if shouldInvalidateQueries . }}
      queryClient.invalidateQueries([
        {{ range $index, $relatedOp := $operations }}{{ if and (eq (toUpper $relatedOp.Method) "GET") (eq $relatedOp.Entity .Entity) }}{{ if $index }}, {{ end }}'{{ $relatedOp.ID }}'{{ end }}{{ end }}
      ]);
      {{ end }}
      options?.onSuccess?.(data, variables, undefined);
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(['{{ .ID }}'], context?.previousData);
    },
    onSettled: () => {
      // Combine invalidation queries
      queryClient.invalidateQueries(['{{ .ID }}'{{ if hasRelatedGetOperation . $operations }}, '{{ getRelatedListOperation . $operations }}'{{ end }}]);
    },
    ...options,
  });
}

/**
 * {{ .Description }} with optimistic updates
 */
export function use{{ capitalize .ID }}Optimistic(options: UseMutationOptions<
  ReturnType<typeof api.{{ .ID }}>,
  unknown,
  Parameters<typeof api.{{ .ID }}>[0]
> = {}) {
  return useMutation({
    mutationFn: api.{{ .ID }},
    onMutate: async (_variables) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries(['{{ .ID }}']);
      
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['{{ .ID }}']);
      
      {{ if hasRelatedGetOperation . $operations }}const variables = _variables;
      {{ if and (hasRelatedGetOperation . $operations) (eq (toLower .Method) "delete") }}
      // Cancel any outgoing refetches for the related list query
      await queryClient.cancelQueries(['{{ getRelatedListOperation . $operations }}']);
      
      const idParam = variables{{ range .Parameters }}{{ if eq .Name "id" }}.id{{ end }}{{ end }};
      if (idParam) {
        // Snapshot the previous list data
        const previousListData = queryClient.getQueryData(['{{ getRelatedListOperation . $operations }}']);
        
        // Optimistically update the list by removing the deleted item
        queryClient.setQueryData(['{{ getRelatedListOperation . $operations }}'], (old: any) => {
          const arr = old || [];
          return arr.filter((item: any) => item.id !== idParam);
        });
        
        // Return both snapshots for rollback
        return { previousData, previousListData };
      }
      {{ else if and (hasRelatedGetOperation . $operations) (eq (toLower .Method) "post") }}{{ if .RequestBody }}
      // Cancel any outgoing refetches for the related list query
      await queryClient.cancelQueries(['{{ getRelatedListOperation . $operations }}']);
      
      // Snapshot the previous list data
      const previousListData = queryClient.getQueryData(['{{ getRelatedListOperation . $operations }}']);
      
      // Optimistically update the list by adding the new item
      queryClient.setQueryData(['{{ getRelatedListOperation . $operations }}'], (old: any) => {
        const arr = old || [];
        return [...arr, { ...variables.body, id: 'temp-id-' + Date.now() }];
      });
      
      // Return both snapshots for rollback
      return { previousData, previousListData };
      {{ end }}{{ else if and (hasRelatedGetOperation . $operations) (or (eq (toLower .Method) "put") (eq (toLower .Method) "patch")) }}
      const idParam = variables{{ range .Parameters }}{{ if eq .Name "id" }}.id{{ end }}{{ end }};
      if (idParam) {
        // Cancel any outgoing refetches for related queries
        await queryClient.cancelQueries(['{{ getRelatedListOperation . $operations }}']);
        await queryClient.cancelQueries(['{{ getRelatedGetOperation . $operations }}', idParam]);
        
        // Snapshot the previous data
        const previousListData = queryClient.getQueryData(['{{ getRelatedListOperation . $operations }}']);
        const previousItemData = queryClient.getQueryData(['{{ getRelatedGetOperation . $operations }}', idParam]);
        
        // Optimistically update the list
        queryClient.setQueryData(['{{ getRelatedListOperation . $operations }}'], (old: any) => {
          const arr = old || [];
          return arr.map((item: any) => 
            item.id === idParam ? { ...item, ...variables.body } : item
          );
        });
        
        // Optimistically update the individual item
        queryClient.setQueryData(['{{ getRelatedGetOperation . $operations }}', idParam], (old: any) => 
          old ? { ...old, ...variables.body } : old
        );
        
        // Return all snapshots for rollback
        return { previousData, previousListData, previousItemData };
      }
      {{ end }}{{ end }}
      
      return { previousData };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(['{{ .ID }}'], context?.previousData);
    },
    onSettled: () => {
      // Combine invalidation queries
      queryClient.invalidateQueries(['{{ .ID }}'{{ if hasRelatedGetOperation . $operations }}, '{{ getRelatedListOperation . $operations }}'{{ end }}]);
    },
    ...options,
  });
}
{{ end }}{{ end }}
{{ end }}`,

	"queryClient.tmpl": `// AUTO-GENERATED React Query Client
import { QueryClient } from '@tanstack/react-query';
import { ValidationError } from './client';

// Create a QueryClient for React Query
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry on validation errors
        if (error instanceof ValidationError) {
          return false;
        }
        return failureCount < 3;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
    mutations: {
      retry: false,
    },
  },
});
`,

	"stores.tmpl": `// AUTO-GENERATED Zustand stores with API client integration
import { create } from 'zustand';
import api from './client';
import type * as DTO from './dto';

{{ range $namespace, $operations := .GroupedOps }}export const use{{ capitalize $namespace }}Store = create((set) => ({
  data: null, loading: false, error: null,
  // Actions{{ range $operations }}{{ if eq (toUpper .Method) "GET" }}
  fetch{{ capitalize .ID }}: async ({{ if hasParams . }}params: { {{ range .Parameters }}{{ .Name }}{{ if not .Required }}?{{ end }}: {{ extractTSType .Schema }}; {{ end }}}{{ else }}{}{{ end }}) => {
    set({ loading: true, error: null });
    try {
      const result = await api.{{ .ID }}({{ if hasParams . }}params{{ end }});
      set({ data: result, loading: false }); return result;
    } catch (error) {
      set({ error, loading: false }); throw error;
    }
  },{{ else }}
  {{ actionName .Method .ID }}: async ({{ if hasParams . }}params: { {{ range .Parameters }}{{ .Name }}{{ if not .Required }}?{{ end }}: {{ extractTSType .Schema }}; {{ end }}{{ if .RequestBody }}{{ if .RequestBody.Required }}body: DTO.{{ extractDTOType .RequestBody.Schema }}; {{ else }}body?: DTO.{{ extractDTOType .RequestBody.Schema }}; {{ end }}{{ end }}}{{ else }}{}{{ end }}) => {
    set({ loading: true, error: null });
    try {
      const result = await api.{{ .ID }}({{ if hasParams . }}params{{ end }});
      set({ data: result, loading: false }); return result;
    } catch (error) {
      set({ error, loading: false }); throw error;
    }
  },{{ end }}{{ end }}
  reset: () => set({ data: null, loading: false, error: null })
}));{{ end }}`,
}
