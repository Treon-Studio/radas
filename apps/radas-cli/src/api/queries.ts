// AUTO-GENERATED React Query hooks
import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query'
import { queryClient } from './queryClient'
import { apiClient } from './client'
import type * as DTO from './dto'


// Users endpoints


// Returns a list of users
export function useGetUsersQuery(
  params?, 
  options?: UseQueryOptions<any>
) {
  return useQuery({
    queryKey: ['getUsers', params],
    queryFn: () => apiClient.getUsers(params),
    ...options,
  })
}



// Creates a new user
export function useCreateUserMutation(
  options?: UseMutationOptions<any, Error, {
  body: any;
}>
) {
  return useMutation({
    mutationFn: (params: {
  body: any;
}) => apiClient.createUser(params),
    
    onSuccess: () => {
      
      
      queryClient.invalidateQueries({ queryKey: ['getUsers'] })
      
      
      
      
      
      
      
      
      
      queryClient.invalidateQueries({ queryKey: ['getUserById'] })
      
      
    },
    
    ...options,
  })
}



// Updates a user
export function useUpdateUserMutation(
  options?: UseMutationOptions<any, Error, {
  id: string;
  body: any;
}>
) {
  return useMutation({
    mutationFn: (params: {
  id: string;
  body: any;
}) => apiClient.updateUser(params),
    
    onSuccess: () => {
      
      
      queryClient.invalidateQueries({ queryKey: ['getUsers'] })
      
      
      
      
      
      
      
      
      
      queryClient.invalidateQueries({ queryKey: ['getUserById'] })
      
      
    },
    
    ...options,
  })
}



// Deletes a user
export function useDeleteUserMutation(
  options?: UseMutationOptions<any, Error, {
  id: string;
}>
) {
  return useMutation({
    mutationFn: (params: {
  id: string;
}) => apiClient.deleteUser(params),
    
    onSuccess: () => {
      
      
      queryClient.invalidateQueries({ queryKey: ['getUsers'] })
      
      
      
      
      
      
      
      
      
      queryClient.invalidateQueries({ queryKey: ['getUserById'] })
      
      
    },
    
    ...options,
  })
}



// Returns a user by ID
export function useGetUserByIdQuery(
  params: {
  id: string;
}, 
  options?: UseQueryOptions<any>
) {
  return useQuery({
    queryKey: ['getUserById', params],
    queryFn: () => apiClient.getUserById(params),
    ...options,
  })
}



