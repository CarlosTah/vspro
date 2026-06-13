import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'VSPRO — Panel de Administración',
  description: 'Gestiona pedidos, producción y clientes desde un solo lugar',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-background font-body">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
