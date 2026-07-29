'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker and checks for updates periodically.
 * When an update is found, dispatches a custom event so SwUpdateBanner can show.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Register even in dev for testing, but SW file only works in production build
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[VSPRO] Service Worker registered:', registration.scope);

        // If there's already a waiting worker (e.g., user revisits after deploy)
        if (registration.waiting) {
          notifyUpdate(registration.waiting);
        }

        // Listen for new service worker installing
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            // When the new SW is installed and waiting to activate
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // There's a new version waiting — notify the user
              notifyUpdate(newWorker);
            }
          });
        });

        // Check for updates every 5 minutes
        const updateInterval = setInterval(() => {
          registration.update().catch(() => {});
        }, 5 * 60 * 1000);

        return () => clearInterval(updateInterval);
      })
      .catch((err) => {
        console.warn('[VSPRO] Service Worker registration failed:', err);
      });
  }, []);

  return null;
}

/**
 * Dispatches a custom event with the waiting service worker reference,
 * so the SwUpdateBanner component can trigger skipWaiting on it.
 */
function notifyUpdate(worker: ServiceWorker) {
  console.log('[VSPRO] New version available — notifying user');
  window.dispatchEvent(new CustomEvent('sw-waiting', { detail: worker }));
}
