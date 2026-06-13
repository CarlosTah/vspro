import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db' } },
});

async function audit() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  VSPRO DB AUDIT — Orphan Tenant Detection & Fix');
  console.log('═══════════════════════════════════════════════════\n');

  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, schemaName: true, status: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Tenants in public registry: ${tenants.length}\n`);

  const schemas = await prisma.$queryRawUnsafe<any[]>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'`,
  );
  const existingSchemas = new Set(schemas.map((s: any) => s.schema_name));

  const healthy: any[] = [];
  const orphans: any[] = [];
  const incomplete: any[] = [];

  for (const t of tenants) {
    if (!existingSchemas.has(t.schemaName)) {
      orphans.push(t);
    } else {
      const tables = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'conversations'`,
        t.schemaName,
      );
      if (parseInt(tables[0].c) === 0) {
        incomplete.push(t);
      } else {
        healthy.push(t);
      }
    }
  }

  console.log('── HEALTHY ──');
  for (const t of healthy) {
    console.log(`  ✓ ${t.slug.padEnd(28)} ${t.schemaName.padEnd(22)} ${t.status}`);
  }

  if (incomplete.length > 0) {
    console.log('\n── INCOMPLETE (schema exists, tables missing) ──');
    for (const t of incomplete) {
      console.log(`  ⚠ ${t.slug.padEnd(28)} ${t.schemaName.padEnd(22)} ${t.status}`);
    }
  }

  if (orphans.length > 0) {
    console.log('\n── ORPHANS (no schema at all) ──');
    for (const t of orphans) {
      console.log(`  ✗ ${t.slug.padEnd(28)} ${t.schemaName.padEnd(22)} ${t.status}`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  ${healthy.length} healthy | ${incomplete.length} incomplete | ${orphans.length} orphans`);
  console.log(`═══════════════════════════════════════════════════\n`);

  const toFix = [...orphans, ...incomplete];
  if (toFix.length > 0) {
    console.log('Fixing orphans → marking as CANCELLED...');
    for (const t of toFix) {
      if (t.status !== 'CANCELLED') {
        await prisma.tenant.update({ where: { id: t.id }, data: { status: 'CANCELLED' } });
        console.log(`  → ${t.slug}: ${t.status} → CANCELLED`);
      } else {
        console.log(`  → ${t.slug}: already CANCELLED`);
      }
    }
    console.log(`\n✅ Fixed. Cron jobs will no longer scan these tenants.`);
  } else {
    console.log('✅ No orphans — all tenants healthy.');
  }

  await prisma.$disconnect();
}

audit().catch((e) => { console.error(e); process.exit(1); });
