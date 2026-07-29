export const features = [
  {
    id: 1,
    emoji: '🤖',
    title: 'Asistente de IA Personalizado',
    description:
      'Un empleado virtual que atiende 24/7 con la personalidad de tu negocio. Responde en <5 segundos.',
    detail:
      'Nombre y tono configurables • Horario con mensajes automáticos • Múltiples idiomas • Instrucciones custom',
    example:
      'Vikids tiene a "Viki" 🎀 que cierra ventas. Room 359 tiene a "Luna" que cotiza y reserva.',
  },
  {
    id: 2,
    emoji: '🛒',
    title: 'Catálogo de Productos',
    description:
      'Tu menú/inventario completo en WhatsApp con fotos, variantes, SKU automático y búsqueda inteligente.',
    detail: 'Fotos • Variantes talla/color • SKU automático • Categorías • Búsqueda inteligente',
    example:
      'Vikids: 11 productos, 52 variantes. Cliente dice "vestido rosa" → 3 resultados al instante.',
  },
  {
    id: 3,
    emoji: '📷',
    title: 'Alta por Foto (Menu Vision)',
    description:
      'Manda foto de tu menú/pizarrón → la IA lee todo y da de alta los productos automáticamente.',
    detail: 'OCR con GPT-4o Vision • Revisión antes de aprobar • Alta masiva de un clic',
    example:
      'Tortillería envía foto del pizarrón → IA extrae: "Pozole rojo $85", "Tamales (3pz) $60"',
  },
  {
    id: 4,
    emoji: '📦',
    title: 'Gestión de Pedidos',
    description: 'Control total del ciclo de vida: desde que el cliente pide hasta que se entrega.',
    detail:
      'Flujo: new → payment_verified → in_production → ready → shipped → delivered • Carrito conversacional',
    example: 'Viki: "🛒 Tu carrito: 2x Vestido Floral ($778). ¿Confirmas?"',
  },
  {
    id: 5,
    emoji: '💳',
    title: 'Pagos y Verificación',
    description:
      'Cliente paga por transferencia, manda foto del comprobante y la IA lo verifica en segundos.',
    detail:
      'OCR de comprobante • Verificación automática o manual • Stripe, MercadoPago, SPEI, efectivo',
    example: '"📷 Comprobante recibido para VK-2026-00005 ($557). Verificando..."',
  },
  {
    id: 6,
    emoji: '📢',
    title: 'Notificaciones al Cliente',
    description: 'WhatsApp automático cada vez que el pedido avanza. Sin intervención manual.',
    detail: 'Pago confirmado → En preparación → Listo → Enviado → Entregado → Cancelado',
    example: '"✅ Pago confirmado, tu pedido está en preparación 👨‍🍳" → WhatsApp al instante.',
  },
  {
    id: 7,
    emoji: '🍳',
    title: 'Kitchen Display System',
    description:
      'Pantalla en tu cocina con pedidos en cola, botones para avanzarlos y tickets imprimibles.',
    detail:
      'Cola real-time • Botones Empezar/Listo • Tickets térmicos • Timer por pedido • WebSocket',
    example: 'Tortillería: 2 pendientes, 1 cocinando. Timer: "23 min" visible al cocinero.',
  },
  {
    id: 8,
    emoji: '🛵',
    title: 'Delivery y Repartidores',
    description:
      'Gestiona motorepartidores por WhatsApp. Asigna pedidos y trackea entregas automáticamente.',
    detail:
      'Asignación al menos ocupado • Acepta/Rechaza por WhatsApp • Tracking: offered → delivered',
    example: 'Pedro dice NO → Juan Moto recibe la oferta al instante.',
  },
  {
    id: 9,
    emoji: '🎤',
    title: 'Audios de Voz (Whisper)',
    description:
      'Clientes y dueños pueden mandar audios de WhatsApp — la IA los entiende perfectamente.',
    detail:
      'Transcripción automática • Detecta pedidos, comandos, broadcasts • Español mexicano optimizado',
    example: '"Quiero 3 tacos de pastor y 2 aguas" → se crea el pedido automáticamente.',
  },
  {
    id: 10,
    emoji: '🔔',
    title: 'Alertas al Staff',
    description:
      'Tu equipo recibe alertas por WhatsApp: nuevos pedidos, pagos, stock bajo, escalaciones.',
    detail:
      'Configurable por empleado • Admin: todo • Operador: solo pedidos nuevos • Escalación de IA',
    example: '"🚨 Cliente necesita atención humana: reclamo por talla incorrecta"',
  },
  {
    id: 11,
    emoji: '🔄',
    title: 'Devoluciones y Cambios',
    description:
      'El cliente escribe "quiero cambiar mi talla" → la IA maneja todo el flujo automáticamente.',
    detail:
      'Validación automática (30 días, stock, estado) • Reembolso, cambio, crédito • Registro contable',
    example: '"Talla 6 Rosa disponible (7 en stock) ✓" → flujo completo sin intervención.',
  },
  {
    id: 12,
    emoji: '📅',
    title: 'Recordatorios Recurrentes',
    description:
      'Recordatorios automáticos por WhatsApp: cambio de aceite, vacunas, revisiones periódicas.',
    detail: 'Auto-calcula fecha de vencimiento • Envía 3 días antes • Marca completado y recalcula',
    example: '"⏰ Tu Jetta GLI necesita cambio de aceite. ¿Agendamos?"',
  },
  {
    id: 13,
    emoji: '🚗',
    title: 'Registro de Activos',
    description:
      'Registra vehículos, mascotas, equipos o propiedades de tus clientes para servicio personalizado.',
    detail:
      'Vehículos, mascotas, equipos, propiedades • Historial de servicios • Vinculado a recordatorios',
    example: 'Jetta GLI 2020 + historial completo: "Cambio aceite 2026-01-15, Balatas 2025-08-20"',
  },
  {
    id: 14,
    emoji: '🔧',
    title: 'Tickets de Mantenimiento',
    description:
      'Inquilinos reportan fallas con foto/video y tú asignas al técnico correcto automáticamente.',
    detail: 'Fotos/video • Prioridad automática • WhatsApp al técnico • Cotización y autorización',
    example: 'TKT-MQELCE2X, priority: HIGH, plumbing → Plomero recibe WhatsApp al instante.',
  },
  {
    id: 15,
    emoji: '🔍',
    title: 'Diagnóstico por Foto (Vision)',
    description:
      'Cliente manda foto de un problema → la IA diagnostica y da precio estimado automáticamente.',
    detail: 'GPT-4o Vision • Severidad: low/medium/high/urgent • Consulta tabulador del negocio',
    example: 'Foto de balata desgastada → "Balatas al 10%, cambio urgente. Rango: $800-$1,200 MXN"',
  },
  {
    id: 16,
    emoji: '🚨',
    title: 'Detección de Urgencias',
    description:
      'Si un paciente/mascota reporta síntomas graves, alerta al doctor/vet al instante.',
    detail: 'CRITICAL: sangre, convulsión → alerta inmediata • HIGH: fiebre alta → cita urgente',
    example: '"Mi perro está vomitando sangre" → 🚨 WhatsApp al veterinario en segundos.',
  },
  {
    id: 17,
    emoji: '👗',
    title: 'Colecciones y Lookbooks',
    description:
      'Agrupa productos en combos con descuento. Cross-sell automático cuando compran uno.',
    detail:
      'Outfits, combos de comida, paquetes de servicios • Descuento configurable • Cross-sell IA',
    example: '"Outfit Primavera 🌸": Vestido + Leggings + Diadema = 15% off.',
  },
  {
    id: 18,
    emoji: '📊',
    title: 'Reportes y Analytics',
    description:
      'Sabes exactamente cómo va tu negocio: revenue, pedidos, clientes, pagado vs pendiente.',
    detail:
      'Revenue total • Ticket promedio • Pagado vs pendiente • Nuevos vs recurrentes • Uso del plan',
    example: 'Vikids: Revenue $6,075 / 8 pedidos / Ticket promedio $759.',
  },
  {
    id: 19,
    emoji: '💌',
    title: 'Campañas Win-Back',
    description:
      'Recupera clientes inactivos automáticamente con mensajes personalizados y A/B testing.',
    detail:
      'Triggers configurables • A/B testing de mensajes • Métricas completas • Anti-spam (max 3/mes)',
    example: '45 enviados, 12 abiertos, 3 compraron = $2,100 recuperado.',
  },
  {
    id: 20,
    emoji: '📅',
    title: 'Agendamiento Inteligente',
    description:
      'Clientes agendan citas por WhatsApp sincronizadas con Google Calendar. Anti doble-reserva.',
    detail: 'Google Calendar 2-way • Recordatorio 24h y 1h antes • Cancela/reagenda por chat',
    example: '"Quiero cita el martes a las 10" → agenda en Calendar + recordatorio automático.',
  },
  {
    id: 21,
    emoji: '🧠',
    title: 'Orquestador Multi-Agente',
    description:
      'Supervisor IA que coordina agentes especializados: ventas, inventario, finanzas, infra.',
    detail:
      'Lead Manager • IT Infrastructure • Real Estate Analytics • Sales Agent • Inventory Agent',
    example: '"✅ PostgreSQL 2ms, Memoria 45%, 5 tenants activos, Uptime 26h"',
  },
];

