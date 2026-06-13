import { PrismaClient } from '@prisma/client';

/**
 * Crea un PrismaClient configurado para operar dentro del schema
 * de un tenant específico. Cambia el search_path de PostgreSQL
 * para que todas las queries apunten al schema correcto.
 *
 * IMPORTANTE: Este cliente debe usarse únicamente dentro del contexto
 * de un request autenticado donde el tenant ya fue resuelto.
 */
export class TenantPrismaService {
  private clients = new Map<string, PrismaClient>();

  /**
   * Obtiene (o crea) un PrismaClient para el schema del tenant.
   * Los clientes se cachean por schemaName para reutilizar el pool de conexiones.
   */
  forSchema(schemaName: string): PrismaClient {
    if (this.clients.has(schemaName)) {
      return this.clients.get(schemaName)!;
    }

    const client = new PrismaClient({
      datasources: {
        db: {
          url: `${process.env.DATABASE_URL}?schema=${schemaName}`,
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });

    this.clients.set(schemaName, client);
    return client;
  }

  /**
   * Cierra todas las conexiones. Llamar en shutdown del proceso.
   */
  async disconnectAll(): Promise<void> {
    await Promise.all(Array.from(this.clients.values()).map((client) => client.$disconnect()));
    this.clients.clear();
  }
}
