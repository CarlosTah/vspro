import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MessagingFactory } from '../messaging/messaging-factory.service';

export type TicketStatus = 'open' | 'assigned' | 'quoted' | 'authorized' | 'in_progress' | 'completed' | 'cancelled';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CreateTicketDto {
  customerId: string;
  propertyId?: string;
  category: string; // plumbing, electrical, ac, general
  description: string;
  mediaUrls?: string[]; // photos/videos of the issue
  priority?: TicketPriority;
}

/**
 * Maintenance Tickets — Report issues with photos/videos, dispatch to providers.
 * Used by: inmobiliarias (inquilinos reportan fallas), propiedades en renta.
 */
@Injectable()
export class MaintenanceTicketsService {
  private readonly logger = new Logger(MaintenanceTicketsService.name);

  constructor(private readonly prisma: PrismaService, private readonly messagingFactory: MessagingFactory) {}

  async create(dto: CreateTicketDto, schemaName: string) {
    const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".maintenance_tickets
        (ticket_number, customer_id, property_id, category, description, media_urls, priority, status)
      VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb, $7, 'open')
      RETURNING id, ticket_number AS "ticketNumber", status, priority, created_at AS "createdAt"
    `, ticketNumber, dto.customerId, dto.propertyId ?? null, dto.category, dto.description,
      JSON.stringify(dto.mediaUrls ?? []), dto.priority ?? 'medium');
    this.logger.log(`[${schemaName}] Ticket created: ${ticketNumber}`);
    return rows[0];
  }

  async assign(ticketId: string, providerId: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".maintenance_tickets SET status = 'assigned', assigned_provider_id = $1, assigned_at = NOW() WHERE id = $2::uuid
    `, providerId, ticketId);
    // Notify provider via WhatsApp
    const provider = await this.prisma.$queryRawUnsafe<any[]>(`SELECT name, phone FROM "${schemaName}".service_providers WHERE id = $1::uuid`, providerId);
    if (provider[0]?.phone) {
      const ticket = await this.findById(ticketId, schemaName);
      await this.messagingFactory.sendText(provider[0].phone, `🔧 *Nuevo trabajo asignado*\n\n${ticket.ticketNumber}\n📋 ${ticket.category}: ${ticket.description}\n\n¿Puedes cotizar?`, 'whatsapp', schemaName);
    }
    return this.findById(ticketId, schemaName);
  }

  async addQuote(ticketId: string, amount: number, description: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".maintenance_tickets SET status = 'quoted', quote_amount = $1, quote_description = $2, quoted_at = NOW() WHERE id = $3::uuid
    `, amount, description, ticketId);
    return this.findById(ticketId, schemaName);
  }

  async authorize(ticketId: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`UPDATE "${schemaName}".maintenance_tickets SET status = 'authorized', authorized_at = NOW() WHERE id = $1::uuid`, ticketId);
    return this.findById(ticketId, schemaName);
  }

  async complete(ticketId: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`UPDATE "${schemaName}".maintenance_tickets SET status = 'completed', completed_at = NOW() WHERE id = $1::uuid`, ticketId);
    return this.findById(ticketId, schemaName);
  }

  async findAll(schemaName: string, status?: TicketStatus) {
    const where = status ? `WHERE t.status = $1` : '';
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT t.id, t.ticket_number AS "ticketNumber", t.status, t.priority, t.category, t.description,
             t.media_urls AS "mediaUrls", t.quote_amount AS "quoteAmount", t.created_at AS "createdAt",
             c.name AS "customerName"
      FROM "${schemaName}".maintenance_tickets t JOIN "${schemaName}".customers c ON c.id = t.customer_id
      ${where} ORDER BY t.created_at DESC
    `, ...(status ? [status] : []));
  }

  async findById(ticketId: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT t.*, c.name AS "customerName" FROM "${schemaName}".maintenance_tickets t
      JOIN "${schemaName}".customers c ON c.id = t.customer_id WHERE t.id = $1::uuid
    `, ticketId);
    if (!rows[0]) throw new NotFoundException('Ticket not found');
    return rows[0];
  }
}
