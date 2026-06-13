/**
 * VSPRO — Seed para Tenant 'room359'
 * Departamentos en renta con matriz de tarifas JSONB (noche, semana, mes)
 * y calendario base libre.
 *
 * Ejecutar:
 *   DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' packages/database/prisma/seed-room359.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ─── Catálogo Room 359 — Departamentos en renta ─────────────────

interface CustomRates {
  perNight: number;
  perWeek: number;
  perMonth: number;
  cleaningFee: number;
  extraGuestFee: number;
  maxGuests: number;
  minNights: number;
  currency: string;
}

const PROPERTIES = [
  {
    sku: 'R359-STUDIO-CENTRO-01',
    name: 'Studio Ejecutivo Centro',
    description: 'Estudio moderno de 35m² en el centro histórico. Cocina equipada, WiFi de alta velocidad, Smart TV. Ideal para viajeros de negocios.',
    price: 1200, // precio base por noche
    category: 'Studios',
    images: [
      'https://cdn.room359.mx/propiedades/studio-centro-living.webp',
      'https://cdn.room359.mx/propiedades/studio-centro-kitchen.webp',
      'https://cdn.room359.mx/propiedades/studio-centro-bath.webp',
      'https://cdn.room359.mx/propiedades/studio-centro-view.webp',
    ],
    rates: {
      perNight: 1200,
      perWeek: 7000,
      perMonth: 22000,
      cleaningFee: 350,
      extraGuestFee: 300,
      maxGuests: 2,
      minNights: 1,
      currency: 'MXN',
    } as CustomRates,
    amenities: ['WiFi', 'Smart TV', 'Cocina', 'Aire acondicionado', 'Lavadora', 'Estacionamiento'],
    blockingDates: [] as string[], // Libre
  },
  {
    sku: 'R359-1BR-ROMA-02',
    name: 'Depto 1 Recámara Roma Norte',
    description: 'Departamento de 55m² en la Roma Norte. 1 recámara con cama king, sala-comedor, balcón con vista a parque. Zona de restaurantes y cafés.',
    price: 1800,
    category: '1 Recámara',
    images: [
      'https://cdn.room359.mx/propiedades/1br-roma-living.webp',
      'https://cdn.room359.mx/propiedades/1br-roma-bedroom.webp',
      'https://cdn.room359.mx/propiedades/1br-roma-balcony.webp',
      'https://cdn.room359.mx/propiedades/1br-roma-kitchen.webp',
    ],
    rates: {
      perNight: 1800,
      perWeek: 10500,
      perMonth: 35000,
      cleaningFee: 500,
      extraGuestFee: 400,
      maxGuests: 3,
      minNights: 2,
      currency: 'MXN',
    } as CustomRates,
    amenities: ['WiFi', 'Smart TV', 'Cocina completa', 'Balcón', 'Aire acondicionado', 'Lavadora/Secadora', 'Gimnasio'],
    blockingDates: ['2026-05-20', '2026-05-21', '2026-05-22', '2026-05-23'], // Reserva existente
  },
  {
    sku: 'R359-2BR-CONDESA-03',
    name: 'Depto 2 Recámaras Condesa',
    description: 'Amplio departamento de 80m² en la Condesa. 2 recámaras (king + twin), 2 baños completos, terraza privada con asador. Pet-friendly.',
    price: 2800,
    category: '2 Recámaras',
    images: [
      'https://cdn.room359.mx/propiedades/2br-condesa-living.webp',
      'https://cdn.room359.mx/propiedades/2br-condesa-master.webp',
      'https://cdn.room359.mx/propiedades/2br-condesa-second.webp',
      'https://cdn.room359.mx/propiedades/2br-condesa-terrace.webp',
      'https://cdn.room359.mx/propiedades/2br-condesa-kitchen.webp',
    ],
    rates: {
      perNight: 2800,
      perWeek: 16000,
      perMonth: 52000,
      cleaningFee: 700,
      extraGuestFee: 500,
      maxGuests: 5,
      minNights: 2,
      currency: 'MXN',
    } as CustomRates,
    amenities: ['WiFi', 'Smart TV x2', 'Cocina completa', 'Terraza', 'Asador', 'Pet-friendly', 'Estacionamiento x2', 'Lavadora/Secadora'],
    blockingDates: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
  },
  {
    sku: 'R359-PENT-POLANCO-04',
    name: 'Penthouse Polanco',
    description: 'Penthouse de lujo de 120m² en Polanco. 2 recámaras master con baño completo, sala de estar, comedor para 8, terraza panorámica con jacuzzi.',
    price: 5500,
    category: 'Penthouses',
    images: [
      'https://cdn.room359.mx/propiedades/pent-polanco-living.webp',
      'https://cdn.room359.mx/propiedades/pent-polanco-master.webp',
      'https://cdn.room359.mx/propiedades/pent-polanco-terrace.webp',
      'https://cdn.room359.mx/propiedades/pent-polanco-jacuzzi.webp',
      'https://cdn.room359.mx/propiedades/pent-polanco-dining.webp',
      'https://cdn.room359.mx/propiedades/pent-polanco-view.webp',
    ],
    rates: {
      perNight: 5500,
      perWeek: 32000,
      perMonth: 95000,
      cleaningFee: 1200,
      extraGuestFee: 800,
      maxGuests: 6,
      minNights: 3,
      currency: 'MXN',
    } as CustomRates,
    amenities: ['WiFi Premium', 'Smart TV x3', 'Cocina gourmet', 'Terraza panorámica', 'Jacuzzi', 'Gimnasio privado', 'Concierge', 'Estacionamiento x2', 'Cava de vinos'],
    blockingDates: [],
  },
  {
    sku: 'R359-LOFT-JUAREZ-05',
    name: 'Loft Industrial Juárez',
    description: 'Loft de 65m² con techos altos y diseño industrial. Espacio abierto con mezzanine, cocina tipo bar, ventanales de piso a techo.',
    price: 1600,
    category: 'Lofts',
    images: [
      'https://cdn.room359.mx/propiedades/loft-juarez-main.webp',
      'https://cdn.room359.mx/propiedades/loft-juarez-mezzanine.webp',
      'https://cdn.room359.mx/propiedades/loft-juarez-kitchen.webp',
    ],
    rates: {
      perNight: 1600,
      perWeek: 9000,
      perMonth: 28000,
      cleaningFee: 400,
      extraGuestFee: 350,
      maxGuests: 3,
      minNights: 1,
      currency: 'MXN',
    } as CustomRates,
    amenities: ['WiFi', 'Smart TV', 'Cocina bar', 'Techos altos', 'Mezzanine', 'Lavadora', 'Bicicletas'],
    blockingDates: ['2026-05-25', '2026-05-26', '2026-05-27'],
  },
  {
    sku: 'R359-FAMILY-COYOACAN-06',
    name: 'Casa Familiar Coyoacán',
    description: 'Casa completa de 150m² en Coyoacán. 3 recámaras, jardín privado, zona de juegos infantiles. Cerca de museos y mercados artesanales.',
    price: 3200,
    category: 'Casas',
    images: [
      'https://cdn.room359.mx/propiedades/casa-coyoacan-front.webp',
      'https://cdn.room359.mx/propiedades/casa-coyoacan-garden.webp',
      'https://cdn.room359.mx/propiedades/casa-coyoacan-living.webp',
      'https://cdn.room359.mx/propiedades/casa-coyoacan-master.webp',
      'https://cdn.room359.mx/propiedades/casa-coyoacan-kids.webp',
    ],
    rates: {
      perNight: 3200,
      perWeek: 18500,
      perMonth: 60000,
      cleaningFee: 800,
      extraGuestFee: 600,
      maxGuests: 8,
      minNights: 2,
      currency: 'MXN',
    } as CustomRates,
    amenities: ['WiFi', 'Smart TV x2', 'Cocina completa', 'Jardín', 'Zona de juegos', 'Pet-friendly', 'Estacionamiento x2', 'BBQ', 'Lavadora/Secadora'],
    blockingDates: [],
  },
];

const CUSTOMERS = [
  { name: 'Ricardo Fuentes', phone: '5215598001001', email: 'ricardo.fuentes@gmail.com' },
  { name: 'Patricia Vega', phone: '5215598001002', email: 'pat.vega@outlook.com' },
  { name: 'Fernando Morales', phone: '5215598001003', email: 'fer.morales@icloud.com' },
  { name: 'Alejandra Ruiz', phone: '5215598001004', email: 'ale.ruiz@gmail.com' },
  { name: 'Daniel Ortega', phone: '5215598001005', email: 'daniel.ortega@hotmail.com' },
  { name: 'Isabela Navarro', phone: '5215598001006', email: 'isa.navarro@gmail.com' },
];

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('🏠 Seed ROOM 359 — Departamentos en renta\n');

  const plan = await prisma.plan.findFirstOrThrow({ where: { slug: 'pro' } });
  const passwordHash = await bcrypt.hash('Room359!2026', 12);
  const schemaName = 'tenant_room359';

  // Verificar si ya existe
  const existing = await prisma.tenant.findUnique({ where: { slug: 'room359' } });
  if (existing) {
    console.log('⚠️  Tenant room359 ya existe — eliminando para recrear...');
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await prisma.usageRecord.deleteMany({ where: { tenantId: existing.id } });
    await prisma.subscription.deleteMany({ where: { tenantId: existing.id } });
    await prisma.tenant.delete({ where: { id: existing.id } });
  }

  // 1. Crear tenant
  const tenant = await prisma.tenant.create({
    data: {
      slug: 'room359',
      schemaName,
      businessName: 'Room 359 — Estancias Premium',
      ownerEmail: 'admin@room359.mx',
      ownerName: 'Rodrigo Espinoza',
      planId: plan.id,
      status: 'ACTIVE',
      settings: {
        currency: 'MXN',
        timezone: 'America/Mexico_City',
        rentalMode: true,
        checkInTime: '15:00',
        checkOutTime: '11:00',
        instantBooking: false,
        requireDeposit: true,
        depositPercent: 30,
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

  // 4. Crear usuarios
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schemaName}".users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')`,
    'admin@room359.mx',
    passwordHash,
    'Rodrigo Espinoza',
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schemaName}".users (email, password_hash, name, role) VALUES ($1, $2, $3, 'operator')`,
    'reservas@room359.mx',
    passwordHash,
    'Daniela Reservaciones',
  );
  console.log('✅ Usuarios creados (admin + operador)');

  // 5. Crear AI config
  await prisma.$executeRawUnsafe(`
    INSERT INTO "${schemaName}".ai_config
      (assistant_name, tone, welcome_message, away_message, language, custom_instructions, business_hours)
    VALUES (
      'Luna',
      'professional',
      '¡Hola! 🏠 Soy Luna, tu asistente de Room 359. Tenemos departamentos increíbles en CDMX. ¿Para qué fechas buscas hospedaje?',
      'Gracias por contactarnos. Nuestro horario de atención es de 8am a 10pm. Te responderemos a primera hora. 🌙',
      'es',
      'Eres Luna, asistente de una empresa de renta de departamentos premium en CDMX. SIEMPRE pregunta: 1) Fechas de check-in y check-out, 2) Número de huéspedes, 3) Presupuesto aproximado. Ofrece tarifas por noche, semana o mes según la duración. Menciona amenidades relevantes. Para estancias de 7+ noches ofrece tarifa semanal. Para 28+ noches ofrece tarifa mensual.',
      $1::jsonb
    )
  `, JSON.stringify({
    monday: { open: '08:00', close: '22:00' },
    tuesday: { open: '08:00', close: '22:00' },
    wednesday: { open: '08:00', close: '22:00' },
    thursday: { open: '08:00', close: '22:00' },
    friday: { open: '08:00', close: '22:00' },
    saturday: { open: '09:00', close: '20:00' },
    sunday: { open: '10:00', close: '18:00' },
  }));
  console.log('✅ Configuración de IA (Luna) creada');

  // 6. Crear canal de WhatsApp
  await prisma.$executeRawUnsafe(`
    INSERT INTO "${schemaName}".channels (type, external_id, access_token, is_active, config)
    VALUES ('whatsapp', '5215555ROOM359', 'encrypted_token_placeholder', true, $1::jsonb)
  `, JSON.stringify({
    phoneNumberId: '5215555ROOM359',
    businessName: 'Room 359 Estancias',
    displayPhone: '+52 1 55 5555 R359',
  }));

  // 7. Crear propiedades con tarifas JSONB e inventario con blocking_dates
  const productIds: string[] = [];
  for (const p of PROPERTIES) {
    const id = randomUUID();
    productIds.push(id);

    // Producto = Propiedad (con external_rates = matriz de tarifas)
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".products (id, sku, name, description, price, category, images, is_active, external_rates)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::text[], true, $8::jsonb)`,
      id, p.sku, p.name, p.description, p.price, p.category, p.images,
      JSON.stringify({ ...p.rates, amenities: p.amenities }),
    );

    // Inventario con blocking_dates (calendario de disponibilidad)
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".inventory (product_id, stock_available, stock_minimum, blocking_dates)
       VALUES ($1::uuid, 1, 0, $2::jsonb)`,
      id, JSON.stringify(p.blockingDates),
    );
  }
  console.log(`✅ ${PROPERTIES.length} propiedades creadas con tarifas JSONB y calendario`);

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

  // 9. Crear reservaciones de ejemplo (como pedidos con metadata de fechas)
  const reservations = [
    { propIdx: 1, custIdx: 0, checkIn: '2026-05-20', checkOut: '2026-05-24', guests: 2, status: 'payment_verified' },
    { propIdx: 2, custIdx: 1, checkIn: '2026-06-01', checkOut: '2026-06-08', guests: 4, status: 'payment_verified' },
    { propIdx: 4, custIdx: 2, checkIn: '2026-05-25', checkOut: '2026-05-28', guests: 2, status: 'payment_pending' },
    { propIdx: 0, custIdx: 3, checkIn: '2026-06-10', checkOut: '2026-06-15', guests: 1, status: 'new' },
    { propIdx: 3, custIdx: 4, checkIn: '2026-07-01', checkOut: '2026-07-05', guests: 4, status: 'new' },
    { propIdx: 5, custIdx: 5, checkIn: '2026-06-20', checkOut: '2026-06-27', guests: 6, status: 'payment_pending' },
  ];

  for (let i = 0; i < reservations.length; i++) {
    const r = reservations[i];
    const property = PROPERTIES[r.propIdx];
    const productId = productIds[r.propIdx];
    const checkIn = new Date(r.checkIn);
    const checkOut = new Date(r.checkOut);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // Calcular tarifa según duración
    let totalPrice: number;
    if (nights >= 28) {
      totalPrice = property.rates.perMonth;
    } else if (nights >= 7) {
      totalPrice = property.rates.perWeek * Math.ceil(nights / 7);
    } else {
      totalPrice = property.rates.perNight * nights;
    }
    totalPrice += property.rates.cleaningFee;

    const orderNumber = `RES-359-${String(i + 1).padStart(4, '0')}`;
    const orderId = randomUUID();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".orders (id, order_number, customer_id, channel_type, status, items, subtotal, total, notes, created_at)
       VALUES ($1::uuid, $2, $3::uuid, 'whatsapp', $4, $5::jsonb, $6, $6, $7, NOW() - INTERVAL '${reservations.length - i} days')`,
      orderId, orderNumber, customerIds[r.custIdx], r.status,
      JSON.stringify([{
        productId,
        productName: property.name,
        quantity: nights,
        unitPrice: property.rates.perNight,
        subtotal: totalPrice,
        type: 'reservation',
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        guests: r.guests,
      }]),
      totalPrice,
      JSON.stringify({ checkIn: r.checkIn, checkOut: r.checkOut, guests: r.guests, nights }),
    );

    if (r.status === 'payment_verified') {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".payments (order_id, method, amount, status, reference, verified_at)
         VALUES ($1::uuid, 'transfer', $2, 'verified', $3, NOW())`,
        orderId, totalPrice, `DEP-R359-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      );
    }
  }
  console.log(`✅ ${reservations.length} reservaciones de ejemplo creadas`);

  // 10. Crear conversaciones de ejemplo
  for (let i = 0; i < 3; i++) {
    const convId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".conversations (id, customer_id, channel_type, status, last_message_at)
       VALUES ($1::uuid, $2::uuid, 'whatsapp', 'active', NOW())`,
      convId, customerIds[i],
    );

    const msgs = [
      { dir: 'inbound', text: 'Hola, busco un departamento para el próximo fin de semana' },
      { dir: 'outbound', text: '¡Hola! 🏠 Soy Luna de Room 359. Con gusto te ayudo. ¿Para cuántas personas sería y cuántas noches necesitas?' },
      { dir: 'inbound', text: 'Somos 2 personas, del viernes al domingo' },
      { dir: 'outbound', text: 'Perfecto, 2 noches para 2 personas. Te recomiendo nuestro Studio Ejecutivo Centro a $1,200/noche o el Loft Industrial Juárez a $1,600/noche. Ambos incluyen WiFi, cocina y Smart TV. ¿Cuál te interesa más?' },
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
      ordersCount: 6,
      messagesSent: 18,
      aiCalls: 10,
      ocrCalls: 2,
    },
  });

  console.log('\n🎉 Seed ROOM 359 completado exitosamente.');
  console.log('─────────────────────────────────────────');
  console.log('📋 Credenciales:');
  console.log('   Admin:    admin@room359.mx / Room359!2026');
  console.log('   Operador: reservas@room359.mx / Room359!2026');
  console.log('   Tenant:   room359');
  console.log('   Schema:   tenant_room359');
  console.log(`   ID:       ${tenant.id}`);
  console.log('─────────────────────────────────────────');
  console.log('\n📊 Propiedades y tarifas:');
  for (const p of PROPERTIES) {
    console.log(`   ${p.name}: $${p.rates.perNight}/noche | $${p.rates.perWeek}/semana | $${p.rates.perMonth}/mes`);
  }
  console.log('');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
