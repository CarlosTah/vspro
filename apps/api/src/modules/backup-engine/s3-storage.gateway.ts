import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * S3 Storage Gateway — Streams backup data to AWS S3.
 *
 * Feature: aws-s3-stream
 * Zero-waste: Uses AWS SDK only in production. In dev, simulates with local logs.
 *
 * Bucket structure:
 *   s3://{bucket}/backups/
 *     ├── full/{date}.sql.gz
 *     ├── tenants/{slug}/{date}.sql.gz
 *     └── audit/{date}.json
 */
@Injectable()
export class S3StorageGateway {
  private readonly logger = new Logger(S3StorageGateway.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly isConfigured: boolean;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get('AWS_S3_BUCKET', 'vspro-backups-dev');
    this.region = this.config.get('AWS_REGION', 'us-east-1');
    this.isConfigured = !!this.config.get('AWS_ACCESS_KEY_ID') &&
      this.config.get('AWS_ACCESS_KEY_ID') !== 'CHANGE_ME';
  }

  /**
   * Upload a buffer/string to S3.
   */
  async upload(key: string, data: Buffer | string, contentType = 'application/octet-stream'): Promise<UploadResult> {
    if (!this.isConfigured) {
      this.logger.debug(`[DEV] S3 upload simulated: s3://${this.bucket}/${key} (${Buffer.byteLength(data)} bytes)`);
      return { success: true, key, bucket: this.bucket, simulated: true, sizeBytes: Buffer.byteLength(data) };
    }

    try {
      // Dynamic import to avoid loading AWS SDK in dev (zero-waste)
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: this.region });

      await s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: Buffer.isBuffer(data) ? data : Buffer.from(data),
        ContentType: contentType,
      }));

      this.logger.log(`S3 uploaded: s3://${this.bucket}/${key}`);
      return { success: true, key, bucket: this.bucket, simulated: false, sizeBytes: Buffer.byteLength(data) };
    } catch (err: any) {
      this.logger.error(`S3 upload failed for ${key}: ${err.message}`);
      return { success: false, key, bucket: this.bucket, simulated: false, sizeBytes: 0, error: err.message };
    }
  }

  /**
   * Delete an object from S3 (for retention cleanup).
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isConfigured) return true;

    try {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: this.region });
      await s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List objects by prefix (for audit/status).
   */
  async listObjects(prefix: string, maxKeys = 50): Promise<string[]> {
    if (!this.isConfigured) return [];

    try {
      const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      const s3 = new S3Client({ region: this.region });
      const res = await s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: maxKeys }));
      return (res.Contents ?? []).map(obj => obj.Key!).filter(Boolean);
    } catch {
      return [];
    }
  }

  getStatus(): { bucket: string; region: string; configured: boolean } {
    return { bucket: this.bucket, region: this.region, configured: this.isConfigured };
  }
}

interface UploadResult {
  success: boolean;
  key: string;
  bucket: string;
  simulated: boolean;
  sizeBytes: number;
  error?: string;
}
