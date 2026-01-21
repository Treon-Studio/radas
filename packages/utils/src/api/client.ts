import axios, { AxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';
  
  // --- Axios Instances ---
  export const apiClientWithHeaders = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });
  
  // Add response interceptor for error handling
  apiClientWithHeaders.interceptors.response.use((response) => response, (error) => {
    if (error.response) {
        const { status, data } = error.response;
        error.message = 'API Error ' + status + ': ' + (data && data.message || error.message);
        error.data = data;
    }
    return Promise.reject(error);
  });
  
  apiClientWithHeaders.interceptors.request.use(async (config) => {
  try {
    // Check for token in cookies first (client-side)
    const token = Cookies.get('token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    }
  } catch (error) {
    console.error('Error setting auth header:', error);
  }
  return config;
  }, error => Promise.reject(error));
  
  export const apiClientWithHeadersWithoutContentType = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    headers: {},
  });
  
  apiClientWithHeadersWithoutContentType.interceptors.response.use((response) => response, (error) => {
    if (error.response) {
        const { status, data } = error.response;
        error.message = 'API Error ' + status + ': ' + (data && data.message || error.message);
        error.data = data;
    }
    return Promise.reject(error);
  });
  
  apiClientWithHeadersWithoutContentType.interceptors.request.use(async (config) => {
  try {
    // Check for token in cookies first (client-side)
    const token = Cookies.get('token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    }
  } catch (error) {
    console.error('Error setting auth header:', error);
  }
  return config;
  }, error => Promise.reject(error));
  
  const defaultHeaders = {
    'accept': 'application/json',
    'Content-Type': 'application/json',
  };
  
  /**
   * Helper to make API requests with or without default headers.
   * @param config AxiosRequestConfig
   * @param useDefaultHeaders boolean (default: true)
   */
  export function apiRequest<T = any>(config: AxiosRequestConfig, useDefaultHeaders = true) {
    return apiClientWithHeaders.request<T>({
      ...config,
      headers: useDefaultHeaders
        ? { ...defaultHeaders, ...(config.headers || {}) }
        : config.headers,
    });
  }
  
  
  // Set auth token for requests
  export const setAuthToken = (token: string | null) => {
      if (token) {
        apiClientWithHeaders.defaults.headers.common['Authorization'] = 'Bearer ' + token;
      } else {
        delete apiClientWithHeaders.defaults.headers.common['Authorization'];
      }
  };

