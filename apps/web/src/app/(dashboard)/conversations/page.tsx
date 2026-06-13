export default function ConversationsPage() {
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Lista de conversaciones */}
      <div className="w-80 flex-shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
        <div className="border-b border-gray-100 px-4 py-3">
          <input
            type="text"
            placeholder="Buscar conversación..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-300"
          />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {/* Conversación activa */}
          <div className="bg-brand-50 px-4 py-3 cursor-pointer">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Maria Lopez</p>
              <span className="text-xs text-gray-400">10:30</span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 truncate">Hola quiero hacer un pedido</p>
            <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">WhatsApp</span>
          </div>

          <div className="px-4 py-3 cursor-pointer hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Carlos Ruiz</p>
              <span className="text-xs text-gray-400">Ayer</span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 truncate">¿Ya está listo mi pedido?</p>
            <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">Messenger</span>
          </div>

          <div className="px-4 py-3 cursor-pointer hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Ana Martinez</p>
              <span className="text-xs text-gray-400">Lun</span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 truncate">Gracias, todo perfecto 👍</p>
            <span className="mt-1 inline-block rounded-full bg-pink-100 px-2 py-0.5 text-xs text-pink-700">Instagram</span>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
        {/* Header del chat */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <p className="font-medium text-gray-900">Maria Lopez</p>
            <p className="text-xs text-gray-500">WhatsApp · +52 155 1234 5678</p>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              Ver pedidos
            </button>
            <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              Resolver ✓
            </button>
          </div>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Mensaje del cliente */}
          <div className="flex justify-start">
            <div className="max-w-xs rounded-2xl rounded-bl-md bg-gray-100 px-4 py-2.5">
              <p className="text-sm text-gray-800">Hola quiero hacer un pedido</p>
              <p className="mt-1 text-xs text-gray-400">10:30</p>
            </div>
          </div>

          {/* Respuesta de la IA */}
          <div className="flex justify-end">
            <div className="max-w-xs rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5">
              <p className="text-sm text-white">¡Hola Maria! Con gusto te ayudo. ¿Qué te gustaría pedir?</p>
              <p className="mt-1 text-xs text-brand-200">10:30 · IA</p>
            </div>
          </div>
        </div>

        {/* Input (solo lectura — la IA responde automáticamente) */}
        <div className="border-t border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-2.5 text-sm text-gray-400">
            🤖 La IA responde automáticamente · Puedes intervenir manualmente si es necesario
          </div>
        </div>
      </div>
    </div>
  );
}
