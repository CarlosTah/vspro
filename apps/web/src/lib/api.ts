/**
 * Cliente HTTP para comunicarse con la API de VSPRO.
 * Maneja autenticación con token en localStorage y headers de tenant.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

class ApiClient {
  private token: string | null = null;
  private tenantSlug: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('vspro_token');
      this.tenantSlug = localStorage.getItem('vspro_tenant_slug');
    }
  }

  setAuth(token: string, tenantSlug: string) {
    this.token = token;
    this.tenantSlug = tenantSlug;
    if (typeof window !== 'undefined') {
      localStorage.setItem('vspro_token', token);
      localStorage.setItem('vspro_tenant_slug', tenantSlug);
    }
  }

  clearAuth() {
    this.token = null;
    this.tenantSlug = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vspro_token');
      localStorage.removeItem('vspro_tenant_slug');
    }
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  getTenantSlug(): string | null {
    return this.tenantSlug;
  }

  async request<T = any>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.tenantSlug) {
      headers['x-tenant-slug'] = this.tenantSlug;
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.clearAuth();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Sesión expirada');
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message ?? `Error ${res.status}`);
    }

    return data as T;
  }

  get<T = any>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T = any>(path: string, body?: any) {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T = any>(path: string, body?: any) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T = any>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
