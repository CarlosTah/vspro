import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@vspro/database';

/**
 * Gestiona clientes Prisma por schema de tenant.
 * Cachea los clientes para reutilizar el pool de conexiones.
 */
@Injectable()
export class TenantPrismaService implements OnModuleDestroy {
  private readonly logger = new Logger(TenantPrismaService.name);
  private readonly clients = new Map<string, PrismaClient>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Retorna un PrismaClient configurado para el schema del tenant.
   * Las queries de este cliente operan dentro del schema indicado.
   */
  forSchema(schemaName: string): PrismaClient {
    if (this.clients.has(schemaName)) {
      return this.clients.get(schemaName)!;
    }

    const baseUrl = this.config.getOrThrow<string>('DATABASE_URL');
    // Añadir el schema como parámetro de conexión
    const url = baseUrl.includes('?')
      ? `${baseUrl}&schema=${schemaName}`
      : `${baseUrl}?schema=${schemaName}`;

    const client = new PrismaClient({
      datasources: { db: { url } },
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });

    this.clients.set(schemaName, client);
    this.logger.debug(`Cliente Prisma creado para schema: ${schemaName}`);

    return client;
  }

  async onModuleDestroy() {
    this.logger.log(`Cerrando ${this.clients.size} conexiones de tenant...`);
    await Promise.all(Array.from(this.clients.values()).map((client) => client.$disconnect()));
    this.clients.clear();
  }
}
