/**
 * VSPRO — Seed de datos completos ("full chaos")
 * Crea 3 tenants con datos realistas para desarrollo y demos.
 *
 * Ejecutar: DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' packages/database/prisma/seed-chaos.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ─── Datos de ejemplo ───────────────────────────────────────────

const TENANTS = [
  { slug: 'demo-tortilleria', name: 'Tortillería La Abuela', email: 'admin@tortilleria-demo.com', owner: 'Rosa Martínez' },
  { slug: 'demo-panaderia', name: 'Panadería El Trigal', email: 'admin@panaderia-demo.com', owner: 'Carlos Ruiz' },
  { slug: 'demo-taqueria', name: 'Taquería Los Compadres', email: 'admin@taqueria-demo.com', owner: 'Miguel Ángel López' },
];

const PRODUCTS_BY_TENANT = [
  // Tortillería
  [
    { name: 'Tortilla de maíz 1kg', price: 25, category: 'Tortillas', stock: 200 },
    { name: 'Tortilla de harina 1kg', price: 35, category: 'Tortillas', stock: 150 },
    { name: 'Tortilla de maíz azul 1kg', price: 40, category: 'Tortillas', stock: 80 },
    { name: 'Totopos naturales 500g', price: 30, category: 'Snacks', stock: 100 },
    { name: 'Gorditas de chicharrón (6pz)', price: 60, category: 'Antojitos', stock: 50 },
    { name: 'Sopes (6pz)', price: 55, category: 'Antojitos', stock: 40 },
  ],
  // Panadería
  [
    { name: 'Concha (pieza)', price: 12, category: 'Pan dulce', stock: 300 },
    { name: 'Cuerno (pieza)', price: 15, category: 'Pan dulce', stock: 200 },
    { name: 'Bolillo (pieza)', price: 5, category: 'Pan salado', stock: 500 },
    { name: 'Telera (pieza)', price: 6, category: 'Pan salado', stock: 400 },
    { name: 'Pastel de chocolate (entero)', price: 350, category: 'Pasteles', stock: 10 },
    { name: 'Rosca de Reyes', price: 280, category: 'Temporada', stock: 5 },
    { name: 'Dona glaseada (pieza)', price: 18, category: 'Pan dulce', stock: 150 },
  ],
  // Taquería
  [
    { name: 'Orden de tacos al pastor (5pz)', price: 75, category: 'Tacos', stock: 100 },
    { name: 'Orden de tacos de bistec (5pz)', price: 85, category: 'Tacos', stock: 80 },
    { name: 'Quesadilla de queso', price: 35, category: 'Quesadillas', stock: 120 },
    { name: 'Gringa de pastor', price: 45, category: 'Gringas', stock: 90 },
    { name: 'Agua de horchata 1L', price: 30, category: 'Bebidas', stock: 50 },
    { name: 'Refresco 600ml', price: 25, category: 'Bebidas', stock: 200 },
    { name: 'Orden de nachos con queso', price: 55, category: 'Extras', stock: 60 },
    { name: 'Guacamole extra', price: 20, category: 'Extras', stock: 100 },
  ],
];

const CUSTOMERS = [
  { name: 'Ana García', phone: '5215512345001', channel: 'whatsapp' },
  { name: 'Pedro Sánchez', phone: '5215512345002', channel: 'whatsapp' },
  { name: 'María López', phone: '5215512345003', channel: 'whatsapp' },
  { name: 'Juan Hernández', phone: '5215512345004', channel: 'messenger' },
  { name: 'Laura Díaz', phone: '5215512345005', channel: 'instagram' },
  { name: 'Roberto Torres', phone: '5215512345006', channel: 'whatsapp' },
  { name: 'Carmen Flores', phone: '5215512345007', channel: 'whatsapp' },
  { name: 'Diego Ramírez', phone: '5215512345008', channel: 'messenger' },
];

const ORDER_STATUSES = [
  'new', 'new', 'quoted', 'payment_pending', 'payment_pending',
  'payment_verified', 'payment_verified', 'in_production', 'in_production',
  'ready', 'ready', 'shipped', 'shipped', 'shipped',
  'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'cancelled',
];

const CARRIERS = ['fedex', 'dhl', 'estafeta', '99minutos'];

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('🌪️  Seed FULL CHAOS — creando datos de demo...\n');

  // Obtener plan básico
  const plan = await prisma.plan.findFirstOrThrow({ where: { slug: 'basic' } });
  const proPlan = await prisma.plan.findFirstOrThrow({ where: { slug: 'pro' } });
  const passwordHash = await bcrypt.hash('Demo123!', 12);

  for (let t = 0; t < TENANTS.length; t++) {
    const tenantData = TENANTS[t];
    const products = PRODUCTS_BY_TENANT[t];
    const assignedPlan = t === 0 ? plan : proPlan; // primer tenant en básico, otros en pro

    console.log(`\n📦 Creando tenant: ${tenantData.name}`);

    // Verificar si ya existe
    const existing = await prisma.tenant.findUnique({ where: { slug: tenantData.slug } });
    if (existing) {
      console.log(`   ⚠️  Ya existe — saltando`);
      continue;
    }

    const schemaName = `tenant_demo_${t + 1}`;

    // 1. Crear tenant
    const tenant = await prisma.tenant.create({
      data: {
        slug: tenantData.slug,
        schemaName,
        businessName: tenantData.name,
        ownerEmail: tenantData.email,
        ownerName: tenantData.owner,
        planId: assignedPlan.id,
        status: t === 2 ? 'TRIAL' : 'ACTIVE',
        trialEndsAt: t === 2 ? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) : null,
      },
    });

    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: assignedPlan.id,
        status: t === 2 ? 'TRIALING' : 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // 2. Crear schema
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // Leer y ejecutar tenant-schema.sql
    const fs = require('fs');
    const path = require('path');
    const sqlPath = path.resolve(__dirname, 'tenant-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8').replaceAll('{{schema}}', schemaName);
    const statements = sql.split('\n').filter((l: string) => !l.trim().startsWith('--')).join('\n').split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }

    // 3. Crear usuarios
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')`,
      tenantData.email, passwordHash, tenantData.owner,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".users (email, password_hash, name, role) VALUES ($1, $2, $3, 'operator')`,
      `operador@${tenantData.slug}.com`, passwordHash, 'Operador Demo',
    );

    // 4. Crear AI config
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".ai_config (assistant_name, tone, welcome_message, away_message, language) VALUES ($1, 'friendly', $2, $3, 'es')`,
      t === 0 ? 'Lupita' : t === 1 ? 'Pancho' : 'Tacobot',
      `¡Hola! Soy el asistente de ${tenantData.name}. ¿Qué te puedo ofrecer hoy?`,
      'Estamos fuera de horario. Te responderemos pronto.',
    );

    // 5. Crear productos con inventario
    const productIds: string[] = [];
    for (const p of products) {
      const id = randomUUID();
      productIds.push(id);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".products (id, name, price, category, is_active) VALUES ($1::uuid, $2, $3, $4, true)`,
        id, p.name, p.price, p.category,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".inventory (product_id, stock_available, stock_minimum) VALUES ($1::uuid, $2, 10)`,
        id, p.stock,
      );
    }
    console.log(`   ✅ ${products.length} productos creados`);

    // 6. Crear clientes
    const customerIds: string[] = [];
    for (const c of CUSTOMERS.slice(0, 5 + t)) {
      const id = randomUUID();
      customerIds.push(id);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".customers (id, name, phone, channel_type, channel_id) VALUES ($1::uuid, $2, $3, $4, $5)`,
        id, c.name, c.phone, c.channel, c.phone,
      );
    }
    console.log(`   ✅ ${customerIds.length} clientes creados`);

    // 7. Crear pedidos en distintos estados
    const numOrders = Math.min(20, ORDER_STATUSES.length);
    let orderCount = 0;
    for (let i = 0; i < numOrders; i++) {
      const status = ORDER_STATUSES[i];
      const customerId = customerIds[i % customerIds.length];
      const productIdx = i % productIds.length;
      const qty = 1 + (i % 5);
      const unitPrice = products[productIdx].price;
      const total = unitPrice * qty;
      const orderNumber = `ORD-2026-${String(i + 1).padStart(5, '0')}`;
      const orderId = randomUUID();

      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".orders (id, order_number, customer_id, channel_type, status, items, subtotal, total, created_at)
         VALUES ($1::uuid, $2, $3::uuid, 'whatsapp', $4, $5::jsonb, $6, $6, NOW() - INTERVAL '${numOrders - i} hours')`,
        orderId, orderNumber, customerId, status,
        JSON.stringify([{ productId: productIds[productIdx], productName: products[productIdx].name, quantity: qty, unitPrice, subtotal: total }]),
        total,
      );

      // Pagos para pedidos verificados+
      if (['payment_verified', 'in_production', 'ready', 'shipped', 'delivered'].includes(status)) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${schemaName}".payments (order_id, method, amount, status, reference, verified_at)
           VALUES ($1::uuid, 'transfer', $2, 'verified', $3, NOW())`,
          orderId, total, `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        );
      }

      // Envíos para pedidos shipped/delivered
      if (['shipped', 'delivered'].includes(status)) {
        const carrier = CARRIERS[i % CARRIERS.length];
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${schemaName}".shipments (order_id, carrier, tracking_number, status)
           VALUES ($1::uuid, $2, $3, $4)`,
          orderId, carrier,
          `${carrier.toUpperCase()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          status === 'delivered' ? 'delivered' : 'in_transit',
        );
      }

      // Registro contable para delivered
      if (status === 'delivered') {
        const tax = total * 0.16 / 1.16;
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${schemaName}".accounting_entries (order_id, type, amount, tax_amount, description)
           VALUES ($1::uuid, 'sale', $2, $3, 'Venta completada')`,
          orderId, total, tax,
        );
      }

      orderCount++;
    }
    console.log(`   ✅ ${orderCount} pedidos creados (todos los estados)`);

    // 8. Crear conversaciones con mensajes
    for (let i = 0; i < 3; i++) {
      const convId = randomUUID();
      const custId = customerIds[i];
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".conversations (id, customer_id, channel_type, status, last_message_at)
         VALUES ($1::uuid, $2::uuid, 'whatsapp', 'active', NOW())`,
        convId, custId,
      );

      // Mensajes de ejemplo
      const messages = [
        { dir: 'inbound', text: 'Hola, quiero hacer un pedido' },
        { dir: 'outbound', text: `¡Hola! Soy ${t === 0 ? 'Lupita' : t === 1 ? 'Pancho' : 'Tacobot'}. ¿Qué te puedo ofrecer?` },
        { dir: 'inbound', text: `Quiero ${products[0].name}` },
        { dir: 'outbound', text: `Perfecto, ${products[0].name} a $${products[0].price}. ¿Confirmas?` },
        { dir: 'inbound', text: 'Sí, confirmo' },
        { dir: 'outbound', text: '✅ Pedido creado. Te envío los datos para el pago.' },
      ];

      for (const msg of messages) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "${schemaName}".messages (conversation_id, direction, type, content, ai_processed)
           VALUES ($1::uuid, $2, 'text', $3, true)`,
          convId, msg.dir, msg.text,
        );
      }
    }
    console.log(`   ✅ 3 conversaciones con historial de IA`);

    // 9. Usage records
    await prisma.usageRecord.create({
      data: {
        tenantId: tenant.id,
        period: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        ordersCount: orderCount,
        messagesSent: orderCount * 4,
        aiCalls: orderCount * 2,
        ocrCalls: Math.floor(orderCount * 0.6),
      },
    });
    console.log(`   ✅ Usage records del mes`);
  }

  console.log('\n\n🎉 Seed FULL CHAOS completado.');
  console.log('   Credenciales de todos los tenants: Demo123!');
  console.log('   Tenants: demo-tortilleria, demo-panaderia, demo-taqueria\n');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
