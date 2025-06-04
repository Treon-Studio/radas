package api

// Templates embedded directly in the code
var templates = map[string]string{
	"client.tmpl": `// AUTO-GENERATED API client
import axios, { AxiosInstance } from 'axios';
import { z } from 'zod';
import * as DTO from './dto';

export type TypeToZod<T> = Required<{
  [K in keyof T]: T[K] extends string | number | boolean | null | undefined
      ? undefined extends T[K]
          ? z.ZodDefault<z.ZodType<Exclude<T[K], undefined>>>
          : z.ZodType<T[K]>
      : T[K] extends Array<infer U>
          ? U extends Record<string, any>
              ? z.ZodArray<z.ZodRecord<z.ZodString, z.ZodAny>>
              : z.ZodArray<z.ZodType<U>>
          : T[K] extends Record<string, any>
              ? z.ZodRecord<z.ZodString, z.ZodAny>
              : z.ZodObject<TypeToZod<T[K]>>;
}>;

export const createZodObject = <T>(_obj: TypeToZod<T>) => {
  return z.object(_obj) as z.ZodObject<TypeToZod<T>>;
};

// Define Zod schemas for validation
{{ range .Schemas }}export const {{ .Name }}Schema = createZodObject<DTO.{{ .Name }}>({ 
{{ range $propName, $propType := .Properties }}  {{ $propName }}: {{ zodType $propType }}, 
{{ end }}}).partial().passthrough();
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
    {{ range .Parameters }}{{ if eq .In "header" }}'{{ .Name }}'{{ else }}{{ .Name }}{{ end }}{{ if not .Required }}?{{ end }}: {{ extractTSType .Schema }};
    {{ end }}{{ if .RequestBody }}{{ if .RequestBody.Required }}body: {{ extractDTOType .RequestBody.Schema }}{{ else }}body?: {{ extractDTOType .RequestBody.Schema }}{{ end }};
    {{ end }}
  }{{ end }}) => {
    try {
      {{ if hasPathParams . }}
      let url = '{{ pathToTemplate .Path }}';
      {{ else }}
      let url = '{{ .Path }}';
      {{ end }}
      
      {{ if hasHeaderParams . }}
      const headers = {
        {{ range .Parameters }}{{ if eq .In "header" }}'{{ .Name }}': params['{{ .Name }}'],
        {{ end }}{{ end }}
      };
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
        url += '?' + queryString;
      }
      {{ end }}

      {{ if eq (toLower .Method) "get" }}
      const response = await axiosInstance.get(url{{ if hasHeaderParams . }}, { headers }{{ end }});
      {{ else if eq (toLower .Method) "post" }}
      const response = await axiosInstance.post(url, {{ if .RequestBody }}params.body{{ else }}{}{{ end }}{{ if hasHeaderParams . }}, { headers }{{ end }});
      {{ else if eq (toLower .Method) "put" }}
      const response = await axiosInstance.put(url, {{ if .RequestBody }}params.body{{ else }}{}{{ end }}{{ if hasHeaderParams . }}, { headers }{{ end }});
      {{ else if eq (toLower .Method) "patch" }}
      const response = await axiosInstance.patch(url, {{ if .RequestBody }}params.body{{ else }}{}{{ end }}{{ if hasHeaderParams . }}, { headers }{{ end }});
      {{ else if eq (toLower .Method) "delete" }}
      const response = await axiosInstance.delete(url{{ if hasHeaderParams . }}, { headers }{{ end }});
      {{ else }}
      const response = await axiosInstance.request({
        method: '{{ toLower .Method }}',
        url,
        {{ if .RequestBody }}data: params.body,{{ end }}
        {{ if hasHeaderParams . }}headers,{{ end }}
      });
      {{ end }}
      
      return response.data;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error instanceof z.ZodError) throw new ValidationError(error.issues);
      if (axios.isAxiosError(error)) {
        if (error.response && error.response.status === 401) console.error('Authentication required');
        if (error.response && error.response.status === 403) console.error('Access denied');
        throw new Error('HTTP ' + (error.response && error.response.status || 'unknown') + ': ' + error.message);
      }
      throw error;
    }
  },
{{ end }}
};

export default api;`,

	"dto.tmpl": `// AUTO-GENERATED TypeScript DTOs
{{ range .Schemas }}export type {{ .Name }} = {
{{ range $propName, $propType := .Properties }}  {{ $propName }}: {{ tsType $propType }};
{{ end }}}
{{ end }}`,

	"queries.tmpl": `// AUTO-GENERATED React Query hooks
import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import api from './client';
import { queryClient } from './queryClient';

// Type helpers
type ExtractFnReturnType<FnType extends (...args: any) => any> = 
  ReturnType<FnType> extends Promise<infer T> ? T : ReturnType<FnType>;

type MutationParams<FnType extends (...args: any) => any> = 
  Parameters<FnType>[0];

{{- /* Create a map of all operation IDs (lowercase) to track duplicates */ -}}
{{- $allOps := dict -}}
{{- $hookNames := dict -}}
{{- range $namespace, $operations := .GroupedOps -}}
  {{- range $operations -}}
    {{- $opIdLower := toLower .ID -}}
    {{- $hookName := printf "use%s" (capitalize .ID) -}}
    {{- $hookNameLower := toLower $hookName -}}
    {{- if not (index $hookNames $hookNameLower) -}}
      {{- $_ := set $hookNames $hookNameLower $hookName -}}
    {{- end -}}
  {{- end -}}
{{- end -}}

{{- /* Track which operations already have hooks generated */ -}}
{{- $generatedOps := dict -}}
{{- $optimisticOps := dict -}}

{{- range $namespace, $operations := .GroupedOps }}
/**
 * {{ capitalize $namespace }} Hooks
 */
{{- range $operations }}
{{- $hookName := printf "use%s" (capitalize .ID) -}}
{{- $hookNameLower := toLower $hookName -}}
{{- if not (index $generatedOps $hookNameLower) -}}
{{- $_ := set $generatedOps $hookNameLower true -}}

{{- if eq (toUpper .Method) "GET" }}
// {{ .Description }}
export function {{ $hookName }}(
  {{- if hasParams . }}
  params: MutationParams<typeof api.{{ .ID }}>,
  {{- end }}
  options: Omit<UseQueryOptions<
    ExtractFnReturnType<typeof api.{{ .ID }}>,
    unknown,
    ExtractFnReturnType<typeof api.{{ .ID }}>,
    ['{{ .ID }}'{{ if hasParams . }}, MutationParams<typeof api.{{ .ID }}>{{ end }}]
  >, 'queryKey' | 'queryFn'> = {}
) {
  return useQuery({
    queryKey: ['{{ .ID }}'{{ if hasParams . }}, params{{ end }}],
    queryFn: () => api.{{ .ID }}({{ if hasParams . }}params{{ end }}),
    ...options,
  });
}
{{- else }}
// {{ .Description }}
export function {{ $hookName }}(
  options: UseMutationOptions<
    ExtractFnReturnType<typeof api.{{ .ID }}>,
    unknown,
    MutationParams<typeof api.{{ .ID }}>,
    unknown
  > = {}
) {
  return useMutation({
    mutationFn: api.{{ .ID }},
    {{- if shouldInvalidateQueries . }}
    onSuccess: (data, variables, context) => {
      // Invalidate related queries when a new one is created
      queryClient.invalidateQueries({ queryKey: [{{ range $index, $relatedOp := $operations }}{{ if and (eq (toUpper $relatedOp.Method) "GET") (eq $relatedOp.Entity .Entity) }}{{ if $index }}, {{ end }}'{{ $relatedOp.ID }}'{{ end }}{{ end }}] });
      options?.onSuccess?.(data, variables, context);
    },
    {{- end }}
    ...options,
  });
}

{{- /* Check if we should generate an optimistic version */ -}}
{{- $optimisticHookName := printf "%sOptimistic" $hookName -}}
{{- $optimisticHookNameLower := toLower $optimisticHookName -}}
{{- if and (not (index $optimisticOps $optimisticHookNameLower)) (hasRelatedGetOperation . $operations) (or (eq (toLower .Method) "post") (eq (toLower .Method) "put") (eq (toLower .Method) "patch") (eq (toLower .Method) "delete")) }}
{{- $_ := set $optimisticOps $optimisticHookNameLower true -}}
// {{ .Description }} with optimistic updates
export function {{ $optimisticHookName }}(
  options: UseMutationOptions<
    ExtractFnReturnType<typeof api.{{ .ID }}>,
    unknown,
    MutationParams<typeof api.{{ .ID }}>,
    { previousData: unknown }
  > = {}
) {
  return useMutation({
    mutationFn: api.{{ .ID }},
    onMutate: async (_variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['{{ getRelatedListOperation . $operations }}'] });
      
      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['{{ getRelatedListOperation . $operations }}']);
      
      {{- if eq (toLower .Method) "delete" }}
      // Optimistically update by removing the item
      const idParam = _variables{{ range .Parameters }}{{ if eq .Name "id" }}.id{{ end }}{{ end }};
      if (idParam) {
        queryClient.setQueryData(['{{ getRelatedListOperation . $operations }}'], (old: any) => {
          return old ? old.filter((item: any) => item.id !== idParam) : [];
        });
      }
      {{- else if eq (toLower .Method) "post" }}{{ if .RequestBody }}
      // Optimistically add the new item
      queryClient.setQueryData(['{{ getRelatedListOperation . $operations }}'], (old: any) => {
        const newItem = { ..._variables.body, id: 'temp-id-' + Date.now() };
        return old ? [...old, newItem] : [newItem];
      });
      {{- end }}{{- else if or (eq (toLower .Method) "put") (eq (toLower .Method) "patch") }}
      // Optimistically update the item
      const idParam = _variables{{ range .Parameters }}{{ if eq .Name "id" }}.id{{ end }}{{ end }};
      if (idParam) {
        queryClient.setQueryData(['{{ getRelatedListOperation . $operations }}'], (old: any) => {
          return old ? old.map((item: any) => 
            item.id === idParam ? { ...item, ..._variables.body } : item
          ) : [];
        });
      }
      {{- end }}
      
      // Return a context object with the snapshotted value
      return { previousData };
    },
    onError: (_error, _variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousData) {
        queryClient.setQueryData(['{{ getRelatedListOperation . $operations }}'], context.previousData);
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['{{ getRelatedListOperation . $operations }}'] });
      {{- if or (eq (toLower .Method) "put") (eq (toLower .Method) "patch") }}
      const idParam = variables{{ range .Parameters }}{{ if eq .Name "id" }}.id{{ end }}{{ end }};
      if (idParam) {
        queryClient.invalidateQueries({ 
          queryKey: ['{{ getRelatedGetOperation . $operations }}', idParam] 
        });
      }
      {{- end }}
    },
    ...options,
  });
}
{{- end }}
{{- end }}
{{- end }}
{{- end }}
{{- end }}`,

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
    },
    mutations: {
      retry: false,
    },
  },
});
`,

	"stores.tmpl": `{{- define "stores.tmpl" -}}
