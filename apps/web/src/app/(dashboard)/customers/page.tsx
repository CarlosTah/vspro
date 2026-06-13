'use client';

import { useApi } from '@/hooks/use-api';
import { TableSkeleton } from '@/components/ui/skeleton';

const channelIcons: Record<string, string> = {
  whatsapp: '💬',
  messenger: '📘',
  instagram: '📷',
};

export default function CustomersPage() {
  const { data: customers, loading, error } = useApi<any[]>('/customers');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <p className="text-sm text-gray-500">
          Todos los clientes que han contactado tu negocio
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : error ? (
          <div className="p-8 text-center text-red-500">{error}</div>
        ) : customers && customers.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Cliente</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Canal</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Contacto</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Desde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{c.name ?? 'Sin nombre'}</p>
                    {c.notes && <p className="text-xs text-gray-400">{c.notes}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 text-sm">
                      {channelIcons[c.channelType] ?? '📱'}
                      <span className="capitalize text-gray-600">{c.channelType}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                    {c.phone ?? c.channelId ?? c.email ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString('es-MX')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-400">
            Aún no tienes clientes. Llegarán cuando alguien te escriba por WhatsApp.
          </div>
        )}
      </div>
    </div>
  );
}
