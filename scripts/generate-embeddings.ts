/**
 * Generate embeddings for all products and KB entries across all active tenants.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/generate-embeddings.ts
 *
 * Or from production server:
 *   docker exec vspro_api node -e "require('./dist/scripts/generate-embeddings.js')"
 *
 * This script:
 * 1. Finds all active tenants
 * 2. For each tenant, generates embeddings for products without one
 * 3. For each tenant, generates embeddings for KB entries without one
 */

import OpenAI from 'openai';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
      dimensions: 1536,
    });
    return response.data[0].embedding;
  } catch (err: any) {
    console.error(`  ❌ Embedding failed: ${err.message}`);
    return null;
  }
}

async function embedProducts(schemaName: string): Promise<number> {
  const products = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, name, description, category, price FROM "${schemaName}".products WHERE is_active = true AND embedding IS NULL`,
  );

  let count = 0;
  for (const p of products) {
    const text = [p.name, p.category ? `Categoría: ${p.category}` : '', p.description || '', `Precio: $${p.price}`]
      .filter(Boolean)
      .join('. ');

    const embedding = await generateEmbedding(text);
    if (embedding) {
      const vectorStr = `[${embedding.join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "${schemaName}".products SET embedding = $1::vector WHERE id = $2::uuid`,
        vectorStr,
        p.id,
      );
      count++;
    }
    // Rate limit
    if (count % 10 === 0 && count > 0) await new Promise((r) => setTimeout(r, 1000));
  }
  return count;
}

async function embedKbEntries(schemaName: string): Promise<number> {
  // Ensure embedding column exists
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "${schemaName}".knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(1536)`,
  ).catch(() => {});

  let entries: any[] = [];
  try {
    entries = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, title, content FROM "${schemaName}".knowledge_base WHERE is_active = true AND embedding IS NULL`,
    );
  } catch {
    return 0; // Table might not exist
  }

  let count = 0;
  for (const e of entries) {
    const text = `${e.title}. ${e.content}`;
    const embedding = await generateEmbedding(text);
    if (embedding) {
      const vectorStr = `[${embedding.join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "${schemaName}".knowledge_base SET embedding = $1::vector WHERE id = $2::uuid`,
        vectorStr,
        e.id,
      );
      count++;
    }
    if (count % 10 === 0 && count > 0) await new Promise((r) => setTimeout(r, 1000));
  }
  return count;
}

async function main() {
  console.log('🧠 Generating embeddings for all tenants...\n');

  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] } },
    select: { slug: true, schemaName: true, businessName: true },
  });

  console.log(`Found ${tenants.length} active tenant(s)\n`);

  let totalProducts = 0;
  let totalKb = 0;

  for (const t of tenants) {
    console.log(`📦 ${t.businessName} (${t.slug}) → ${t.schemaName}`);

    const pCount = await embedProducts(t.schemaName);
    const kCount = await embedKbEntries(t.schemaName);

    totalProducts += pCount;
    totalKb += kCount;

    if (pCount > 0 || kCount > 0) {
      console.log(`   ✅ ${pCount} products, ${kCount} KB entries embedded`);
    } else {
      console.log(`   ⏭️  Already up to date`);
    }
  }

  console.log(`\n🎉 Done! Total: ${totalProducts} products + ${totalKb} KB entries embedded.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
