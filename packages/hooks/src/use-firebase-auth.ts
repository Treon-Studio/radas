import { useState, useEffect } from "react";
import {
  subscribeToAuthState,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signInWithGoogleChromeIdentity,
  signOutUser,
  resetPassword,
  type User,
} from "@radas/config/lib/firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: Error | null;
}

export const useFirebaseAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = subscribeToAuthState((user) => {
      setAuthState({
        user,
        loading: false,
        error: null,
      });
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    const result = await signInWithEmail(email, password);

    if (!result.success) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        error: result.error as Error,
      }));
    }

    return result;
  };

  const signup = async (email: string, password: string, displayName?: string) => {
    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    const result = await signUpWithEmail(email, password, displayName);

    if (!result.success) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        error: result.error as Error,
      }));
    }

    return result;
  };

  const loginWithGoogle = async () => {
    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    const result = await signInWithGoogle();

    if (!result.success) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        error: result.error as Error,
      }));
    }

    return result;
  };

  const loginWithGoogleChromeIdentity = async () => {
    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    const result = await signInWithGoogleChromeIdentity();

    if (!result.success) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        error: result.error as Error,
      }));
    }

    return result;
  };

  const logout = async () => {
    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    const result = await signOutUser();

    if (!result.success) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        error: result.error as Error,
      }));
    }

    return result;
  };

  const sendPasswordReset = async (email: string) => {
    return await resetPassword(email);
  };

  return {
    user: authState.user,
    loading: authState.loading,
    error: authState.error,
    isAuthenticated: !!authState.user,
    login,
    signup,
    loginWithGoogle,
    loginWithGoogleChromeIdentity,
    logout,
    sendPasswordReset,
  };
};
