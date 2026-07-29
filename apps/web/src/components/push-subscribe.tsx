'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';

const VAPID_PUBLIC_KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LNgDLnwZIHiRJ18TL8FnRXmm-JFGNZfJzJPC0g-b0hGEaA';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function PushSubscribe() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;

    const subscribe = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) return; // already subscribed

        // Only ask if user hasn't been prompted recently
        const lastAsked = localStorage.getItem('push-asked');
        if (lastAsked && Date.now() - parseInt(lastAsked) < 7 * 86400000) return;

        const permission = await Notification.requestPermission();
        localStorage.setItem('push-asked', Date.now().toString());
        if (permission !== 'granted') return;

        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        // Send subscription to backend
        await api.post('/notifications/push/subscribe', { subscription: subscription.toJSON() });
      } catch (err) {
        console.warn('[VSPRO] Push subscription failed:', err);
      }
    };

    // Wait a bit before asking (don't interrupt first load)
    const timer = setTimeout(subscribe, 5000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
