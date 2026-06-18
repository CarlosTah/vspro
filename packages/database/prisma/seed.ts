/**
 * Seed de datos base — se ejecuta una vez al inicializar el proyecto.
 * Crea los 3 planes de suscripción que el sistema necesita para funcionar.
 *
 * Ejecutar con: npm run db:seed --workspace=@vspro/database
 */

import { PrismaClient } from '@prisma/client';
import { PLAN_FEATURES } from '../../shared/src/constants/plans';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de planes...');

  const plans = [
    {
      name: 'Básico',
      slug: 'basic',
      priceMonthly: 990.0,
      priceYearly: 9900.0,
      features: PLAN_FEATURES['basic'],
    },
    {
      name: 'Profesional',
      slug: 'pro',
      priceMonthly: 1490.0,
      priceYearly: 14900.0,
      features: PLAN_FEATURES['pro'],
    },
    {
      name: 'Avanzado',
      slug: 'enterprise',
      priceMonthly: 2499.0,
      priceYearly: 24990.0,
      features: PLAN_FEATURES['enterprise'],
    },
  ];

  for (const plan of plans) {
    const upserted = await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        features: plan.features as any,
        isActive: true,
      },
      create: {
        name: plan.name,
        slug: plan.slug,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        features: plan.features as any,
        isActive: true,
      },
    });
    console.log(`  ✅ Plan "${upserted.name}" — $${upserted.priceMonthly}/mes`);
  }

  console.log('\n✅ Seed completado.');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
