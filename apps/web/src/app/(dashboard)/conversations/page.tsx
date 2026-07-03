'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { AudioRecorder } from '@/components/audio-recorder';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Tab = 'clientes' | 'repartidores';

export default function ConversationsPage() {
  const [tab, setTab] = useState<Tab>('clientes');
  const { data: conversations, loading, refetch: refetchConversations } = useApi<any[]>('/conversations');
  const [driverMessages, setDriverMessages] = useState<any[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const listPollRef = useRef<NodeJS.Timeout | null>(null);

  const selectedConv = conversations?.find((c: any) => c.id === selectedId);

  // POLLING: Refresh conversation list every 5 seconds
  useEffect(() => {
    listPollRef.current = setInterval(() => {
      if (tab === 'clientes') {
        refetchConversations();
      } else {
        loadDriverMessages();
      }
    }, 5000);
    return () => { if (listPollRef.current) clearInterval(listPollRef.current); };
  }, [tab]);

  // POLLING: Refresh messages every 3 seconds when a conversation is selected
  useEffect(() => {
    if (!selectedId || tab !== 'clientes') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const fetchMessages = () => {
      api.get<any[]>(`/conversations/${selectedId}/messages?limit=100`)
        .then((newMsgs) => {
          if (newMsgs && newMsgs.length !== messages.length) {
            setMessages(newMsgs);
          }
        })
        .catch(() => {});
    };

    pollRef.current = setInterval(fetchMessages, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedId, tab, messages.length]);

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedId) return;
    setLoadingMessages(true);
    api.get<any[]>(`/conversations/${selectedId}/messages?limit=100`)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false));
  }, [selectedId]);

  // Load driver messages
  const loadDriverMessages = useCallback(async () => {
    setLoadingDrivers(true);
    try {
      const data = await api.get<any[]>('/delivery/messages');
      setDriverMessages(data ?? []);
    } catch { setDriverMessages([]); }
    finally { setLoadingDrivers(false); }
  }, []);

  useEffect(() => {
    if (tab === 'repartidores') loadDriverMessages();
  }, [tab]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-select first conversation
  useEffect(() => {
    if (conversations?.length && !selectedId) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedId) return;
    setSending(true);
    try {
      await api.post(`/conversations/${selectedId}/reply`, { text: replyText });
      // Add to local messages immediately
      setMessages([...messages, {
        id: `temp-${Date.now()}`,
        direction: 'outbound',
        type: 'text',
        content: replyText,
        createdAt: new Date().toISOString(),
        isManual: true,
      }]);
      setReplyText('');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-3">
      {/* Tabs: Clientes / Repartidores */}
      <div className="flex gap-1 rounded-lg bg-gray-800 p-1 w-fit">
        <button
          onClick={() => setTab('clientes')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'clientes' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          💬 Clientes
        </button>
        <button
          onClick={() => setTab('repartidores')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'repartidores' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          🛵 Repartidores
        </button>
      </div>

      {/* Driver Messages Tab */}
      {tab === 'repartidores' && (
        <div className="flex-1 rounded-xl border border-card-border bg-card overflow-hidden flex flex-col">
          <div className="border-b border-gray-700 px-5 py-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Mensajes con Repartidores</h2>
              <p className="text-xs text-gray-500">Historial de comunicación de entregas</p>
            </div>
            <span className="text-xs text-gray-500">Auto-refresh cada 5s</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loadingDrivers && driverMessages.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-8">Cargando...</p>
            ) : driverMessages.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-8">Sin mensajes de repartidores aún</p>
            ) : (
              driverMessages.map((msg: any, i: number) => (
                <div key={msg.id ?? i} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                    msg.direction === 'outbound'
                      ? 'bg-accent/20 border border-accent/30 rounded-br-md'
                      : 'bg-gray-800 border border-gray-700 rounded-bl-md'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-yellow-300">{msg.driverName ?? 'Repartidor'}</span>
                      <span className="text-xs text-gray-500">#{msg.orderNumber ?? ''}</span>
                    </div>
                    <p className="text-sm text-white whitespace-pre-wrap">{msg.content}</p>
                    <span className="text-xs text-gray-500 mt-1 block">
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Clients Conversations Tab */}
      {tab === 'clientes' && (
      <div className="flex flex-1 gap-4 min-h-0">
      {/* Conversation list */}
      <div className="w-80 flex-shrink-0 rounded-xl border border-card-border bg-card overflow-hidden flex flex-col">
        <div className="border-b border-gray-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Conversaciones</h2>
          <p className="text-xs text-gray-500">{conversations?.length ?? 0} activas</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-gray-500 text-center">Cargando...</p>
          ) : conversations?.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 text-center">Sin conversaciones aún</p>
          ) : (
            conversations?.map((conv: any) => (
              <div
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`px-4 py-3 cursor-pointer border-b border-gray-800 transition-colors ${
                  selectedId === conv.id ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white truncate">{conv.customerName ?? 'Sin nombre'}</p>
                  <span className="text-xs text-gray-500">
                    {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-400 truncate">{conv.lastMessage ?? 'Nueva conversación'}</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${
                  conv.channelType === 'whatsapp' ? 'bg-green-900/40 text-green-300' :
                  conv.channelType === 'messenger' ? 'bg-blue-900/40 text-blue-300' :
                  'bg-pink-900/40 text-pink-300'
                }`}>
                  {conv.channelType ?? 'whatsapp'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 rounded-xl border border-card-border bg-card overflow-hidden flex flex-col">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <p>Selecciona una conversación</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between border-b border-gray-700 px-5 py-3">
              <div>
                <p className="font-medium text-white">{selectedConv?.customerName ?? 'Cliente'}</p>
                <p className="text-xs text-gray-400">{selectedConv?.channelType ?? 'whatsapp'} · {selectedConv?.customerPhone ?? ''}</p>
              </div>
              <div className="flex gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  selectedConv?.status === 'active' ? 'bg-green-900/40 text-green-300' : 'bg-gray-700 text-gray-400'
                }`}>
                  {selectedConv?.status === 'active' ? '🟢 Activa' : 'Resuelta'}
                </span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingMessages ? (
                <p className="text-center text-gray-500 text-sm">Cargando mensajes...</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-gray-500 text-sm">Sin mensajes</p>
              ) : (
                messages.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      msg.direction === 'outbound'
                        ? 'bg-accent/20 border border-accent/30 rounded-br-md'
                        : 'bg-gray-800 border border-gray-700 rounded-bl-md'
                    }`}>
                      {msg.type === 'image' && msg.mediaUrl && (
                        <div className="mb-2">
                          <span className="text-xs text-gray-400">📷 Imagen adjunta</span>
                        </div>
                      )}
                      {msg.type === 'audio' && (
                        <div className="mb-1">
                          <span className="text-xs text-gray-400">🎤 Audio transcrito:</span>
                        </div>
                      )}
                      <p className="text-sm text-white whitespace-pre-wrap">{msg.content ?? '[Sin contenido]'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {new Date(msg.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.direction === 'outbound' && (
                          <span className="text-xs text-accent">
                            {msg.isManual ? '👤 Manual' : '🤖 IA'}
                          </span>
                        )}
                      </div>
                      {/* Rating buttons for AI outbound messages */}
                      {msg.direction === 'outbound' && !msg.isManual && (
                        <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-gray-700/50">
                          {msg.rating === 'up' ? (
                            <span className="text-xs text-green-400">👍 Correcta</span>
                          ) : msg.rating === 'down' ? (
                            <span className="text-xs text-red-400">👎 Corregida</span>
                          ) : (
                            <>
                              <button
                                onClick={async () => {
                                  await api.patch(`/conversations/messages/${msg.id}/rate`, { rating: 'up' });
                                  setMessages(messages.map((m: any) => m.id === msg.id ? { ...m, rating: 'up' } : m));
                                }}
                                className="text-xs text-gray-500 hover:text-green-400 transition-colors px-1"
                                title="Respuesta correcta"
                              >👍</button>
                              <button
                                onClick={() => setCorrecting(msg.id)}
                                className="text-xs text-gray-500 hover:text-red-400 transition-colors px-1"
                                title="Respuesta incorrecta — corregir"
                              >👎</button>
                            </>
                          )}
                        </div>
                      )}
                      {/* Correction form */}
                      {correcting === msg.id && (
                        <div className="mt-2 pt-2 border-t border-gray-700/50 space-y-2">
                          <p className="text-xs text-red-300">¿Qué debió responder?</p>
                          <textarea
                            value={correctionText}
                            onChange={(e) => setCorrectionText(e.target.value)}
                            placeholder="Escribe la respuesta correcta..."
                            rows={2}
                            className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-1.5 text-xs text-white resize-none focus:outline-none focus:ring-1 focus:ring-red-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                if (!correctionText.trim()) return;
                                await api.post(`/conversations/messages/${msg.id}/correct`, { correction: correctionText });
                                setMessages(messages.map((m: any) => m.id === msg.id ? { ...m, rating: 'down', correction: correctionText } : m));
                                setCorrecting(null);
                                setCorrectionText('');
                              }}
                              className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700"
                            >Guardar corrección</button>
                            <button
                              onClick={() => { setCorrecting(null); setCorrectionText(''); }}
                              className="text-xs text-gray-400 px-2"
                            >Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            <div className="border-t border-gray-700 px-4 py-3">
              <div className="flex items-end gap-2">
                {/* File upload */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !selectedId) return;
                    setUploadingFile(true);
                    try {
                      const token = localStorage.getItem('vspro_token');
                      const tenantSlug = localStorage.getItem('vspro_tenant_slug');
                      const formData = new FormData();
                      formData.append('file', file);
                      const res = await fetch(`${API_URL}/conversations/${selectedId}/send-media`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'x-tenant-slug': tenantSlug ?? '',
                        },
                        body: formData,
                      });
                      const result = await res.json();
                      if (result.success) {
                        setMessages([...messages, {
                          id: `temp-${Date.now()}`,
                          direction: 'outbound',
                          type: file.type.startsWith('image/') ? 'image' : 'document',
                          content: `[📎 ${file.name}]`,
                          createdAt: new Date().toISOString(),
                          isManual: true,
                        }]);
                      } else {
                        alert(`Error: ${result.error}`);
                      }
                    } catch (err: any) {
                      alert(`Error: ${err.message}`);
                    } finally {
                      setUploadingFile(false);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile || sending}
                  className="px-3 py-2.5 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50"
                  title="Enviar archivo (imagen, PDF)"
                >
                  {uploadingFile ? '⏳' : '📎'}
                </button>

                {/* Audio recorder */}
                <AudioRecorder
                  disabled={sending || uploadingFile}
                  onRecorded={async (blob) => {
                    if (!selectedId) return;
                    setUploadingFile(true);
                    try {
                      const token = localStorage.getItem('vspro_token');
                      const tenantSlug = localStorage.getItem('vspro_tenant_slug');
                      const formData = new FormData();
                      formData.append('file', blob, 'audio.ogg');
                      const res = await fetch(`${API_URL}/conversations/${selectedId}/send-media`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'x-tenant-slug': tenantSlug ?? '',
                        },
                        body: formData,
                      });
                      const result = await res.json();
                      if (result.success) {
                        setMessages([...messages, {
                          id: `temp-${Date.now()}`,
                          direction: 'outbound',
                          type: 'audio',
                          content: '[🎤 Audio enviado]',
                          createdAt: new Date().toISOString(),
                          isManual: true,
                        }]);
                      } else {
                        alert(`Error: ${result.error}`);
                      }
                    } catch (err: any) {
                      alert(`Error: ${err.message}`);
                    } finally {
                      setUploadingFile(false);
                    }
                  }}
                />

                {/* Text input */}
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Escribe un mensaje..."
                  rows={1}
                  className="flex-1 vspro-input resize-none min-h-[40px] max-h-[120px]"
                  style={{ height: 'auto' }}
                  onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                />
                <button
                  onClick={handleSendReply}
                  disabled={sending || !replyText.trim()}
                  className="vspro-btn-primary px-4 py-2.5 disabled:opacity-50"
                >
                  {sending ? '...' : '📤'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                📎 Archivos · 🎤 Mantener para audio · La IA sigue respondiendo automáticamente
              </p>
            </div>
          </>
        )}
      </div>
    </div>
    )}
    </div>
  );
}
