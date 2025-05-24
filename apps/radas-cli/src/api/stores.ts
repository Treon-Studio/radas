// AUTO-GENERATED Zustand stores
import { create } from 'zustand'
import { apiClient } from './client'


// Users store
export const useUsersStore = create((set) => ({
  data: null,
  loading: false,
  error: null,
  
  // Actions
  
  
  fetchGetUsers: async (params) => {
    set({ loading: true, error: null })
    try {
      const result = await apiClient.getUsers(params)
      set({ data: result, loading: false })
      return result
    } catch (error) {
      set({ error, loading: false })
      throw error
    }
  },
  
  
  
  createCreateUser: async (params) => {
    set({ loading: true, error: null })
    try {
      const result = await apiClient.createUser(params)
      return result
    } catch (error) {
      set({ error, loading: false })
      throw error
    } finally {
      set({ loading: false })
    }
  },
  
  
  
  fetchGetUserById: async (params) => {
    set({ loading: true, error: null })
    try {
      const result = await apiClient.getUserById(params)
      set({ data: result, loading: false })
      return result
    } catch (error) {
      set({ error, loading: false })
      throw error
    }
  },
  
  
  
  updateUpdateUser: async (params) => {
    set({ loading: true, error: null })
    try {
      const result = await apiClient.updateUser(params)
      return result
    } catch (error) {
      set({ error, loading: false })
      throw error
    } finally {
      set({ loading: false })
    }
  },
  
  
  
  deleteDeleteUser: async (params) => {
    set({ loading: true, error: null })
    try {
      const result = await apiClient.deleteUser(params)
      return result
    } catch (error) {
      set({ error, loading: false })
      throw error
    } finally {
      set({ loading: false })
    }
  },
  
  
}))

