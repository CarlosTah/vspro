'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useApi } from '@/hooks/use-api';

export default function PrintTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, loading, error } = useApi<any>(`/orders/${id}`);

  useEffect(() => {
    if (order && !loading) {
      // Auto-print after render
      setTimeout(() => window.print(), 500);
    }
  }, [order, loading]);

  if (loading) return <div className="p-4 text-center">Cargando...</div>;
  if (error || !order) return <div className="p-4 text-center text-red-500">Error al cargar pedido</div>;

  const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items ?? []);
  const address = order.shippingAddress
    ? typeof order.shippingAddress === 'string'
      ? order.shippingAddress
      : `${order.shippingAddress.street ?? ''} ${order.shippingAddress.colony ?? ''} ${order.shippingAddress.city ?? ''}`.trim()
    : null;

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-ticket, #print-ticket * { visibility: visible; }
          #print-ticket { position: absolute; left: 0; top: 0; width: 80mm; }
          @page { size: 80mm auto; margin: 2mm; }
        }
        #print-ticket {
          font-family: 'Courier New', monospace;
          width: 80mm;
          margin: 0 auto;
          padding: 4mm;
          background: white;
          color: black;
        }
      `}</style>

      <div className="min-h-screen bg-gray-900 p-4">
        {/* Screen controls */}
        <div className="max-w-md mx-auto mb-4 flex gap-2 print:hidden">
          <button
            onClick={() => window.print()}
            className="vspro-btn-primary flex-1"
          >
            🖨️ Imprimir ticket
          </button>
          <button
            onClick={() => window.history.back()}
            className="vspro-btn-secondary"
          >
            ← Volver
          </button>
        </div>

        {/* Ticket */}
        <div id="print-ticket" className="bg-white text-black rounded-lg shadow-lg">
          {/* Header */}
          <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
            <p className="text-lg font-bold">PEDIDO</p>
            <p className="text-xl font-bold">{order.orderNumber}</p>
            <p className="text-xs text-gray-500">
              {new Date(order.createdAt).toLocaleString('es-MX', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>

          {/* Client */}
          <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
            <p className="text-xs text-gray-500">CLIENTE:</p>
            <p className="text-sm font-semibold">{order.customerName ?? 'Sin nombre'}</p>
            {address && (
              <>
                <p className="text-xs text-gray-500 mt-1">DIRECCIÓN:</p>
                <p className="text-xs">{address}</p>
              </>
            )}
          </div>

          {/* Items */}
          <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-1">Producto</th>
                  <th className="text-center py-1">Cant</th>
                  <th className="text-right py-1">Precio</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, i: number) => (
                  <tr key={i}>
                    <td className="py-0.5 text-left">{item.productName ?? item.name}</td>
                    <td className="py-0.5 text-center">{item.quantity}</td>
                    <td className="py-0.5 text-right">
                      ${((item.price ?? item.unitPrice ?? 0) * item.quantity).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="text-right mb-2">
            <p className="text-lg font-bold">TOTAL: ${parseFloat(order.total).toFixed(2)}</p>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="border-t border-dashed border-gray-400 pt-2 mb-2">
              <p className="text-xs text-gray-500">NOTAS:</p>
              <p className="text-xs">{order.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center border-t border-dashed border-gray-400 pt-2">
            <p className="text-xs text-gray-400">Generado por VSPRO</p>
            <p className="text-xs text-gray-400">vspro.app</p>
          </div>
        </div>
      </div>
    </>
  );
}
