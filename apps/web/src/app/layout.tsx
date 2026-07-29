import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { OfflineBanner } from '@/components/offline-banner';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { SwUpdateBanner } from '@/components/sw-update-banner';
import './globals.css';

export const metadata: Metadata = {
  title: 'VSPRO — Panel de Administración',
  description: 'Gestiona pedidos, producción y clientes desde un solo lugar',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VSPRO',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen bg-background font-body">
        <ServiceWorkerRegister />
        <SwUpdateBanner />
        <OfflineBanner />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
