/**
 * VSPRO — Seed para Tenant 'vikids'
 * Catálogo de ropa infantil de niña con fotos estructuradas, tallas y stock.
 *
 * Ejecutar:
 *   DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' packages/database/prisma/seed-vikids.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ─── Catálogo Vikids — Ropa infantil de niña ────────────────────

const PRODUCTS = [
  {
    sku: 'VK-VEST-FLOR-001',
    name: 'Vestido Floral Primavera',
    description: 'Vestido de algodón con estampado floral en tonos rosa y lila. Falda con vuelo y lazo en la espalda.',
    price: 389,
    category: 'Vestidos',
    images: [
      'https://cdn.vikids.mx/productos/vestido-floral-primavera-front.webp',
      'https://cdn.vikids.mx/productos/vestido-floral-primavera-back.webp',
      'https://cdn.vikids.mx/productos/vestido-floral-primavera-detail.webp',
    ],
    variants: [
      { name: 'Talla 2 - Rosa', attributes: { talla: '2', color: 'Rosa' }, stock: 8 },
      { name: 'Talla 4 - Rosa', attributes: { talla: '4', color: 'Rosa' }, stock: 12 },
      { name: 'Talla 6 - Rosa', attributes: { talla: '6', color: 'Rosa' }, stock: 10 },
      { name: 'Talla 8 - Rosa', attributes: { talla: '8', color: 'Rosa' }, stock: 6 },
      { name: 'Talla 4 - Lila', attributes: { talla: '4', color: 'Lila' }, stock: 5 },
      { name: 'Talla 6 - Lila', attributes: { talla: '6', color: 'Lila' }, stock: 7 },
    ],
  },
  {
    sku: 'VK-VEST-TUTU-002',
    name: 'Vestido Tutú Fiesta',
    description: 'Vestido de tul con lentejuelas doradas en el corpiño. Perfecto para fiestas y eventos especiales.',
    price: 549,
    category: 'Vestidos',
    images: [
      'https://cdn.vikids.mx/productos/vestido-tutu-fiesta-front.webp',
      'https://cdn.vikids.mx/productos/vestido-tutu-fiesta-side.webp',
    ],
    variants: [
      { name: 'Talla 2 - Dorado', attributes: { talla: '2', color: 'Dorado' }, stock: 4 },
      { name: 'Talla 4 - Dorado', attributes: { talla: '4', color: 'Dorado' }, stock: 8 },
      { name: 'Talla 6 - Dorado', attributes: { talla: '6', color: 'Dorado' }, stock: 6 },
      { name: 'Talla 8 - Dorado', attributes: { talla: '8', color: 'Dorado' }, stock: 3 },
      { name: 'Talla 4 - Plateado', attributes: { talla: '4', color: 'Plateado' }, stock: 5 },
      { name: 'Talla 6 - Plateado', attributes: { talla: '6', color: 'Plateado' }, stock: 4 },
    ],
  },
  {
    sku: 'VK-CONJ-MARIN-003',
    name: 'Conjunto Marinero',
    description: 'Blusa a rayas azul marino con short blanco de algodón. Incluye cinto decorativo con ancla.',
    price: 429,
    category: 'Conjuntos',
    images: [
      'https://cdn.vikids.mx/productos/conjunto-marinero-front.webp',
      'https://cdn.vikids.mx/productos/conjunto-marinero-flat.webp',
    ],
    variants: [
      { name: 'Talla 2', attributes: { talla: '2', color: 'Azul Marino' }, stock: 6 },
      { name: 'Talla 4', attributes: { talla: '4', color: 'Azul Marino' }, stock: 10 },
      { name: 'Talla 6', attributes: { talla: '6', color: 'Azul Marino' }, stock: 9 },
      { name: 'Talla 8', attributes: { talla: '8', color: 'Azul Marino' }, stock: 5 },
    ],
  },
  {
    sku: 'VK-LEGN-UNIC-004',
    name: 'Leggings Unicornio',
    description: 'Leggings estampados con unicornios y arcoíris. Tela stretch suave con cintura elástica.',
    price: 199,
    category: 'Pantalones',
    images: [
      'https://cdn.vikids.mx/productos/leggings-unicornio-front.webp',
      'https://cdn.vikids.mx/productos/leggings-unicornio-detail.webp',
    ],
    variants: [
      { name: 'Talla 2 - Morado', attributes: { talla: '2', color: 'Morado' }, stock: 15 },
      { name: 'Talla 4 - Morado', attributes: { talla: '4', color: 'Morado' }, stock: 20 },
      { name: 'Talla 6 - Morado', attributes: { talla: '6', color: 'Morado' }, stock: 18 },
      { name: 'Talla 8 - Morado', attributes: { talla: '8', color: 'Morado' }, stock: 12 },
      { name: 'Talla 4 - Rosa', attributes: { talla: '4', color: 'Rosa' }, stock: 14 },
      { name: 'Talla 6 - Rosa', attributes: { talla: '6', color: 'Rosa' }, stock: 11 },
    ],
  },
  {
    sku: 'VK-PLAY-DINO-005',
    name: 'Playera Dinosaurio Glitter',
    description: 'Playera de algodón con estampado de dinosaurio en glitter rosa. Cuello redondo y manga corta.',
    price: 179,
    category: 'Playeras',
    images: [
      'https://cdn.vikids.mx/productos/playera-dino-glitter-front.webp',
    ],
    variants: [
      { name: 'Talla 2 - Blanco', attributes: { talla: '2', color: 'Blanco' }, stock: 20 },
      { name: 'Talla 4 - Blanco', attributes: { talla: '4', color: 'Blanco' }, stock: 25 },
      { name: 'Talla 6 - Blanco', attributes: { talla: '6', color: 'Blanco' }, stock: 22 },
      { name: 'Talla 8 - Blanco', attributes: { talla: '8', color: 'Blanco' }, stock: 15 },
      { name: 'Talla 4 - Rosa', attributes: { talla: '4', color: 'Rosa' }, stock: 18 },
      { name: 'Talla 6 - Rosa', attributes: { talla: '6', color: 'Rosa' }, stock: 16 },
    ],
  },
  {
    sku: 'VK-CHAM-ESTRE-006',
    name: 'Chamarra Estrellas',
    description: 'Chamarra ligera tipo bomber con estampado de estrellas. Cierre frontal y bolsillos laterales.',
    price: 599,
    category: 'Chamarras',
    images: [
      'https://cdn.vikids.mx/productos/chamarra-estrellas-front.webp',
      'https://cdn.vikids.mx/productos/chamarra-estrellas-back.webp',
    ],
    variants: [
      { name: 'Talla 4 - Negro', attributes: { talla: '4', color: 'Negro' }, stock: 6 },
      { name: 'Talla 6 - Negro', attributes: { talla: '6', color: 'Negro' }, stock: 8 },
      { name: 'Talla 8 - Negro', attributes: { talla: '8', color: 'Negro' }, stock: 5 },
      { name: 'Talla 4 - Rosa', attributes: { talla: '4', color: 'Rosa' }, stock: 7 },
      { name: 'Talla 6 - Rosa', attributes: { talla: '6', color: 'Rosa' }, stock: 9 },
      { name: 'Talla 8 - Rosa', attributes: { talla: '8', color: 'Rosa' }, stock: 4 },
    ],
  },
  {
    sku: 'VK-FALDA-JEAN-007',
    name: 'Falda de Mezclilla con Bordado',
    description: 'Falda de mezclilla con bordado de flores en el frente. Cintura ajustable con botón.',
    price: 349,
    category: 'Faldas',
    images: [
      'https://cdn.vikids.mx/productos/falda-mezclilla-bordado-front.webp',
      'https://cdn.vikids.mx/productos/falda-mezclilla-bordado-detail.webp',
    ],
    variants: [
      { name: 'Talla 4 - Azul Claro', attributes: { talla: '4', color: 'Azul Claro' }, stock: 10 },
      { name: 'Talla 6 - Azul Claro', attributes: { talla: '6', color: 'Azul Claro' }, stock: 12 },
      { name: 'Talla 8 - Azul Claro', attributes: { talla: '8', color: 'Azul Claro' }, stock: 8 },
      { name: 'Talla 10 - Azul Claro', attributes: { talla: '10', color: 'Azul Claro' }, stock: 5 },
    ],
  },
  {
    sku: 'VK-PIJA-GATO-008',
    name: 'Pijama Gatitos',
    description: 'Pijama de dos piezas con estampado de gatitos. Tela de algodón franela suave.',
    price: 299,
    category: 'Pijamas',
    images: [
      'https://cdn.vikids.mx/productos/pijama-gatitos-front.webp',
      'https://cdn.vikids.mx/productos/pijama-gatitos-set.webp',
    ],
    variants: [
      { name: 'Talla 2 - Rosa', attributes: { talla: '2', color: 'Rosa' }, stock: 10 },
      { name: 'Talla 4 - Rosa', attributes: { talla: '4', color: 'Rosa' }, stock: 14 },
      { name: 'Talla 6 - Rosa', attributes: { talla: '6', color: 'Rosa' }, stock: 12 },
      { name: 'Talla 8 - Rosa', attributes: { talla: '8', color: 'Rosa' }, stock: 8 },
      { name: 'Talla 4 - Menta', attributes: { talla: '4', color: 'Menta' }, stock: 9 },
      { name: 'Talla 6 - Menta', attributes: { talla: '6', color: 'Menta' }, stock: 7 },
    ],
  },
  {
    sku: 'VK-SAND-BRILL-009',
    name: 'Sandalias Brillantes',
    description: 'Sandalias con tiras de glitter y suela antiderrapante. Cierre de velcro para fácil uso.',
    price: 329,
    category: 'Calzado',
    images: [
      'https://cdn.vikids.mx/productos/sandalias-brillantes-pair.webp',
      'https://cdn.vikids.mx/productos/sandalias-brillantes-side.webp',
    ],
    variants: [
      { name: 'Talla 22 - Plateado', attributes: { talla: '22', color: 'Plateado' }, stock: 6 },
      { name: 'Talla 24 - Plateado', attributes: { talla: '24', color: 'Plateado' }, stock: 8 },
      { name: 'Talla 26 - Plateado', attributes: { talla: '26', color: 'Plateado' }, stock: 7 },
      { name: 'Talla 22 - Rosa Gold', attributes: { talla: '22', color: 'Rosa Gold' }, stock: 5 },
      { name: 'Talla 24 - Rosa Gold', attributes: { talla: '24', color: 'Rosa Gold' }, stock: 9 },
      { name: 'Talla 26 - Rosa Gold', attributes: { talla: '26', color: 'Rosa Gold' }, stock: 6 },
    ],
  },
  {
    sku: 'VK-ACCS-DIADE-010',
    name: 'Set Diademas Mariposa (3 piezas)',
    description: 'Set de 3 diademas con mariposas de tela en colores pastel. Ajuste cómodo para todo el día.',
    price: 149,
    category: 'Accesorios',
    images: [
      'https://cdn.vikids.mx/productos/diademas-mariposa-set.webp',
    ],
    variants: [
      { name: 'Talla Única - Pastel', attributes: { talla: 'Única', color: 'Pastel' }, stock: 30 },
      { name: 'Talla Única - Brillante', attributes: { talla: 'Única', color: 'Brillante' }, stock: 25 },
    ],
  },
];

const CUSTOMERS = [
  { name: 'Sofía Mendoza', phone: '5215587001001', email: 'sofia.mendoza@gmail.com' },
  { name: 'Gabriela Torres', phone: '5215587001002', email: 'gaby.torres@hotmail.com' },
  { name: 'Mariana Castillo', phone: '5215587001003', email: 'mari.castillo@outlook.com' },
  { name: 'Andrea Ríos', phone: '5215587001004', email: 'andrea.rios@gmail.com' },
  { name: 'Valentina Herrera', phone: '5215587001005', email: 'vale.herrera@yahoo.com' },
];

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('👗 Seed VIKIDS — Catálogo de ropa infantil de niña\n');

  const plan = await prisma.plan.findFirstOrThrow({ where: { slug: 'pro' } });
  const passwordHash = await bcrypt.hash('Vikids2026!', 12);
  const schemaName = 'tenant_vikids';

  // Verificar si ya existe
  const existing = await prisma.tenant.findUnique({ where: { slug: 'vikids' } });
  if (existing) {
    console.log('⚠️  Tenant vikids ya existe — eliminando para recrear...');
    // Limpiar schema
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await prisma.usageRecord.deleteMany({ where: { tenantId: existing.id } });
    await prisma.subscription.deleteMany({ where: { tenantId: existing.id } });
    await prisma.tenant.delete({ where: { id: existing.id } });
  }

  // 1. Crear tenant
  const tenant = await prisma.tenant.create({
    data: {
      slug: 'vikids',
      schemaName,
      businessName: 'Vikids — Moda Infantil',
      ownerEmail: 'admin@vikids.mx',
      ownerName: 'Victoria Sánchez',
      planId: plan.id,
      status: 'ACTIVE',
      settings: {
        currency: 'MXN',
        timezone: 'America/Mexico_City',
        shippingEnabled: true,
        whatsappGreeting: '¡Hola! Bienvenida a Vikids 🎀 ¿En qué te puedo ayudar?',
      },
    },
  });
  console.log(`✅ Tenant creado: ${tenant.slug} (${tenant.id})`);

  // 2. Crear subscription
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // 3. Crear schema del tenant
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  const fs = require('fs');
  const path = require('path');
  const sqlPath = path.resolve(__dirname, 'tenant-schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8').replaceAll('{{schema}}', schemaName);
  const statements = sql
    .split('\n')
    .filter((l: string) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log('✅ Schema de tenant creado con todas las tablas');

  // 4. Crear usuario admin
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schemaName}".users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')`,
    'admin@vikids.mx',
    passwordHash,
    'Victoria Sánchez',
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schemaName}".users (email, password_hash, name, role) VALUES ($1, $2, $3, 'operator')`,
    'ventas@vikids.mx',
    passwordHash,
    'Karla Operadora',
  );
  console.log('✅ Usuarios creados (admin + operador)');

  // 5. Crear AI config
  await prisma.$executeRawUnsafe(`
    INSERT INTO "${schemaName}".ai_config
      (assistant_name, tone, welcome_message, away_message, language, custom_instructions)
    VALUES (
      'Viki',
      'friendly',
      '¡Hola! 🎀 Soy Viki, tu asistente de Vikids. Tenemos la ropa más linda para tu princesa. ¿Qué talla buscas?',
      'Estamos fuera de horario. Te responderemos en cuanto abramos. 💕',
      'es',
      'Eres Viki, asistente de una tienda de ropa infantil para niñas. Siempre pregunta la talla y color preferido. Sugiere combinaciones de outfits. Usa emojis de forma moderada (🎀💕👗). Ofrece envío gratis en compras mayores a $800 MXN.'
    )
  `);
  console.log('✅ Configuración de IA (Viki) creada');

  // 6. Crear canal de WhatsApp
  await prisma.$executeRawUnsafe(`
    INSERT INTO "${schemaName}".channels (type, external_id, access_token, is_active, config)
    VALUES ('whatsapp', '521555VIKIDS', 'encrypted_token_placeholder', true, $1::jsonb)
  `, JSON.stringify({
    phoneNumberId: '521555VIKIDS',
    businessName: 'Vikids Moda Infantil',
    displayPhone: '+52 1 55 5555 KIDS',
  }));

  // 7. Crear productos con variantes e inventario
  const productIds: string[] = [];
  for (const p of PRODUCTS) {
    const id = randomUUID();
    productIds.push(id);

    // Producto padre
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".products (id, sku, name, description, price, category, images, is_active)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::text[], true)`,
      id, p.sku, p.name, p.description, p.price, p.category, p.images,
    );

    // Stock total = suma de variantes
    const totalStock = p.variants.reduce((sum, v) => sum + v.stock, 0);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".inventory (product_id, stock_available, stock_minimum)
       VALUES ($1::uuid, $2, 5)`,
      id, totalStock,
    );

    // Variantes
    for (const v of p.variants) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".product_variants (product_id, sku, name, price, stock_available, attributes, is_active)
         VALUES ($1::uuid, $2, $3, NULL, $4, $5::jsonb, true)`,
        id,
        `${p.sku}-${v.attributes.talla}-${v.attributes.color?.substring(0, 3).toUpperCase() ?? 'UNI'}`,
        v.name,
        v.stock,
        JSON.stringify(v.attributes),
      );
    }
  }
  console.log(`✅ ${PRODUCTS.length} productos con ${PRODUCTS.reduce((s, p) => s + p.variants.length, 0)} variantes creados`);

  // 8. Crear clientes
  const customerIds: string[] = [];
  for (const c of CUSTOMERS) {
    const id = randomUUID();
    customerIds.push(id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".customers (id, name, phone, email, channel_type, channel_id)
       VALUES ($1::uuid, $2, $3, $4, 'whatsapp', $3)`,
      id, c.name, c.phone, c.email,
    );
  }
  console.log(`✅ ${CUSTOMERS.length} clientes creados`);

  // 9. Crear pedidos de ejemplo
  const orderStatuses = ['new', 'payment_pending', 'payment_verified', 'shipped', 'delivered'];
  for (let i = 0; i < 8; i++) {
    const status = orderStatuses[i % orderStatuses.length];
    const customerId = customerIds[i % customerIds.length];
    const product = PRODUCTS[i % PRODUCTS.length];
    const productId = productIds[i % productIds.length];
    const qty = 1 + (i % 3);
    const total = product.price * qty;
    const orderNumber = `VK-2026-${String(i + 1).padStart(5, '0')}`;
    const orderId = randomUUID();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".orders (id, order_number, customer_id, channel_type, status, items, subtotal, total, created_at)
       VALUES ($1::uuid, $2, $3::uuid, 'whatsapp', $4, $5::jsonb, $6, $6, NOW() - INTERVAL '${8 - i} days')`,
      orderId, orderNumber, customerId, status,
      JSON.stringify([{
        productId, productName: product.name, quantity: qty,
        unitPrice: product.price, subtotal: total,
        variant: product.variants[0].name,
      }]),
      total,
    );

    if (['payment_verified', 'shipped', 'delivered'].includes(status)) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".payments (order_id, method, amount, status, reference, verified_at)
         VALUES ($1::uuid, 'transfer', $2, 'verified', $3, NOW())`,
        orderId, total, `REF-VK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      );
    }

    if (['shipped', 'delivered'].includes(status)) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".shipments (order_id, carrier, tracking_number, status)
         VALUES ($1::uuid, 'fedex', $2, $3)`,
        orderId,
        `FDX-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        status === 'delivered' ? 'delivered' : 'in_transit',
      );
    }
  }
  console.log('✅ 8 pedidos de ejemplo creados');

  // 10. Crear conversaciones de ejemplo
  for (let i = 0; i < 3; i++) {
    const convId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".conversations (id, customer_id, channel_type, status, last_message_at)
       VALUES ($1::uuid, $2::uuid, 'whatsapp', 'active', NOW())`,
      convId, customerIds[i],
    );

    const msgs = [
      { dir: 'inbound', text: 'Hola, busco un vestido para mi hija de 4 años' },
      { dir: 'outbound', text: '¡Hola! 🎀 Soy Viki. Tenemos vestidos hermosos en talla 4. ¿Para qué ocasión lo buscas?' },
      { dir: 'inbound', text: 'Para una fiesta de cumpleaños' },
      { dir: 'outbound', text: '¡Perfecto! Te recomiendo nuestro Vestido Tutú Fiesta en dorado o plateado. Es precioso con lentejuelas ✨ Está en $549. ¿Te gustaría verlo?' },
    ];

    for (const msg of msgs) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".messages (conversation_id, direction, type, content, ai_processed)
         VALUES ($1::uuid, $2, 'text', $3, true)`,
        convId, msg.dir, msg.text,
      );
    }
  }
  console.log('✅ 3 conversaciones de ejemplo creadas');

  // 11. Usage record
  await prisma.usageRecord.create({
    data: {
      tenantId: tenant.id,
      period: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      ordersCount: 8,
      messagesSent: 24,
      aiCalls: 12,
      ocrCalls: 3,
    },
  });

  console.log('\n🎉 Seed VIKIDS completado exitosamente.');
  console.log('─────────────────────────────────────────');
  console.log('📋 Credenciales:');
  console.log('   Admin:    admin@vikids.mx / Vikids2026!');
  console.log('   Operador: ventas@vikids.mx / Vikids2026!');
  console.log('   Tenant:   vikids');
  console.log('   Schema:   tenant_vikids');
  console.log(`   ID:       ${tenant.id}`);
  console.log('─────────────────────────────────────────\n');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
