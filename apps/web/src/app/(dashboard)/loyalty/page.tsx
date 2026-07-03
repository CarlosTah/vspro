'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { CardSkeleton } from '@/components/ui/skeleton';

interface LoyaltyConfig {
  id: string;
  isEnabled: boolean;
  pointsPerCurrency: number;
  redemptionRate: number;
  welcomeBonus: number;
  tiers: { name: string; minPoints: number; multiplier: number }[];
  rewards: { name: string; pointsCost: number; type: string; value: number; productName?: string }[];
}

interface LeaderboardEntry {
  customerId: string;
  customerName: string;
  phone: string;
  totalPoints: number;
  totalEarned: number;
  totalRedeemed: number;
  orderCount: number;
}

export default function LoyaltyPage() {
  const { data: config, loading, refetch } = useApi<LoyaltyConfig>('/loyalty/config');
  const { data: leaderboard } = useApi<LeaderboardEntry[]>('/loyalty/leaderboard');
  const [saving, setSaving] = useState(false);
  const [showRewardForm, setShowRewardForm] = useState(false);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Programa de Lealtad</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardSkeleton /><CardSkeleton />
        </div>
      </div>
    );
  }

  const cfg = config ?? {
    id: '', isEnabled: false, pointsPerCurrency: 1,
    redemptionRate: 10, welcomeBonus: 0, tiers: [], rewards: [],
  };

  const handleToggle = async () => {
    setSaving(true);
    await api.patch('/loyalty/config', { isEnabled: !cfg.isEnabled });
    refetch();
    setSaving(false);
  };

  const handleUpdateConfig = async (updates: Partial<LoyaltyConfig>) => {
    setSaving(true);
    await api.patch('/loyalty/config', updates);
    refetch();
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Programa de Lealtad</h1>
          <p className="text-sm text-gray-400">Puntos y recompensas para tus clientes frecuentes</p>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            cfg.isEnabled
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {cfg.isEnabled ? '✓ Activo' : 'Activar programa'}
        </button>
      </div>

      {!cfg.isEnabled && (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-lg text-white font-medium">Programa de lealtad desactivado</p>
          <p className="text-sm text-gray-400 mt-1">Actívalo para que tus clientes acumulen puntos y obtengan recompensas</p>
        </div>
      )}

      {cfg.isEnabled && (
        <>
          {/* Config Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ConfigCard
              icon="💰"
              label="Puntos por $1"
              value={cfg.pointsPerCurrency}
              onSave={(v) => handleUpdateConfig({ pointsPerCurrency: Number(v) })}
            />
            <ConfigCard
              icon="🔄"
              label="Puntos para $1 desc."
              value={cfg.redemptionRate}
              onSave={(v) => handleUpdateConfig({ redemptionRate: Number(v) })}
            />
            <ConfigCard
              icon="🎁"
              label="Bono bienvenida"
              value={cfg.welcomeBonus}
              onSave={(v) => handleUpdateConfig({ welcomeBonus: Number(v) })}
            />
            <div className="rounded-xl border border-card-border bg-card p-4">
              <span className="text-xl">📊</span>
              <p className="mt-2 text-sm text-gray-400">Clientes con puntos</p>
              <p className="text-2xl font-bold text-white">{leaderboard?.length ?? 0}</p>
            </div>
          </div>

          {/* Tiers */}
          <div className="rounded-xl border border-card-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300">Niveles</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {cfg.tiers.map((tier, i) => (
                <div key={i} className="rounded-lg border border-gray-700 p-3 text-center">
                  <p className="text-lg font-bold text-white">{tier.name}</p>
                  <p className="text-xs text-gray-500">{tier.minPoints}+ puntos</p>
                  <p className="text-sm text-accent">x{tier.multiplier} multiplicador</p>
                </div>
              ))}
            </div>
          </div>

          {/* Rewards */}
          <div className="rounded-xl border border-card-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300">Recompensas canjeables</h3>
              <button
                onClick={() => setShowRewardForm(true)}
                className="text-xs text-accent hover:underline"
              >
                + Agregar recompensa
              </button>
            </div>
            {cfg.rewards.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No hay recompensas configuradas</p>
            ) : (
              <div className="space-y-2">
                {cfg.rewards.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/50">
                    <div>
                      <p className="text-sm text-white font-medium">{r.name}</p>
                      <p className="text-xs text-gray-500">
                        {r.type === 'discount_fixed' && `$${r.value} de descuento`}
                        {r.type === 'discount_percent' && `${r.value}% de descuento`}
                        {r.type === 'free_product' && `${r.productName ?? 'Producto'} gratis`}
                        {r.type === 'free_shipping' && 'Envío gratis'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-accent font-bold">{r.pointsCost} pts</p>
                      <button
                        onClick={() => {
                          const updated = cfg.rewards.filter((_, j) => j !== i);
                          handleUpdateConfig({ rewards: updated });
                        }}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div className="rounded-xl border border-card-border bg-card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Top clientes</h3>
            {(!leaderboard || leaderboard.length === 0) ? (
              <p className="text-sm text-gray-500 text-center py-4">Aún no hay clientes con puntos</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-5 gap-2 text-xs text-gray-500 font-medium px-2">
                  <span>Cliente</span>
                  <span className="text-center">Puntos</span>
                  <span className="text-center">Ganados</span>
                  <span className="text-center">Canjeados</span>
                  <span className="text-center">Pedidos</span>
                </div>
                {leaderboard.slice(0, 15).map((entry, i) => (
                  <div key={entry.customerId} className="grid grid-cols-5 gap-2 items-center px-2 py-1.5 rounded-lg hover:bg-gray-800/50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-500 w-4">{i + 1}</span>
                      <span className="text-sm text-white truncate">{entry.customerName ?? entry.phone}</span>
                    </div>
                    <span className="text-sm text-center text-accent font-bold">{entry.totalPoints}</span>
                    <span className="text-sm text-center text-green-300">{entry.totalEarned}</span>
                    <span className="text-sm text-center text-yellow-300">{entry.totalRedeemed}</span>
                    <span className="text-sm text-center text-gray-400">{entry.orderCount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Add Reward Modal */}
      {showRewardForm && (
        <RewardForm
          onClose={() => setShowRewardForm(false)}
          onSave={(reward) => {
            const updated = [...cfg.rewards, reward];
            handleUpdateConfig({ rewards: updated });
            setShowRewardForm(false);
          }}
        />
      )}
    </div>
  );
}

function ConfigCard({ icon, label, value, onSave }: {
  icon: string; label: string; value: number; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));

  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <span className="text-xl">{icon}</span>
      <p className="mt-2 text-sm text-gray-400">{label}</p>
      {editing ? (
        <div className="flex gap-1 mt-1">
          <input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-20 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white"
            autoFocus
          />
          <button
            onClick={() => { onSave(val); setEditing(false); }}
            className="text-xs text-accent"
          >
            ✓
          </button>
        </div>
      ) : (
        <p
          className="text-2xl font-bold text-white cursor-pointer hover:text-accent transition-colors"
          onClick={() => setEditing(true)}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function RewardForm({ onClose, onSave }: {
  onClose: () => void;
  onSave: (reward: any) => void;
}) {
  const [name, setName] = useState('');
  const [pointsCost, setPointsCost] = useState('');
  const [type, setType] = useState('discount_fixed');
  const [value, setValue] = useState('');
  const [productName, setProductName] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-card-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Nueva Recompensa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div>
          <label className="text-sm text-gray-400">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Descuento $50"
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <label className="text-sm text-gray-400">Costo en puntos</label>
          <input
            type="number"
            value={pointsCost}
            onChange={(e) => setPointsCost(e.target.value)}
            placeholder="500"
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <label className="text-sm text-gray-400">Tipo de recompensa</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
          >
            <option value="discount_fixed">Descuento monto fijo ($)</option>
            <option value="discount_percent">Descuento porcentaje (%)</option>
            <option value="free_product">Producto gratis</option>
            <option value="free_shipping">Envío gratis</option>
          </select>
        </div>

        <div>
          <label className="text-sm text-gray-400">
            {type === 'discount_fixed' ? 'Monto ($)' : type === 'discount_percent' ? 'Porcentaje (%)' : 'Cantidad'}
          </label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === 'discount_percent' ? '15' : '50'}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
          />
        </div>

        {type === 'free_product' && (
          <div>
            <label className="text-sm text-gray-400">Nombre del producto</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Ej: Refresco"
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
            />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400">
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!name || !pointsCost) return;
              onSave({
                name,
                pointsCost: parseInt(pointsCost),
                type,
                value: parseFloat(value) || 0,
                ...(type === 'free_product' && productName ? { productName } : {}),
              });
            }}
            className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
