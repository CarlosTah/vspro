/**
 * Seed mínimo para la base de datos de test.
 * Solo inserta los planes — sin datos de negocio.
 *
 * Se ejecuta automáticamente antes de los integration tests.
 */

import { PrismaClient } from '@prisma/client';
import { PLAN_FEATURES } from '../../shared/src/constants/plans';

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

async function main() {
  // Limpiar datos de tests anteriores (orden importa por FK)
  await prisma.usageRecord.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.plan.deleteMany();

  // Insertar planes base
  await prisma.plan.createMany({
    data: [
      {
        name: 'Básico',
        slug: 'basic',
        priceMonthly: 49.0,
        priceYearly: 470.0,
        features: PLAN_FEATURES['basic'] as any,
        isActive: true,
      },
      {
        name: 'Profesional',
        slug: 'pro',
        priceMonthly: 149.0,
        priceYearly: 1430.0,
        features: PLAN_FEATURES['pro'] as any,
        isActive: true,
      },
      {
        name: 'Empresarial',
        slug: 'enterprise',
        priceMonthly: 399.0,
        priceYearly: 3830.0,
        features: PLAN_FEATURES['enterprise'] as any,
        isActive: true,
      },
    ],
  });

  console.log('✅ Seed de test completado');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
