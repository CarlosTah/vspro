'use client';

const stats = [
  { label: 'Pedidos hoy', value: '12', change: '+3', icon: '📋' },
  { label: 'En producción', value: '4', change: '', icon: '🏭' },
  { label: 'Listos para envío', value: '2', change: '', icon: '📦' },
  { label: 'Ventas del día', value: '$3,450', change: '+15%', icon: '💰' },
];

export function StatsCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">{stat.icon}</span>
            {stat.change && (
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                {stat.change}
              </span>
            )}
          </div>
          <p className="mt-3 text-2xl font-bold text-gray-900">{stat.value}</p>
          <p className="text-sm text-gray-500">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
