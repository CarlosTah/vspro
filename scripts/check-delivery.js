const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function check() {
  const tenants = await p.tenant.findMany({ select: { slug: true, schemaName: true } });

  for (const t of tenants) {
    try {
      // Recent orders with delivery
      const orders = await p.$queryRawUnsafe(
        `SELECT id, order_number AS "orderNumber", status, shipping_address AS "shippingAddress", delivery_type AS "deliveryType" FROM "${t.schemaName}".orders WHERE delivery_type = 'delivery' OR status IN ('ready','shipped') ORDER BY created_at DESC LIMIT 5`,
      );

      if (orders.length > 0) {
        console.log(`\n=== ${t.slug} ===`);
        orders.forEach((o) =>
          console.log(
            `  ${o.orderNumber} | status: ${o.status} | type: ${o.deliveryType} | address: ${o.shippingAddress ? 'YES' : 'NO'}`,
          ),
        );
      }

      // Check drivers
      const drivers = await p
        .$queryRawUnsafe(`SELECT id, name, phone, status FROM "${t.schemaName}".delivery_drivers`)
        .catch(() => []);
      if (drivers.length > 0) {
        console.log(
          `  Drivers: ${drivers.map((d) => `${d.name}(${d.status}) ph:${d.phone}`).join(', ')}`,
        );
      } else if (orders.length > 0) {
        console.log(`  ⚠️ NO DRIVERS REGISTERED`);
      }

      // Check delivery_assignments table exists and recent assignments
      const assignments = await p
        .$queryRawUnsafe(
          `SELECT da.id, da.status, da.order_id AS "orderId", d.name AS "driverName" FROM "${t.schemaName}".delivery_assignments da JOIN "${t.schemaName}".delivery_drivers d ON d.id = da.driver_id ORDER BY da.offered_at DESC LIMIT 5`,
        )
        .catch(() => []);
      if (assignments.length > 0) {
        console.log(
          `  Assignments: ${assignments.map((a) => `${a.driverName}→${a.status}`).join(', ')}`,
        );
      } else if (orders.length > 0) {
        console.log(`  ⚠️ NO ASSIGNMENTS (table may not exist or no dispatches yet)`);
      }
    } catch (e) {
      // skip
    }
  }
}

check()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
