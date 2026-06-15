import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 vspro-grid-bg vspro-glow-bottom">
          <div className="relative z-10 mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
