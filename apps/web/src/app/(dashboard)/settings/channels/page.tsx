'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const CHANNEL_INFO: Record<string, { icon: string; name: string; color: string }> = {
  whatsapp: { icon: '💬', name: 'WhatsApp Business', color: 'border-green-300 bg-green-50' },
  messenger: { icon: '📘', name: 'Messenger', color: 'border-blue-300 bg-blue-50' },
  instagram: { icon: '📷', name: 'Instagram DM', color: 'border-pink-300 bg-pink-50' },
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState<string | null>(null);
  const [setupResult, setSetupResult] = useState<any>(null);

  // Form
  const [externalId, setExternalId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/channels').then(setChannels).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleConnect = async (type: string) => {
    setSaving(true);
    try {
      const result = await api.post('/channels', { type, externalId, accessToken });
      setSetupResult(result);
      setChannels([...channels, result.channel]);
      setExternalId('');
      setAccessToken('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (id: string) => {
    try {
      const result = await api.post(`/channels/${id}/test`);
      alert(result.connected ? `✅ Conectado: ${result.data?.name}` : `❌ Error: ${result.error}`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const connectedTypes = channels.map((c) => c.type);

  if (loading) return <div className="p-8 text-gray-400">Cargando canales...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Canales de mensajería</h1>
        <p className="text-sm text-gray-500">Conecta WhatsApp, Messenger o Instagram para recibir pedidos</p>
      </div>

      {/* Canales conectados */}
      {channels.length > 0 && (
        <div className="space-y-3">
          {channels.map((ch) => {
            const info = CHANNEL_INFO[ch.type];
            return (
              <div key={ch.id} className={`rounded-xl border-2 ${info?.color ?? ''} p-5 flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{info?.icon}</span>
                  <div>
                    <p className="font-medium text-gray-900">{info?.name}</p>
                    <p className="text-xs text-gray-500">ID: {ch.externalId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {ch.isActive ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Activo</span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">Inactivo</span>
                  )}
                  <button
                    onClick={() => handleTest(ch.id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
                  >
                    Probar conexión
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agregar canal */}
      {['whatsapp', 'messenger', 'instagram']
        .filter((t) => !connectedTypes.includes(t))
        .map((type) => {
          const info = CHANNEL_INFO[type];
          const isOpen = showSetup === type;

          return (
            <div key={type} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <button
                onClick={() => setShowSetup(isOpen ? null : type)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{info.icon}</span>
                  <div className="text-left">
                    <p className="font-medium text-gray-900">Conectar {info.name}</p>
                    <p className="text-xs text-gray-400">Recibe pedidos por {info.name}</p>
                  </div>
                </div>
                <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-5 space-y-4">
                  {type === 'whatsapp' && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
                      <p className="text-xs text-blue-700 font-medium mb-1">Requisitos:</p>
                      <ul className="text-xs text-blue-600 space-y-0.5 list-disc list-inside">
                        <li>Cuenta de Meta Business verificada</li>
                        <li>App creada en developers.facebook.com</li>
                        <li>WhatsApp Business API habilitada</li>
                        <li>Phone Number ID y Access Token permanente</li>
                      </ul>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {type === 'whatsapp' ? 'Phone Number ID' : 'Page ID'}
                    </label>
                    <input
                      value={externalId}
                      onChange={(e) => setExternalId(e.target.value)}
                      placeholder={type === 'whatsapp' ? '123456789012345' : 'ID de tu página'}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                    <input
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="EAABx..."
                      type="password"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Obtén un token permanente en Meta Business → System Users
                    </p>
                  </div>

                  <button
                    onClick={() => handleConnect(type)}
                    disabled={saving || !externalId || !accessToken}
                    className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {saving ? 'Conectando...' : `Conectar ${info.name}`}
                  </button>

                  {/* Instrucciones post-conexión */}
                  {setupResult && setupResult.channel?.type === type && (
                    <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
                      <p className="text-sm font-medium text-green-800 mb-2">✅ Canal conectado. Configura el webhook:</p>
                      <div className="space-y-1 text-xs text-green-700 font-mono">
                        <p>Webhook URL: <span className="select-all">{setupResult.webhookUrl}</span></p>
                        <p>Verify Token: <span className="select-all">{setupResult.verifyToken}</span></p>
                      </div>
                      <ol className="mt-3 space-y-1 text-xs text-green-700 list-decimal list-inside">
                        {setupResult.setupInstructions?.steps?.map((step: string, i: number) => (
                          <li key={i}>{step.replace(/^\d+\.\s*/, '')}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
