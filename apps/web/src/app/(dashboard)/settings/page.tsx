'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const sections = [
  {
    title: 'Datos del negocio',
    description: 'Nombre, logo y datos de contacto',
    href: '/settings/business',
    icon: '🏪',
    industries: null,
  },
  {
    title: 'Canales de mensajería',
    description: 'WhatsApp, Messenger, Instagram',
    href: '/settings/channels',
    icon: '📱',
    industries: null,
  },
  {
    title: 'Asistente IA',
    description: 'Nombre, tono, horarios, instrucciones',
    href: '/settings/ai',
    icon: '🤖',
    industries: null,
  },
  {
    title: 'Memoria de IA',
    description: 'Qué recuerda la IA de cada cliente',
    href: '/settings/ai-memory',
    icon: '🧠',
    industries: null,
  },
  {
    title: 'Equipo',
    description: 'Usuarios, roles y permisos',
    href: '/settings/team',
    icon: '👥',
    industries: null,
  },
  {
    title: 'Plan y facturación',
    description: 'Plan actual y método de pago',
    href: '/settings/billing',
    icon: '💳',
    industries: null,
  },
  {
    title: 'Reportes automáticos',
    description: 'Recibe resúmenes por WhatsApp',
    href: '/settings/reports',
    icon: '📊',
    industries: null,
  },
  {
    title: 'Entregas y repartidores',
    description: 'Auto-despacho, tiempos, notificaciones',
    href: '/settings/delivery',
    icon: '🛵',
    industries: ['restaurante', 'ropa', 'ecommerce', 'barberia', 'taller'],
  },
];

export default function SettingsPage() {
  const { tenant } = useAuth();
  const industry = tenant?.industry ?? null;

  const visibleSections = sections.filter(s =>
    !s.industries || !industry || s.industries.includes(industry)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-sm text-gray-400">Ajustes de tu negocio, canales y asistente IA</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {visibleSections.map((section) => (
          <Link
            key={section.title}
            href={section.href}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm hover:border-brand-300 hover:shadow-md transition-all"
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl">{section.icon}</span>
              <div>
                <h3 className="font-semibold text-gray-900">{section.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{section.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