// AUTO-GENERATED Zustand stores with API client integration
import { create } from 'zustand';
import api from './client';
import type * as DTO from './dto';{{- range $tagName, $operations := .GroupedOps }}

export const use{{ replace (replace $tagName " - " "") " " "" }}Store = create((set) => ({
  data: null, loading: false, error: null,
  // Actions
  {{- range $operations -}}
  {{- if eq (toUpper .Method) "GET" }}
  fetch{{ .ID }}: async ({{ if or (hasParams .) .RequestBody }}params: { {{ range .Parameters }}{{ if contains .Name "-" }}"{{ .Name }}"{{ else }}{{ .Name }}{{ end }}{{ if not .Required }}?{{ end }}: {{ extractTSType .Schema }}; {{ end }}{{ if .RequestBody }}{{ if .RequestBody.Required }}body: DTO.{{ extractDTOType .RequestBody.Schema }}; {{ else }}body?: DTO.{{ extractDTOType .RequestBody.Schema }}; {{ end }}{{ end }}}{{ else }}{}{{ end }}) => {
    set({ loading: true, error: null });
    try {
      const result = await api.{{ .ID }}({{ if or (hasParams .) .RequestBody }}params{{ end }});
      set({ data: result, loading: false }); return result;
    } catch (error) {
      set({ error, loading: false }); throw error;
    }
  },
  {{- else }}
  {{ camelCase .ID }}: async ({{ if or (hasParams .) .RequestBody }}params: { {{ range .Parameters }}{{ if contains .Name "-" }}"{{ .Name }}"{{ else }}{{ .Name }}{{ end }}{{ if not .Required }}?{{ end }}: {{ extractTSType .Schema }}; {{ end }}{{ if .RequestBody }}{{ if .RequestBody.Required }}body: DTO.{{ extractDTOType .RequestBody.Schema }}; {{ else }}body?: DTO.{{ extractDTOType .RequestBody.Schema }}; {{ end }}{{ end }}}{{ else }}{}{{ end }}) => {
    set({ loading: true, error: null });
    try {
      const result = await api.{{ .ID }}({{ if or (hasParams .) .RequestBody }}params{{ end }});
      set({ data: result, loading: false }); return result;
    } catch (error) {
      set({ error, loading: false }); throw error;
    }
  },
  {{- end }}
  {{- end }}
  reset: () => set({ data: null, loading: false, error: null })
}));{{- end }}
{{- end -}}`,
}
