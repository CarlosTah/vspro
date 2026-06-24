'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { VsproLogo } from '@/components/vspro-logo';

const STEPS = ['Bienvenida', 'Datos del negocio', 'Tu primer producto', 'Listo'];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Business form
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState('09:00 - 18:00');
  const [agentName, setAgentName] = useState('Asistente');

  // Product form
  const [products, setProducts] = useState<{ name: string; price: number; category: string }[]>([]);
  const [pName, setPName] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pCategory, setPCategory] = useState('');

  const addProduct = () => {
    if (!pName || !pPrice) return;
    setProducts([...products, { name: pName, price: parseFloat(pPrice), category: pCategory || 'General' }]);
    setPName('');
    setPPrice('');
    setPCategory('');
  };

  const removeProduct = (i: number) => {
    setProducts(products.filter((_, idx) => idx !== i));
  };

  const handleSaveBusiness = async () => {
    setSaving(true);
    try {
      // Save business config via AI config (stores in ai_config table)
      await api.patch('/ai/config', {
        assistantName: agentName || 'Asistente',
        businessData: { phone, address, hours },
      }).catch(() => {});
      setStep(2);
    } catch {
      setStep(2);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProducts = async () => {
    setSaving(true);
    try {
      for (const p of products) {
        await api.post('/products', { name: p.name, price: p.price, category: p.category }).catch(() => {});
      }
      setStep(3);
    } catch {
      setStep(3);
    } finally {
      setSaving(false);
    }
  };

  const goToDashboard = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="mb-6">
          <VsproLogo size="md" showSlogan={false} />
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-1 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i <= step ? 'w-10 bg-blue-500' : 'w-10 bg-gray-700'
              }`}
            />
          ))}
        </div>

        <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 shadow-xl">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center space-y-5">
              <div className="text-5xl">🎉</div>
              <h2 className="text-xl font-bold text-white">Tu cuenta está lista</h2>
              <p className="text-sm text-gray-400">
                Tienes 7 días de prueba gratis. Vamos a configurar tu negocio en menos de 2 minutos para que tu agente IA empiece a atender clientes.
              </p>
              <div className="bg-gray-900 rounded-lg p-4 text-left">
                <p className="text-xs text-gray-400 mb-2">Tu plan incluye:</p>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>✅ Agente IA por WhatsApp</li>
                  <li>✅ Catálogo de productos</li>
                  <li>✅ Sistema de pedidos</li>
                  <li>✅ Panel de administración</li>
                  <li>✅ Reportes de ventas</li>
                </ul>
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Configurar mi negocio →
              </button>
              <button
                onClick={goToDashboard}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Saltar y configurar después
              </button>
            </div>
          )}

          {/* Step 1: Business Details */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-white">Configura tu negocio</h2>
                <p className="text-sm text-gray-400 mt-1">Esta información ayuda a tu agente IA a atender mejor.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Teléfono del negocio (WhatsApp)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="529841234567"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Con lada del país (52 para México)</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Dirección (opcional)</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Av. Principal #123, Col. Centro"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Horario de atención</label>
                <input
                  type="text"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="09:00 - 18:00"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Nombre de tu agente IA</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Ej: Max, Lupita, Asistente"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="flex-1 rounded-lg border border-gray-600 py-3 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Atrás
                </button>
                <button
                  onClick={handleSaveBusiness}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Guardando...' : 'Siguiente →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Products */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-white">Agrega tus productos</h2>
                <p className="text-sm text-gray-400 mt-1">Tu agente IA usará este catálogo para atender pedidos. Puedes agregar más después.</p>
              </div>

              {/* Add product form */}
              <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="Nombre"
                    className="col-span-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    value={pPrice}
                    onChange={(e) => setPPrice(e.target.value)}
                    placeholder="Precio"
                    min={0}
                    className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pCategory}
                    onChange={(e) => setPCategory(e.target.value)}
                    placeholder="Categoría (opcional)"
                    className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addProduct}
                    disabled={!pName || !pPrice}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    + Agregar
                  </button>
                </div>
              </div>

              {/* Product list */}
              {products.length > 0 && (
                <div className="space-y-1.5">
                  {products.map((p, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-sm text-white">{p.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{p.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-green-400">${p.price}</span>
                        <button onClick={() => removeProduct(i)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {products.length === 0 && (
                <p className="text-center text-xs text-gray-500 py-4">
                  Agrega al menos 1 producto para que tu agente pueda vender.
                  <br />También puedes hacerlo después desde el panel.
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-lg border border-gray-600 py-3 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Atrás
                </button>
                <button
                  onClick={handleSaveProducts}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Guardando...' : products.length > 0 ? 'Guardar y terminar →' : 'Saltar por ahora →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Complete */}
          {step === 3 && (
            <div className="text-center space-y-5">
              <div className="text-5xl">🚀</div>
              <h2 className="text-xl font-bold text-white">¡Todo listo!</h2>
              <p className="text-sm text-gray-400">
                Tu negocio está configurado y tu agente IA está listo para atender clientes por WhatsApp.
              </p>

              <div className="bg-gray-900 rounded-lg p-4 text-left space-y-2">
                <p className="text-xs text-gray-400">Próximos pasos:</p>
                <ul className="space-y-1.5 text-sm text-gray-300">
                  <li>1️⃣ Conecta tu WhatsApp Business en Configuración → Canales</li>
                  <li>2️⃣ Envía un mensaje de prueba a tu número</li>
                  <li>3️⃣ Agrega más productos desde el panel</li>
                </ul>
              </div>

              <button
                onClick={goToDashboard}
                className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Ir a mi panel →
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          VSPRO · 7 días gratis · Cancela cuando quieras
        </p>
      </div>
    </div>
  );
}
