// AUTO-GENERATED API client
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, AxiosInstance } from 'axios';
import { z } from 'zod';
import * as DTO from './dto';

// Define Zod schemas for validation
export const UserSchema = z.object({ age: z.number(), createdAt: z.string(), email: z.string(), id: z.string(), name: z.string() }).partial().passthrough()
export const UserInputSchema = z.object({ email: z.string(), name: z.string(), age: z.number() }).partial().passthrough()
export const ErrorSchema = z.object({ code: z.number(), message: z.string() }).partial().passthrough()


// Type exports from schemas
export type User = z.infer<typeof UserSchema>;
export type UserInput = z.infer<typeof UserInputSchema>;
export type Error = z.infer<typeof ErrorSchema>;


// Custom error handling
export class ValidationError extends Error {
  constructor(public issues: z.ZodIssue[], message: string = 'Validation failed') {
    super(message);
    this.name = 'ValidationError';
  }
}

// API configuration
const API_CONFIG = {
  baseURL: 'https://api.example.com',
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

  /**
   * Returns a list of users
   */
  getUsers: async () => {
    try {
      
      const url = '/users';
      

      
      const response = await axiosInstance.get(url);
      
      
      
      return response.data;
      
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

  /**
   * Creates a new user
   */
  createUser: async (params: {
    body: DTO.UserInput;
    
  }) => {
    try {
      
      const url = '/users';
      

      
      const response = await axiosInstance.post(url, params.body);
      
      
      
      return response.data;
      
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

  /**
   * Returns a user by ID
   */
  getUserById: async (params: {
    id: string;
    
  }) => {
    try {
      
      
      let url = '/users/{id}'.replace(/\{([^}]+)\}/g, (_, p) => params[p]);
      
      
      
      

      
      const response = await axiosInstance.get(url);
      
      
      
      return response.data;
      
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

  /**
   * Updates a user
   */
  updateUser: async (params: {
    id: string;
    body: DTO.UserInput;
    
  }) => {
    try {
      
      
      let url = '/users/{id}'.replace(/\{([^}]+)\}/g, (_, p) => params[p]);
      
      
      
      

      
      const response = await axiosInstance.put(url, params.body);
      
      
      
      return response.data;
      
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

  /**
   * Deletes a user
   */
  deleteUser: async (params: {
    id: string;
    
  }) => {
    try {
      
      
      let url = '/users/{id}'.replace(/\{([^}]+)\}/g, (_, p) => params[p]);
      
      
      
      

      
      const response = await axiosInstance.delete(url);
      
      
      
      return response.data;
      
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

};

export default api;