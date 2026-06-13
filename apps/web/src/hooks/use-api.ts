'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

/**
 * Hook genérico para llamadas a la API con estado de carga y error.
 */
export function useApi<T>(path: string, options?: { skip?: boolean }) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!options?.skip);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(path);
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (!options?.skip) {
      fetch();
    }
  }, [fetch, options?.skip]);

  return { data, loading, error, refetch: fetch };
}
