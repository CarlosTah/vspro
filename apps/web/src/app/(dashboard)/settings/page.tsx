'use client';

import Link from 'next/link';

const sections = [
  {
    title: 'Datos del negocio',
    description: 'Nombre, logo y datos de contacto',
    href: '/settings/team',
    icon: '🏪',
  },
  {
    title: 'Canales de mensajería',
    description: 'WhatsApp, Messenger, Instagram',
    href: '/settings/channels',
    icon: '📱',
  },
  {
    title: 'Asistente IA',
    description: 'Nombre, tono, horarios, instrucciones',
    href: '/settings/ai',
    icon: '🤖',
  },
  {
    title: 'Memoria de IA',
    description: 'Qué recuerda la IA de cada cliente',
    href: '/settings/ai-memory',
    icon: '🧠',
  },
  {
    title: 'Equipo',
    description: 'Usuarios, roles y permisos',
    href: '/settings/team',
    icon: '👥',
  },
  {
    title: 'Plan y facturación',
    description: 'Plan actual: Básico · $49/mes',
    href: '/settings/team',
    icon: '💳',
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500">Ajustes de tu negocio, canales y asistente IA</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
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
