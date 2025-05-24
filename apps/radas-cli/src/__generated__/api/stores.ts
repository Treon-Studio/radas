// AUTO-GENERATED Zustand stores with API client integration
import { create } from 'zustand';
import api from './client';
import type * as DTO from './dto';

export const useUsersStore = create((set) => ({
  data: null, loading: false, error: null,
  // Actions
  fetchGetUsers: async ({}) => {
    set({ loading: true, error: null });
    try {
      const result = await api.getUsers();
      set({ data: result, loading: false }); return result;
    } catch (error) {
      set({ error, loading: false }); throw error;
    }
  },
  createUser: async (params: { body: DTO.UserInput; }) => {
    set({ loading: true, error: null });
    try {
      const result = await api.createUser(params);
      set({ data: result, loading: false }); return result;
    } catch (error) {
      set({ error, loading: false }); throw error;
    }
  },
  fetchGetUserById: async (params: { id: string; }) => {
    set({ loading: true, error: null });
    try {
      const result = await api.getUserById(params);
      set({ data: result, loading: false }); return result;
    } catch (error) {
      set({ error, loading: false }); throw error;
    }
  },
  updateUser: async (params: { id: string; body: DTO.UserInput; }) => {
    set({ loading: true, error: null });
    try {
      const result = await api.updateUser(params);
      set({ data: result, loading: false }); return result;
    } catch (error) {
      set({ error, loading: false }); throw error;
    }
  },
  deleteUser: async (params: { id: string; }) => {
    set({ loading: true, error: null });
    try {
      const result = await api.deleteUser(params);
      set({ data: result, loading: false }); return result;
    } catch (error) {
      set({ error, loading: false }); throw error;
    }
  },
  reset: () => set({ data: null, loading: false, error: null })
}));