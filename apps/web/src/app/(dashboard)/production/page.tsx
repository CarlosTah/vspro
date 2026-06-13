'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  customerName: string;
  customerChannelType?: string;
  items?: any;
  notes?: string;
  createdAt: string;
}

const COLUMNS = [
  { id: 'payment_verified', label: 'Pendiente', color: 'border-yellow-300 bg-yellow-50', badge: 'bg-yellow-100 text-yellow-800' },
  { id: 'in_production', label: 'En producción', color: 'border-orange-300 bg-orange-50', badge: 'bg-orange-100 text-orange-800' },
  { id: 'ready', label: 'Listo', color: 'border-green-300 bg-green-50', badge: 'bg-green-100 text-green-800' },
  { id: 'shipped', label: 'Enviado', color: 'border-indigo-300 bg-indigo-50', badge: 'bg-indigo-100 text-indigo-800' },
];

const TRANSITIONS: Record<string, { endpoint: string; label: string }> = {
  payment_verified: { endpoint: 'start-production', label: 'Iniciar →' },
  in_production: { endpoint: 'mark-ready', label: 'Listo ✓' },
  ready: { endpoint: 'ship', label: 'Enviar →' },
};

export default function ProductionKanbanPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      const all = await api.get<Order[]>('/orders');
      const relevant = all.filter((o) =>
        ['payment_verified', 'in_production', 'ready', 'shipped'].includes(o.status),
      );
      setOrders(relevant);
    } catch (err) {
      console.error('Error cargando pedidos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const getColumnOrders = (status: string) =>
    orders.filter((o) => o.status === status);

  const moveOrder = async (orderId: string, fromStatus: string) => {
    const transition = TRANSITIONS[fromStatus];
    if (!transition) return;

    setActionLoading(orderId);
    try {
      await api.post(`/orders/${orderId}/${transition.endpoint}`);
      await fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Error al mover pedido');
    } finally {
      setActionLoading(null);
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    e.dataTransfer.setData('orderId', orderId);
    setDragging(orderId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData('orderId');
    setDragging(null);

    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === targetStatus) return;

    // Verificar que la transición es válida (solo al siguiente estado)
    const currentIdx = COLUMNS.findIndex((c) => c.id === order.status);
    const targetIdx = COLUMNS.findIndex((c) => c.id === targetStatus);

    if (targetIdx !== currentIdx + 1) {
      alert('Solo puedes mover al siguiente estado');
      return;
    }

    await moveOrder(orderId, order.status);
  };

  const handleDragEnd = () => setDragging(null);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Producción</h1>
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4 h-96 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Producción</h1>
          <p className="text-sm text-gray-500">Arrastra los pedidos entre columnas o usa los botones</p>
        </div>
        <button
          onClick={fetchOrders}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          ↻ Actualizar
        </button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const colOrders = getColumnOrders(col.id);
          return (
            <div
              key={col.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`rounded-xl border-2 ${col.color} p-3 min-h-[400px] transition-colors ${
                dragging ? 'border-dashed' : ''
              }`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${col.badge}`}>
                  {colOrders.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {colOrders.map((order) => (
                  <div
                    key={order.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, order.id)}
                    onDragEnd={handleDragEnd}
                    className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing transition-all ${
                      dragging === order.id ? 'opacity-50 scale-95' : 'hover:shadow-md'
                    } ${actionLoading === order.id ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-900">{order.orderNumber}</p>
                      <span className="text-xs text-gray-400">${order.total}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">{order.customerName}</p>
                    {order.notes && (
                      <p className="mt-1 text-xs text-gray-400 italic truncate">{order.notes}</p>
                    )}

                    {/* Action button */}
                    {TRANSITIONS[order.status] && (
                      <button
                        onClick={() => moveOrder(order.id, order.status)}
                        disabled={actionLoading === order.id}
                        className="mt-2 w-full rounded-md bg-gray-800 px-2 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading === order.id
                          ? '...'
                          : TRANSITIONS[order.status].label}
                      </button>
                    )}
                  </div>
                ))}

                {colOrders.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
                    <p className="text-xs text-gray-400">Sin pedidos</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
