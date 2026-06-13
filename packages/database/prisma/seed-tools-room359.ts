/**
 * VSPRO — Registro de herramientas conversacionales para Tenant 'room359'
 * Handler: rental (gestión de reservaciones y disponibilidad)
 *
 * Ejecutar DESPUÉS del seed-room359.ts:
 *   DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' packages/database/prisma/seed-tools-room359.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROOM359_TOOLS = [
  {
    name: 'check_room_availability',
    description: 'Verifica disponibilidad de un departamento/propiedad para las fechas indicadas. Retorna precio calculado según duración (noche/semana/mes).',
    parameters: [
      { name: 'productId', type: 'string', description: 'ID de la propiedad (UUID)', required: true },
      { name: 'checkIn', type: 'string', description: 'Fecha de check-in (YYYY-MM-DD)', required: true },
      { name: 'checkOut', type: 'string', description: 'Fecha de check-out (YYYY-MM-DD)', required: true },
      { name: 'guests', type: 'number', description: 'Número de huéspedes', required: false },
    ],
    handler: 'rental',
    method: 'checkAvailability',
    enabled: true,
  },
  {
    name: 'search_properties',
    description: 'Busca propiedades disponibles por categoría, número de huéspedes, rango de precio o zona. Retorna opciones con tarifas.',
    parameters: [
      { name: 'query', type: 'string', description: 'Texto de búsqueda (zona, tipo, amenidad)', required: false },
      { name: 'guests', type: 'number', description: 'Número de huéspedes', required: false },
      { name: 'maxPricePerNight', type: 'number', description: 'Precio máximo por noche en MXN', required: false },
      { name: 'category', type: 'string', description: 'Categoría: Studios, 1 Recámara, 2 Recámaras, Penthouses, Lofts, Casas', required: false },
      { name: 'checkIn', type: 'string', description: 'Fecha de check-in para filtrar disponibilidad (YYYY-MM-DD)', required: false },
      { name: 'checkOut', type: 'string', description: 'Fecha de check-out para filtrar disponibilidad (YYYY-MM-DD)', required: false },
    ],
    handler: 'rental',
    method: 'searchProperties',
    enabled: true,
  },
  {
    name: 'get_property_rates',
    description: 'Obtiene la matriz completa de tarifas de una propiedad: precio por noche, semana, mes, limpieza, huésped extra y amenidades.',
    parameters: [
      { name: 'productId', type: 'string', description: 'ID de la propiedad (UUID)', required: true },
    ],
    handler: 'rental',
    method: 'getPropertyRates',
    enabled: true,
  },
  {
    name: 'get_availability_calendar',
    description: 'Obtiene el calendario de disponibilidad de una propiedad para los próximos 60 días.',
    parameters: [
      { name: 'productId', type: 'string', description: 'ID de la propiedad (UUID)', required: true },
    ],
    handler: 'rental',
    method: 'getCalendar',
    enabled: true,
  },
  {
    name: 'create_reservation',
    description: 'Crea una reservación para un departamento. Bloquea las fechas en el calendario y genera el pedido con el monto calculado.',
    parameters: [
      { name: 'productId', type: 'string', description: 'ID de la propiedad', required: true },
      { name: 'checkIn', type: 'string', description: 'Fecha de check-in (YYYY-MM-DD)', required: true },
      { name: 'checkOut', type: 'string', description: 'Fecha de check-out (YYYY-MM-DD)', required: true },
      { name: 'guests', type: 'number', description: 'Número de huéspedes', required: true },
      { name: 'notes', type: 'string', description: 'Notas especiales (hora de llegada, mascotas, etc.)', required: false },
    ],
    handler: 'rental',
    method: 'createReservation',
    enabled: true,
  },
  {
    name: 'calculate_stay_price',
    description: 'Calcula el precio total de una estancia según duración. Aplica tarifa por noche, semana o mes automáticamente.',
    parameters: [
      { name: 'productId', type: 'string', description: 'ID de la propiedad', required: true },
      { name: 'checkIn', type: 'string', description: 'Fecha de check-in (YYYY-MM-DD)', required: true },
      { name: 'checkOut', type: 'string', description: 'Fecha de check-out (YYYY-MM-DD)', required: true },
      { name: 'guests', type: 'number', description: 'Número de huéspedes (para calcular cargo extra si excede máximo base)', required: false },
    ],
    handler: 'rental',
    method: 'calculateStayPrice',
    enabled: true,
  },
  {
    name: 'get_checkin_instructions',
    description: 'Proporciona las instrucciones de check-in para una reservación confirmada (dirección, acceso, WiFi, reglas).',
    parameters: [
      { name: 'orderNumber', type: 'string', description: 'Número de reservación (ej: RES-359-0001)', required: true },
    ],
    handler: 'rental',
    method: 'getCheckinInstructions',
    enabled: true,
  },
  {
    name: 'request_early_checkin',
    description: 'Solicita un check-in anticipado o check-out tardío para una reservación existente.',
    parameters: [
      { name: 'orderNumber', type: 'string', description: 'Número de reservación', required: true },
      { name: 'type', type: 'string', description: 'Tipo: early_checkin o late_checkout', required: true },
      { name: 'requestedTime', type: 'string', description: 'Hora solicitada (HH:MM)', required: true },
    ],
    handler: 'rental',
    method: 'requestScheduleChange',
    enabled: true,
  },
];

async function main() {
  console.log('🔧 Registrando herramientas de IA para ROOM 359...\n');

  const schemaName = 'tenant_room359';

  // Verificar que el schema existe
  const exists = await prisma.$queryRawUnsafe<any[]>(`
    SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1
  `, schemaName);

  if (!exists[0]) {
    console.error('❌ Schema tenant_room359 no existe. Ejecuta seed-room359.ts primero.');
    process.exit(1);
  }

  // Asegurar que la columna custom_tools existe
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "${schemaName}".ai_config
    ADD COLUMN IF NOT EXISTS custom_tools JSONB DEFAULT '[]'
  `);

  // Guardar herramientas
  await prisma.$executeRawUnsafe(`
    UPDATE "${schemaName}".ai_config
    SET custom_tools = $1::jsonb
    WHERE id = (SELECT id FROM "${schemaName}".ai_config LIMIT 1)
  `, JSON.stringify(ROOM359_TOOLS));

  console.log(`✅ ${ROOM359_TOOLS.length} herramientas registradas para room359:`);
  for (const tool of ROOM359_TOOLS) {
    console.log(`   • ${tool.name} (handler: ${tool.handler}.${tool.method})`);
  }
  console.log('\n🎉 Herramientas de room359 activadas correctamente.\n');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
