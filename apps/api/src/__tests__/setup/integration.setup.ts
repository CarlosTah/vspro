import { execSync } from 'child_process';

/**
 * Setup global para tests de integración e isolation.
 * Se ejecuta UNA VEZ antes de todos los tests del suite.
 */
export default async function globalSetup() {
  console.log('\n🔧 Preparando base de datos de test...');

  // Verificar que DATABASE_URL apunta a la BD de test
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.includes('test') && !dbUrl.includes('_test')) {
    throw new Error(
      'DATABASE_URL no parece apuntar a una base de datos de test. ' +
        'Asegúrate de usar .env.test',
    );
  }

  // Ejecutar migraciones en la BD de test
  execSync('npx prisma migrate deploy', {
    env: { ...process.env },
    stdio: 'inherit',
  });

  // Seed de datos base (planes)
  execSync('npx ts-node prisma/seed-test.ts', {
    env: { ...process.env },
    stdio: 'inherit',
  });

  console.log('✅ Base de datos de test lista\n');
}
