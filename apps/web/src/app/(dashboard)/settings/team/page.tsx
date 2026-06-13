'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { TableSkeleton } from '@/components/ui/skeleton';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  operator: 'Operador',
};

const roleBadges: Record<string, string> = {
  admin: 'bg-purple-50 text-purple-700',
  manager: 'bg-blue-50 text-blue-700',
  operator: 'bg-gray-100 text-gray-700',
};

export default function TeamPage() {
  const { data: users, loading, error, refetch } = useApi<any[]>('/team');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteData, setInviteData] = useState({ name: '', email: '', role: 'operator', password: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleInvite = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await api.post('/team/invite', {
        ...inviteData,
        password: inviteData.password || undefined,
      });
      setResult(res.message);
      setInviteData({ name: '', email: '', role: 'operator', password: '' });
      setShowInvite(false);
      refetch();
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (userId: string, name: string) => {
    if (!confirm(`¿Desactivar a ${name}?`)) return;
    try {
      await api.delete(`/team/${userId}`);
      refetch();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReactivate = async (userId: string) => {
    try {
      await api.post(`/team/${userId}/reactivate`);
      refetch();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/team/${userId}/role`, { role: newRole });
      refetch();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipo</h1>
          <p className="text-sm text-gray-500">Gestiona los usuarios de tu negocio</p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showInvite ? 'Cancelar' : '+ Invitar usuario'}
        </button>
      </div>

      {/* Resultado de invitación */}
      {result && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          result.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {result}
        </div>
      )}

      {/* Formulario de invitación */}
      {showInvite && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="font-medium text-gray-900">Invitar nuevo usuario</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={inviteData.name}
              onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
              placeholder="Nombre completo"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <input
              value={inviteData.email}
              onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
              placeholder="Email"
              type="email"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <select
              value={inviteData.role}
              onChange={(e) => setInviteData({ ...inviteData, role: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="operator">Operador (solo producción)</option>
              <option value="manager">Gerente (todo excepto billing)</option>
              <option value="admin">Administrador (acceso total)</option>
            </select>
            <input
              value={inviteData.password}
              onChange={(e) => setInviteData({ ...inviteData, password: e.target.value })}
              placeholder="Contraseña (auto si vacío)"
              type="text"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={handleInvite}
            disabled={saving || !inviteData.name || !inviteData.email}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      )}

      {/* Tabla de usuarios */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : error ? (
          <div className="p-8 text-center text-red-500">{error}</div>
        ) : users && users.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Usuario</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Rol</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Estado</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium border-0 cursor-pointer ${roleBadges[u.role] ?? ''}`}
                    >
                      <option value="admin">Administrador</option>
                      <option value="manager">Gerente</option>
                      <option value="operator">Operador</option>
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    {u.isActive ? (
                      <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Activo</span>
                    ) : (
                      <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">Inactivo</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {u.isActive ? (
                      <button
                        onClick={() => handleDeactivate(u.id, u.name)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Desactivar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(u.id)}
                        className="text-xs text-green-600 hover:text-green-700"
                      >
                        Reactivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-400">No hay usuarios</div>
        )}
      </div>
    </div>
  );
}
