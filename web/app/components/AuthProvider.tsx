"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Role = "admin" | "viewer" | null;

interface AuthContextValue {
  isAdmin: boolean;
  isViewer: boolean;
  role: Role;
  loading: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isAdmin: false,
  isViewer: false,
  role: null,
  loading: true,
  login: async () => false,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/check");
      const data = await res.json();
      setRole(data.role || null);
    } catch {
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (password: string): Promise<boolean> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const data = await res.json();
      setRole(data.role || "admin");
      return true;
    }
    return false;
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setRole(null);
  };

  const isAdmin = role === "admin";
  const isViewer = role === "viewer";

  return (
    <AuthContext.Provider value={{ isAdmin, isViewer, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
