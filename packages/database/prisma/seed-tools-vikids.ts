/**
 * VSPRO — Registro de herramientas conversacionales para Tenant 'vikids'
 * Handler: logistics (envíos de ropa)
 *
 * Ejecutar DESPUÉS del seed-vikids.ts:
 *   DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' packages/database/prisma/seed-tools-vikids.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VIKIDS_TOOLS = [
  {
    name: 'search_clothing',
    description: 'Busca ropa infantil de niña por categoría, talla, color o nombre. Retorna productos disponibles con precios y variantes.',
    parameters: [
      { name: 'query', type: 'string', description: 'Texto de búsqueda (nombre, categoría, color)', required: true },
      { name: 'talla', type: 'string', description: 'Talla específica (2, 4, 6, 8, 10, 22, 24, 26, Única)', required: false },
      { name: 'color', type: 'string', description: 'Color preferido', required: false },
      { name: 'category', type: 'string', description: 'Categoría: Vestidos, Conjuntos, Pantalones, Playeras, Chamarras, Faldas, Pijamas, Calzado, Accesorios', required: false },
    ],
    handler: 'products',
    method: 'search',
    enabled: true,
  },
  {
    name: 'check_variant_stock',
    description: 'Verifica el stock disponible de una variante específica (talla + color) de un producto.',
    parameters: [
      { name: 'productName', type: 'string', description: 'Nombre del producto', required: true },
      { name: 'talla', type: 'string', description: 'Talla deseada', required: true },
      { name: 'color', type: 'string', description: 'Color deseado', required: false },
    ],
    handler: 'products',
    method: 'checkVariantStock',
    enabled: true,
  },
  {
    name: 'suggest_outfit',
    description: 'Sugiere un outfit completo (combinación de prendas) basado en la ocasión y talla de la niña.',
    parameters: [
      { name: 'occasion', type: 'string', description: 'Ocasión: fiesta, casual, escuela, playa, invierno', required: true },
      { name: 'talla', type: 'string', description: 'Talla de la niña', required: true },
      { name: 'budget', type: 'number', description: 'Presupuesto máximo en MXN (opcional)', required: false },
    ],
    handler: 'products',
    method: 'suggestOutfit',
    enabled: true,
  },
  {
    name: 'calculate_shipping_vikids',
    description: 'Calcula el costo y tiempo de envío para un pedido de ropa. Envío gratis en compras mayores a $800 MXN.',
    parameters: [
      { name: 'zipCode', type: 'string', description: 'Código postal de destino', required: true },
      { name: 'orderTotal', type: 'number', description: 'Total del pedido en MXN', required: true },
      { name: 'serviceType', type: 'string', description: 'Tipo: standard, express, same_day', required: false },
    ],
    handler: 'logistics',
    method: 'calculateShipping',
    enabled: true,
  },
  {
    name: 'track_vikids_order',
    description: 'Rastrea el estado de un envío de Vikids por número de pedido.',
    parameters: [
      { name: 'orderNumber', type: 'string', description: 'Número de pedido (ej: VK-2026-00001)', required: true },
    ],
    handler: 'logistics',
    method: 'trackOrder',
    enabled: true,
  },
  {
    name: 'create_clothing_order',
    description: 'Crea un pedido de ropa cuando la clienta confirma los artículos. Incluye variante (talla/color).',
    parameters: [
      { name: 'items', type: 'array', description: 'Lista de artículos: [{productName, talla, color, quantity}]', required: true },
      { name: 'notes', type: 'string', description: 'Notas especiales (regalo, empaque especial, etc.)', required: false },
    ],
    handler: 'orders',
    method: 'create',
    enabled: true,
  },
  {
    name: 'check_return_policy',
    description: 'Informa sobre la política de devoluciones y cambios de talla de Vikids.',
    parameters: [
      { name: 'reason', type: 'string', description: 'Razón: cambio_talla, defecto, no_gusto', required: true },
      { name: 'daysSincePurchase', type: 'number', description: 'Días desde la compra', required: false },
    ],
    handler: 'logistics',
    method: 'checkReturnPolicy',
    enabled: true,
  },
];

async function main() {
  console.log('🔧 Registrando herramientas de IA para VIKIDS...\n');

  const schemaName = 'tenant_vikids';

  // Verificar que el schema existe
  const exists = await prisma.$queryRawUnsafe<any[]>(`
    SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1
  `, schemaName);

  if (!exists[0]) {
    console.error('❌ Schema tenant_vikids no existe. Ejecuta seed-vikids.ts primero.');
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
  `, JSON.stringify(VIKIDS_TOOLS));

  console.log(`✅ ${VIKIDS_TOOLS.length} herramientas registradas para vikids:`);
  for (const tool of VIKIDS_TOOLS) {
    console.log(`   • ${tool.name} (handler: ${tool.handler}.${tool.method})`);
  }
  console.log('\n🎉 Herramientas de vikids activadas correctamente.\n');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
