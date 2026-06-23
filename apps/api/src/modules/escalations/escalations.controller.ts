import { Controller, Get, Patch, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('escalations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('escalations')
export class EscalationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('admin', 'manager')
  async list(@TenantSchema() schema: string) {
    try {
      const escalations = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT e.id, e.reason, e.priority, e.status, e.order_number AS "orderNumber",
               e.created_at AS "createdAt", e.resolved_at AS "resolvedAt",
               e.resolved_by AS "resolvedBy", e.resolution_note AS "resolutionNote",
               c.name AS "customerName", c.channel_id AS "customerPhone"
        FROM "${schema}".escalations e
        LEFT JOIN "${schema}".customers c ON c.id = e.customer_id
        ORDER BY
          CASE e.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
          CASE e.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
          e.created_at DESC
        LIMIT 100
      `);
      return escalations;
    } catch {
      return [];
    }
  }

  @Patch(':id/resolve')
  @Roles('admin', 'manager')
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
    @Body() dto: { resolutionNote?: string; resolvedBy?: string },
  ) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".escalations
      SET status = 'resolved', resolved_at = NOW(),
          resolved_by = $1, resolution_note = $2
      WHERE id = $3::uuid
    `, dto.resolvedBy ?? 'admin', dto.resolutionNote ?? '', id);

    return { success: true };
  }

  @Patch(':id/status')
  @Roles('admin', 'manager')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
    @Body() dto: { status: 'open' | 'in_progress' | 'resolved' },
  ) {
    const resolvedClause = dto.status === 'resolved' ? `, resolved_at = NOW()` : '';
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".escalations
      SET status = $1 ${resolvedClause}
      WHERE id = $2::uuid
    `, dto.status, id);

    return { success: true };
  }
}
