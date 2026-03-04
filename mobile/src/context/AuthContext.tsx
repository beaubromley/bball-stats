import React, { createContext, useContext, useEffect, useState } from "react";
import * as api from "../services/api";

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  role: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  isLoading: true,
  isAuthenticated: false,
  role: null,
  login: async () => false,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await api.loadSessionCookie();
        const result = await api.checkAuth();
        if (result.authenticated) {
          setIsAuthenticated(true);
          setRole(result.role);
        }
      } catch {
        // Not authenticated
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (password: string): Promise<boolean> => {
    try {
      const result = await api.login(password);
      if (result.ok) {
        setIsAuthenticated(true);
        setRole(result.role);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore
    }
    setIsAuthenticated(false);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ isLoading, isAuthenticated, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
