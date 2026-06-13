/**
 * Teardown global para tests de integración e isolation.
 * Se ejecuta UNA VEZ después de todos los tests del suite.
 */
export default async function globalTeardown() {
  console.log('\n🧹 Limpiando base de datos de test...');
  // La limpieza se hace en cada test con beforeEach/afterEach
  // No eliminamos la BD aquí para poder inspeccionar si algo falla
  console.log('✅ Teardown completado\n');
}
