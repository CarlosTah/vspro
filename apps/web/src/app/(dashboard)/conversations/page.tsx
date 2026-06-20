'use client';

import { useState, useEffect, useRef } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

export default function ConversationsPage() {
  const { data: conversations, loading } = useApi<any[]>('/conversations');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConv = conversations?.find((c: any) => c.id === selectedId);

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedId) return;
    setLoadingMessages(true);
    api.get<any[]>(`/conversations/${selectedId}/messages`)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false));
  }, [selectedId]);

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
    <div className="flex h-[calc(100vh-8rem)] gap-4">
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
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            <div className="border-t border-gray-700 px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Escribe un mensaje manual... (Enter para enviar)"
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
                💡 La IA responde automáticamente. Tus mensajes manuales se envían directamente al cliente por WhatsApp.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
