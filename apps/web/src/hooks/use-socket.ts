'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Notification {
  type: string;
  title: string;
  message: string;
  data?: any;
  timestamp: string;
}

/**
 * Hook para conectarse al WebSocket del servidor.
 * Maneja autenticación, reconexión y aislamiento por tenant automáticamente.
 *
 * Uso:
 *   const { connected, notifications, on, off } = useSocket();
 */
export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('vspro_token')
      : null;

    if (!token) return;

    const socket = io(`${SOCKET_URL}/events`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Listener global de notificaciones
    socket.on('notification', (data: Notification) => {
      setNotifications((prev) => [data, ...prev].slice(0, 50)); // máx 50
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  /**
   * Suscribirse a un evento específico.
   */
  const on = useCallback((event: string, handler: (data: any) => void) => {
    socketRef.current?.on(event, handler);
  }, []);

  /**
   * Desuscribirse de un evento.
   */
  const off = useCallback((event: string, handler?: (data: any) => void) => {
    if (handler) {
      socketRef.current?.off(event, handler);
    } else {
      socketRef.current?.removeAllListeners(event);
    }
  }, []);

  /**
   * Limpiar notificaciones.
   */
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  /**
   * Marcar una notificación como leída (eliminarla).
   */
  const dismissNotification = useCallback((index: number) => {
    setNotifications((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    connected,
    notifications,
    on,
    off,
    clearNotifications,
    dismissNotification,
    unreadCount: notifications.length,
  };
}
