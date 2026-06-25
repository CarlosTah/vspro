'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from './api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Tenant {
  id: string;
  slug: string;
  businessName: string;
  plan: string;
  industry?: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  loading: boolean;
  login: (email: string, password: string, tenantSlug: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  // Verificar sesión existente al cargar
  useEffect(() => {
    if (api.isAuthenticated()) {
      api.get('/auth/me')
        .then((payload) => {
          setUser({
            id: payload.sub,
            email: '', // el /me retorna el payload del JWT
            name: '',
            role: payload.role,
          });
          setTenant({
            id: payload.tenantId,
            slug: payload.tenantSlug,
            businessName: '',
            plan: '',
          });
        })
        .catch(() => {
          api.clearAuth();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string, tenantSlug: string) => {
    const res = await api.post('/auth/login', { email, password, tenantSlug });
    api.setAuth(res.accessToken, tenantSlug);
    setUser(res.user);
    setTenant(res.tenant);
  };

  const logout = () => {
    api.clearAuth();
    setUser(null);
    setTenant(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
