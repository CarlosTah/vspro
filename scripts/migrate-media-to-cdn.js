/**
 * Migration script: Upload base64 media_assets to DigitalOcean Spaces CDN
 * Uses @aws-sdk/client-s3 (available in container) and raw SQL via child_process
 */
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { execSync } = require('child_process');

const S3_ENDPOINT = process.env.AWS_S3_ENDPOINT || 'https://nyc3.digitaloceanspaces.com';
const S3_BUCKET = process.env.AWS_S3_BUCKET || 'vspro-uploads';
const S3_REGION = process.env.AWS_REGION || 'nyc3';
const S3_KEY = process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET = process.env.AWS_SECRET_ACCESS_KEY;
const DB_URL = process.env.DATABASE_URL;

const CDN_BASE = `https://${S3_BUCKET}.${S3_REGION}.digitaloceanspaces.com`;

function psql(query) {
  const cmd = `psql "${DB_URL}" -t -A -c "${query.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

async function main() {
  if (!S3_KEY || !S3_SECRET || !DB_URL) {
    console.error('Missing env vars');
    process.exit(1);
  }

  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: { accessKeyId: S3_KEY, secretAccessKey: S3_SECRET },
    forcePathStyle: false,
  });

  // Get tenant schemas
  const schemasRaw = psql("SELECT schema_name FROM tenants WHERE status IN ('ACTIVE','TRIAL')");
  const schemas = schemasRaw.split('\n').filter(Boolean);

  for (const schema of schemas) {
    console.log(`\n--- ${schema} ---`);

    // Check table
    const tableExists = psql(
      `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${schema}' AND table_name = 'media_assets'`,
    );
    if (tableExists === '0') {
      console.log('  No media_assets table');
      continue;
    }

    // Get base64 assets (just IDs and types since URLs are huge)
    const idsRaw = psql(
      `SELECT id || '|' || type || '|' || COALESCE(title,'') FROM "${schema}".media_assets WHERE url LIKE 'data:%' AND is_active = true`,
    );
    if (!idsRaw) {
      console.log('  No base64 assets');
      continue;
    }

    const ids = idsRaw.split('\n').filter(Boolean);
    console.log(`  Found ${ids.length} base64 assets`);

    for (const row of ids) {
      const [id, type, title] = row.split('|');
      try {
        // Get the URL (base64 data)
        const url = psql(`SELECT url FROM "${schema}".media_assets WHERE id = '${id}'::uuid`);

        const match = url.match(/^data:(image\/\w+);base64,(.+)$/s);
        if (!match) {
          console.log(`  [SKIP] ${id}`);
          continue;
        }

        const mimeType = match[1];
        const base64Data = match[2];
        const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        const key = `media/${schema}/${type}/${id}.${ext}`;
        await s3.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
            ACL: 'public-read',
          }),
        );

        const publicUrl = `${CDN_BASE}/${key}`;
        psql(`UPDATE "${schema}".media_assets SET url = '${publicUrl}' WHERE id = '${id}'::uuid`);
        console.log(`  [OK] ${title || id} → ${publicUrl}`);
      } catch (err) {
        console.error(`  [ERR] ${id}: ${err.message}`);
      }
    }
  }

  console.log('\n✅ Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
