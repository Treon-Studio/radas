import React, { createContext, useContext, type ReactNode } from "react";
import { useFirebaseAuth } from "@radas/hooks/use-firebase-auth";
import type { User } from "firebase/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<any>;
  signup: (email: string, password: string, displayName?: string) => Promise<any>;
  loginWithGoogle: () => Promise<any>;
  loginWithGoogleChromeIdentity: () => Promise<any>;
  logout: () => Promise<any>;
  sendPasswordReset: (email: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useFirebaseAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
