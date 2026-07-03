'use client';

import { useState, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { CardSkeleton } from '@/components/ui/skeleton';

type PromotionType = 'combo' | 'discount' | 'bogo' | 'bundle';

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  type: PromotionType;
  status: string;
  rules: any;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  currentUses: number;
  daysActive: string[];
  createdAt: string;
}

const typeLabels: Record<PromotionType, string> = {
  combo: 'Combo',
  discount: 'Descuento',
  bogo: '2x1 / BOGO',
  bundle: 'Paquete',
};

const typeIcons: Record<PromotionType, string> = {
  combo: '🎉',
  discount: '💸',
  bogo: '🎁',
  bundle: '📦',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-900/40 text-green-300',
  inactive: 'bg-gray-700/40 text-gray-400',
  scheduled: 'bg-blue-900/40 text-blue-300',
};

export default function PromotionsPage() {
  const { data: promotions, loading, refetch } = useApi<Promotion[]>('/promotions');
  const [showForm, setShowForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Promociones</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardSkeleton /><CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Promociones y Combos</h1>
          <p className="text-sm text-gray-400">Configura ofertas que el agente IA ofrecerá a tus clientes</p>
        </div>
        <button
          onClick={() => { setEditingPromo(null); setShowForm(true); }}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
        >
          + Nueva promoción
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <PromotionForm
          promotion={editingPromo}
          onClose={() => { setShowForm(false); setEditingPromo(null); }}
          onSaved={() => { setShowForm(false); setEditingPromo(null); refetch(); }}
        />
      )}

      {/* Promotions Grid */}
      {(!promotions || promotions.length === 0) ? (
        <div className="rounded-xl border border-card-border bg-card p-12 text-center">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-lg text-white font-medium">No hay promociones configuradas</p>
          <p className="text-sm text-gray-400 mt-1">Crea tu primer combo o descuento para que el agente lo ofrezca</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {promotions.map((promo) => (
            <PromotionCard
              key={promo.id}
              promotion={promo}
              onEdit={() => { setEditingPromo(promo); setShowForm(true); }}
              onToggle={async () => {
                const newStatus = promo.status === 'active' ? 'inactive' : 'active';
                await api.patch(`/promotions/${promo.id}`, { status: newStatus });
                refetch();
              }}
              onDelete={async () => {
                if (confirm('¿Eliminar esta promoción?')) {
                  await api.delete(`/promotions/${promo.id}`);
                  refetch();
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PromotionCard({ promotion, onEdit, onToggle, onDelete }: {
  promotion: Promotion;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const rules = promotion.rules;
  let details = '';

  switch (promotion.type) {
    case 'combo':
      details = `$${rules.comboPrice ?? '?'}`;
      if (rules.products?.length) {
        details += ` — ${rules.products.map((p: any) => `${p.quantity}x ${p.productName}`).join(', ')}`;
      }
      break;
    case 'discount':
      details = rules.discountType === 'percentage'
        ? `${rules.discountValue}% OFF`
        : `$${rules.discountValue} OFF`;
      if (rules.minOrderTotal) details += ` (min $${rules.minOrderTotal})`;
      break;
    case 'bogo':
      details = `Compra ${rules.buyQuantity ?? '?'}, lleva ${rules.getQuantity ?? '?'} gratis`;
      break;
    case 'bundle':
      details = `$${rules.bundlePrice ?? '?'} (ahorras $${rules.savings ?? '?'})`;
      break;
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{typeIcons[promotion.type]}</span>
          <div>
            <h3 className="text-sm font-semibold text-white">{promotion.name}</h3>
            <span className="text-xs text-gray-500">{typeLabels[promotion.type]}</span>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[promotion.status]}`}>
          {promotion.status === 'active' ? 'Activa' : promotion.status === 'inactive' ? 'Inactiva' : 'Programada'}
        </span>
      </div>

      {promotion.description && (
        <p className="text-sm text-gray-400">{promotion.description}</p>
      )}

      <p className="text-sm text-accent font-medium">{details}</p>

      {promotion.maxUses && (
        <p className="text-xs text-gray-500">Usos: {promotion.currentUses}/{promotion.maxUses}</p>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-card-border">
        <button onClick={onEdit} className="text-xs text-gray-400 hover:text-white transition-colors">Editar</button>
        <button onClick={onToggle} className="text-xs text-gray-400 hover:text-yellow-300 transition-colors">
          {promotion.status === 'active' ? 'Desactivar' : 'Activar'}
        </button>
        <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-400 transition-colors ml-auto">Eliminar</button>
      </div>
    </div>
  );
}

function PromotionForm({ promotion, onClose, onSaved }: {
  promotion: Promotion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(promotion?.name ?? '');
  const [description, setDescription] = useState(promotion?.description ?? '');
  const [type, setType] = useState<PromotionType>(promotion?.type ?? 'combo');
  const [saving, setSaving] = useState(false);

  // Type-specific fields
  const [comboPrice, setComboPrice] = useState(promotion?.rules?.comboPrice ?? '');
  const [comboProducts, setComboProducts] = useState(promotion?.rules?.products ?? [{ productName: '', quantity: 1 }]);
  const [discountType, setDiscountType] = useState(promotion?.rules?.discountType ?? 'percentage');
  const [discountValue, setDiscountValue] = useState(promotion?.rules?.discountValue ?? '');
  const [minOrderTotal, setMinOrderTotal] = useState(promotion?.rules?.minOrderTotal ?? '');
  const [buyQuantity, setBuyQuantity] = useState(promotion?.rules?.buyQuantity ?? 2);
  const [getQuantity, setGetQuantity] = useState(promotion?.rules?.getQuantity ?? 1);
  const [bundlePrice, setBundlePrice] = useState(promotion?.rules?.bundlePrice ?? '');
  const [savings, setSavings] = useState(promotion?.rules?.savings ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    let rules: any = {};
    switch (type) {
      case 'combo':
        rules = { comboPrice: parseFloat(comboPrice), products: comboProducts.filter((p: any) => p.productName) };
        break;
      case 'discount':
        rules = { discountType, discountValue: parseFloat(discountValue), minOrderTotal: minOrderTotal ? parseFloat(minOrderTotal) : undefined };
        break;
      case 'bogo':
        rules = { buyQuantity: parseInt(buyQuantity), getQuantity: parseInt(getQuantity) };
        break;
      case 'bundle':
        rules = { bundlePrice: parseFloat(bundlePrice), savings: savings ? parseFloat(savings) : undefined, products: comboProducts.filter((p: any) => p.productName) };
        break;
    }

    const body = { name, description: description || undefined, type, rules };

    try {
      if (promotion) {
        await api.patch(`/promotions/${promotion.id}`, body);
      } else {
        await api.post('/promotions', body);
      }
      onSaved();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-card-border bg-card p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{promotion ? 'Editar' : 'Nueva'} Promoción</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm text-gray-400">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Ej: Combo Familiar"
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm text-gray-400">Descripción (opcional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción breve de la promo"
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
            />
          </div>

          {/* Type */}
          <div>
            <label className="text-sm text-gray-400">Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PromotionType)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
            >
              <option value="combo">Combo (productos a precio especial)</option>
              <option value="discount">Descuento (% o monto fijo)</option>
              <option value="bogo">2x1 / Compra X lleva Y gratis</option>
              <option value="bundle">Paquete (bundle con ahorro)</option>
            </select>
          </div>

          {/* Type-specific fields */}
          {(type === 'combo' || type === 'bundle') && (
            <div className="space-y-3 rounded-lg border border-gray-700 p-3">
              <label className="text-sm text-gray-300 font-medium">Productos del {type === 'combo' ? 'combo' : 'paquete'}</label>
              {comboProducts.map((p: any, i: number) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={p.productName}
                    onChange={(e) => {
                      const updated = [...comboProducts];
                      updated[i] = { ...updated[i], productName: e.target.value };
                      setComboProducts(updated);
                    }}
                    placeholder="Nombre del producto"
                    className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white"
                  />
                  <input
                    type="number"
                    value={p.quantity}
                    onChange={(e) => {
                      const updated = [...comboProducts];
                      updated[i] = { ...updated[i], quantity: parseInt(e.target.value) || 1 };
                      setComboProducts(updated);
                    }}
                    className="w-16 rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white text-center"
                    min={1}
                  />
                  {i > 0 && (
                    <button type="button" onClick={() => setComboProducts(comboProducts.filter((_: any, j: number) => j !== i))} className="text-red-400 text-sm">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setComboProducts([...comboProducts, { productName: '', quantity: 1 }])} className="text-xs text-accent">+ Agregar producto</button>
              <div>
                <label className="text-xs text-gray-500">Precio {type === 'combo' ? 'del combo' : 'del paquete'}</label>
                <input
                  type="number"
                  value={type === 'combo' ? comboPrice : bundlePrice}
                  onChange={(e) => type === 'combo' ? setComboPrice(e.target.value) : setBundlePrice(e.target.value)}
                  placeholder="99.00"
                  step="0.01"
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white"
                />
              </div>
              {type === 'bundle' && (
                <div>
                  <label className="text-xs text-gray-500">Ahorro ($)</label>
                  <input
                    type="number"
                    value={savings}
                    onChange={(e) => setSavings(e.target.value)}
                    placeholder="30"
                    step="0.01"
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white"
                  />
                </div>
              )}
            </div>
          )}

          {type === 'discount' && (
            <div className="space-y-3 rounded-lg border border-gray-700 p-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Tipo de descuento</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white"
                  >
                    <option value="percentage">Porcentaje (%)</option>
                    <option value="fixed">Monto fijo ($)</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Valor</label>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'percentage' ? '15' : '50'}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500">Compra mínima (opcional)</label>
                <input
                  type="number"
                  value={minOrderTotal}
                  onChange={(e) => setMinOrderTotal(e.target.value)}
                  placeholder="200"
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white"
                />
              </div>
            </div>
          )}

          {type === 'bogo' && (
            <div className="space-y-3 rounded-lg border border-gray-700 p-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Compra (cantidad)</label>
                  <input
                    type="number"
                    value={buyQuantity}
                    onChange={(e) => setBuyQuantity(e.target.value)}
                    min={1}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Lleva gratis (cantidad)</label>
                  <input
                    type="number"
                    value={getQuantity}
                    onChange={(e) => setGetQuantity(e.target.value)}
                    min={1}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando...' : (promotion ? 'Actualizar' : 'Crear promoción')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
