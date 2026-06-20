'use client';

import { useState, useEffect } from 'react';
import { processSyncQueue, getPendingCount } from '@/lib/sync-queue';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    // Initial state
    setIsOffline(!navigator.onLine);

    const handleOffline = () => setIsOffline(true);
    const handleOnline = async () => {
      setIsOffline(false);
      // Auto-sync when back online
      const count = await getPendingCount();
      if (count > 0) {
        setSyncing(true);
        await processSyncQueue();
        setSyncing(false);
        setPendingCount(0);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Check pending count periodically
    const interval = setInterval(async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    }, 5000);

    // Listen for SW sync messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_READY') {
          handleOnline();
        }
      });
    }

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, []);

  if (!isOffline && !syncing && pendingCount === 0) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-[100] px-4 py-2 text-center text-sm font-medium transition-all ${
      isOffline
        ? 'bg-yellow-500 text-yellow-900'
        : syncing
        ? 'bg-blue-500 text-white'
        : 'bg-green-500 text-white'
    }`}>
      {isOffline && (
        <>
          ⚠️ Sin conexión — Modo offline
          {pendingCount > 0 && ` (${pendingCount} cambios pendientes)`}
        </>
      )}
      {syncing && '🔄 Sincronizando cambios...'}
      {!isOffline && !syncing && pendingCount > 0 && `📤 ${pendingCount} cambios por sincronizar`}
    </div>
  );
}