export const plans = [
  {
    name: 'Básico',
    price: '$49',
    period: '/mes',
    description: 'Para negocios que empiezan',
    color: 'from-slate-700 to-slate-600',
    badge: null,
    features: [
      '200 pedidos/mes',
      '50 productos',
      '2 usuarios',
      'WhatsApp + Messenger + Instagram',
      'Asistente IA incluido',
      'OCR de pagos',
      'Trial 14 días gratis',
    ],
    missing: ['Reportes avanzados', 'Marca blanca'],
  },
  {
    name: 'Profesional',
    price: '$149',
    period: '/mes',
    description: 'Para negocios en crecimiento',
    color: 'from-violet-600 to-purple-700',
    badge: 'Más popular',
    features: [
      '1,000 pedidos/mes',
      '500 productos',
      '5 usuarios',
      'WhatsApp + Messenger + Instagram',
      'Asistente IA incluido',
      'OCR de pagos',
      'Reportes avanzados',
      'Trial 14 días gratis',
    ],
    missing: ['Marca blanca'],
  },
  {
    name: 'Empresarial',
    price: '$399',
    period: '/mes',
    description: 'Para empresas con alto volumen',
    color: 'from-emerald-600 to-teal-700',
    badge: 'Todo incluido',
    features: [
      'Pedidos ilimitados',
      'Productos ilimitados',
      '20 usuarios',
      'WhatsApp + Messenger + Instagram',
      'Asistente IA incluido',
      'OCR de pagos',
      'Reportes avanzados',
      'Marca blanca',
      'Trial 14 días gratis',
    ],
    missing: [],
  },
];

