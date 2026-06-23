import { Controller, Get, Post, Patch, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('admin', 'manager')
  async list(@TenantSchema() schema: string) {
    await this.ensureTable(schema);
    const tickets = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT t.id, t.ticket_number AS "ticketNumber", t.subject, t.description,
             t.priority, t.status, t.assigned_to AS "assignedTo",
             t.created_at AS "createdAt", t.resolved_at AS "resolvedAt",
             t.resolution_note AS "resolutionNote",
             c.name AS "customerName", c.channel_id AS "customerPhone",
             t.conversation_id AS "conversationId"
      FROM "${schema}".support_tickets t
      LEFT JOIN "${schema}".customers c ON c.id = t.customer_id
      ORDER BY
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        t.created_at DESC
      LIMIT 100
    `);
    return tickets;
  }

  @Get(':id')
  @Roles('admin', 'manager')
  async getDetail(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    const tickets = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT t.*, c.name AS "customerName", c.channel_id AS "customerPhone"
      FROM "${schema}".support_tickets t
      LEFT JOIN "${schema}".customers c ON c.id = t.customer_id
      WHERE t.id = $1::uuid
    `, id);
    return tickets[0] ?? null;
  }

  @Patch(':id/assign')
  @Roles('admin', 'manager')
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
    @Body() dto: { assignedTo: string },
  ) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".support_tickets
      SET assigned_to = $1, status = 'in_progress', updated_at = NOW()
      WHERE id = $2::uuid
    `, dto.assignedTo, id);
    return { success: true };
  }

  @Patch(':id/resolve')
  @Roles('admin', 'manager')
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
    @Body() dto: { resolutionNote?: string },
  ) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".support_tickets
      SET status = 'resolved', resolved_at = NOW(), resolution_note = $1, updated_at = NOW()
      WHERE id = $2::uuid
    `, dto.resolutionNote ?? '', id);
    return { success: true };
  }

  @Patch(':id/close')
  @Roles('admin', 'manager')
  async close(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".support_tickets
      SET status = 'closed', updated_at = NOW()
      WHERE id = $2::uuid
    `, id);
    return { success: true };
  }

  @Post(':id/reply')
  @Roles('admin', 'manager')
  async reply(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
    @Body() dto: { message: string },
  ) {
    // Add reply as internal note on the ticket
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".support_tickets
      SET resolution_note = COALESCE(resolution_note, '') || E'\n[' || NOW()::text || '] ' || $1,
          status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
          updated_at = NOW()
      WHERE id = $2::uuid
    `, dto.message, id);
    return { success: true };
  }

  private async ensureTable(schema: string) {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schema}".support_tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_number VARCHAR(50) NOT NULL,
        conversation_id UUID,
        customer_id UUID,
        subject VARCHAR(255) NOT NULL,
        description TEXT,
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        assigned_to VARCHAR(255),
        resolution_note TEXT,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
}
