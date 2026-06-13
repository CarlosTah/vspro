'use client';

const queue = [
  { number: 'ORD-2026-00004', items: '3x Tortilla maíz, 2x Tortilla harina', assignedTo: 'Pedro', status: 'in_production' },
  { number: 'ORD-2026-00003', items: '1x Pan dulce surtido', assignedTo: null, status: 'payment_verified' },
  { number: 'ORD-2026-00002', items: '5x Tortilla maíz', assignedTo: 'María', status: 'in_production' },
];

export function ProductionQueue() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="font-semibold text-gray-900">Cola de producción</h3>
        <a href="/production" className="text-sm text-brand-600 hover:text-brand-700">
          Ver cola →
        </a>
      </div>
      <div className="divide-y divide-gray-100">
        {queue.map((item) => (
          <div key={item.number} className="px-5 py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">{item.number}</p>
              {item.status === 'payment_verified' ? (
                <span className="rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                  Pendiente
                </span>
              ) : (
                <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                  En proceso
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">{item.items}</p>
            <p className="text-xs text-gray-400">
              {item.assignedTo ? `Asignado a: ${item.assignedTo}` : 'Sin asignar'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