export const clients = [
  {
    name: 'Vikids',
    category: 'Ropa Infantil 👗',
    assistant: 'Viki 🎀',
    color: 'from-pink-500/20 to-purple-500/20',
    border: 'border-pink-500/30',
    stats: [
      { label: 'Productos', value: '11' },
      { label: 'Variantes', value: '52' },
      { label: 'Pedidos', value: '8' },
      { label: 'Revenue', value: '$6,075' },
    ],
    description: 'Asistente Viki sugiere outfits y cierra ventas automáticamente por WhatsApp.',
  },
  {
    name: 'Room 359',
    category: 'Rentas CDMX 🏠',
    assistant: 'Luna 🌙',
    color: 'from-blue-500/20 to-cyan-500/20',
    border: 'border-blue-500/30',
    stats: [
      { label: 'Propiedades', value: '6' },
      { label: 'Tarifas', value: '$1,200-$5,500' },
      { label: 'Reservas', value: '6' },
      { label: 'Tickets', value: '1 activo' },
    ],
    description:
      'Luna cotiza, reserva y gestiona tickets de mantenimiento sin intervención humana.',
  },
  {
    name: 'Tortillería La Abuela',
    category: 'Comida 🌮',
    assistant: 'Lupita 🫔',
    color: 'from-orange-500/20 to-amber-500/20',
    border: 'border-orange-500/30',
    stats: [
      { label: 'Productos', value: '13' },
      { label: 'Pedidos', value: '20' },
      { label: 'Repartidores', value: '2' },
      { label: 'Entregas', value: '2 completadas' },
    ],
    description: 'Lupita toma pedidos por voz, maneja delivery y gestiona el KDS de cocina.',
  },
  {
    name: 'Panadería El Trigal',
    category: 'Alimentos 🥐',
    assistant: 'Pancho 🍞',
    color: 'from-yellow-500/20 to-amber-600/20',
    border: 'border-yellow-500/30',
    stats: [
      { label: 'Productos', value: '7' },
      { label: 'Clientes', value: '6' },
      { label: 'Mascotas reg.', value: '1' },
      { label: 'Recordatorios', value: '1 activo' },
    ],
    description:
      'Pancho vende pan y gestiona recordatorios de servicios para mascotas de clientes.',
  },
];

export const verticals = [
  { icon: '🍽️', label: 'Restaurantes' },
  { icon: '👗', label: 'Ropa y Moda' },
  { icon: '🔧', label: 'Talleres' },
  { icon: '🏠', label: 'Inmobiliaria' },
  { icon: '🐾', label: 'Clínicas/Vets' },
  { icon: '🛠️', label: 'Servicios a Domicilio' },
  { icon: '💄', label: 'Salones de Belleza' },
  { icon: '📦', label: 'E-commerce' },
];

export const stats = [
  { value: '21', label: 'Módulos funcionales' },
  { value: '8', label: 'Agentes IA especializados' },
  { value: '120+', label: 'Endpoints REST' },
  { value: '6', label: 'Verticales de negocio' },
];
