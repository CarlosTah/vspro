'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Banner that appears when a new service worker version is detected.
 * Users can click "Actualizar" to activate the new version immediately.
 */
export function SwUpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSwUpdate = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATE_AVAILABLE') {
        setShowUpdate(true);
      }
    };

    // Listen for update messages from the registration logic
    window.addEventListener('message', handleSwUpdate);

    // Also check if there's already a waiting worker on mount
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setShowUpdate(true);
      }
    });

    // Listen for controllerchange — reload when new SW takes over
    let refreshing = false;
    const handleControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      window.removeEventListener('message', handleSwUpdate);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  // Store waiting worker reference when received via custom event
  useEffect(() => {
    const handleWaitingWorker = (e: CustomEvent) => {
      setWaitingWorker(e.detail);
      setShowUpdate(true);
    };

    window.addEventListener('sw-waiting' as any, handleWaitingWorker);
    return () => window.removeEventListener('sw-waiting' as any, handleWaitingWorker);
  }, []);

  const handleUpdate = useCallback(() => {
    if (waitingWorker) {
      // Tell the waiting SW to skipWaiting — this triggers controllerchange → reload
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // Fallback: just reload
      window.location.reload();
    }
    setShowUpdate(false);
  }, [waitingWorker]);

  const handleDismiss = useCallback(() => {
    setShowUpdate(false);
  }, []);

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] sm:left-auto sm:right-4 sm:w-80">
      <div className="rounded-xl bg-blue-600 border border-blue-500 px-4 py-3 shadow-2xl shadow-blue-900/30 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Nueva versión disponible</p>
          <p className="text-xs text-blue-200 mt-0.5">Actualiza para obtener las mejoras.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDismiss}
            className="text-xs text-blue-200 hover:text-white transition-colors"
          >
            Luego
          </button>
          <button
            onClick={handleUpdate}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
          >
            Actualizar
          </button>
        </div>
      </div>
    </div>
  );
}
