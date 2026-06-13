import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export interface UploadResult {
  key: string;
  url: string;
  presignedUrl?: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    const accessKeyId = this.config.get('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get('AWS_SECRET_ACCESS_KEY');
    this.region = this.config.get('AWS_REGION', 'us-east-1');
    this.bucket = this.config.get('AWS_S3_BUCKET', 'vspro-uploads-dev');

    if (accessKeyId && secretAccessKey) {
      this.s3 = new S3Client({
        region: this.region,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.s3 = null;
      this.logger.warn('AWS credentials no configuradas — storage en modo simulado');
    }
  }

  /**
   * Genera una presigned URL para que el frontend suba directamente a S3.
   * Evita que el archivo pase por el servidor — más rápido y eficiente.
   */
  async getPresignedUploadUrl(
    tenantSlug: string,
    folder: 'products' | 'payments' | 'logos' | 'documents',
    filename: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
    const ext = filename.split('.').pop() ?? 'bin';
    const key = `${tenantSlug}/${folder}/${randomUUID()}.${ext}`;

    if (!this.s3) {
      // Modo simulado
      return {
        uploadUrl: `http://localhost:3001/storage/mock-upload`,
        key,
        publicUrl: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`,
      };
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 }); // 5 min

    return {
      uploadUrl,
      key,
      publicUrl: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`,
    };
  }

  /**
   * Genera una presigned URL para descargar/ver un archivo privado.
   */
  async getPresignedDownloadUrl(key: string): Promise<string> {
    if (!this.s3) {
      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3, command, { expiresIn: 3600 }); // 1 hora
  }

  /**
   * Elimina un archivo de S3.
   */
  async deleteFile(key: string): Promise<void> {
    if (!this.s3) {
      this.logger.debug(`[mock] Delete: ${key}`);
      return;
    }

    await this.s3.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }
}
