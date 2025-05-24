// AUTO-GENERATED React Query hooks
import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import api, { ValidationError } from './client';
import type * as DTO from './dto';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ValidationError) return false;
        return failureCount < 3;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Users hooks

/**
 * Returns a list of users
 */
export function useGetUsers(
  
  options
) {
  return useQuery({
    queryKey: ['getUsers'],
    queryFn: () => api.getUsers(),
    ...options,
  });
}

/**
 * Creates a new user
 */
export function useCreateUser(options) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createUser,
    onSuccess: (data, variables) => {
      
      queryClient.invalidateQueries({ queryKey: ['getUsers'] });
      
      queryClient.invalidateQueries({ queryKey: ['getUserById'] });
      
      options?.onSuccess?.(data, variables, undefined);
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['createUser'], context?.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['createUser'] });
      
    },
    ...options,
  });
}

/**
 * Creates a new user with optimistic updates
 */
export function useCreateUserOptimistic(options) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createUser,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['createUser'] });
      const previousData = queryClient.getQueryData(['createUser']);
      
      return { previousData };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['createUser'], context?.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['createUser'] });
      
    },
    ...options,
  });
}

/**
 * Returns a user by ID
 */
export function useGetUserById(
  params: { 
    id: string;
    
  },
  options
) {
  return useQuery({
    queryKey: ['getUserById', params],
    queryFn: () => api.getUserById(params),
    ...options,
  });
}

/**
 * Updates a user
 */
export function useUpdateUser(options) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateUser,
    onSuccess: (data, variables) => {
      
      queryClient.invalidateQueries({ queryKey: ['getUsers'] });
      
      queryClient.invalidateQueries({ queryKey: ['getUserById'] });
      
      options?.onSuccess?.(data, variables, undefined);
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['updateUser'], context?.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['updateUser'] });
      
    },
    ...options,
  });
}

/**
 * Updates a user with optimistic updates
 */
export function useUpdateUserOptimistic(options) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateUser,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['updateUser'] });
      const previousData = queryClient.getQueryData(['updateUser']);
      
      return { previousData };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['updateUser'], context?.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['updateUser'] });
      
    },
    ...options,
  });
}

/**
 * Deletes a user
 */
export function useDeleteUser(options) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteUser,
    onSuccess: (data, variables) => {
      
      queryClient.invalidateQueries({ queryKey: ['getUsers'] });
      
      queryClient.invalidateQueries({ queryKey: ['getUserById'] });
      
      options?.onSuccess?.(data, variables, undefined);
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['deleteUser'], context?.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deleteUser'] });
      
    },
    ...options,
  });
}

/**
 * Deletes a user with optimistic updates
 */
export function useDeleteUserOptimistic(options) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteUser,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['deleteUser'] });
      const previousData = queryClient.getQueryData(['deleteUser']);
      
      return { previousData };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['deleteUser'], context?.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deleteUser'] });
      
    },
    ...options,
  });
}

