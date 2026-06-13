import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async getStats(@TenantSchema() schema: string) {
    const [orderStats, salesStats, recentOrders, productionQueue] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS "ordersToday",
          COUNT(*) FILTER (WHERE status = 'in_production') AS "inProduction",
          COUNT(*) FILTER (WHERE status = 'ready') AS "readyForShipment",
          COUNT(*) FILTER (WHERE status = 'new') AS "newOrders"
        FROM "${schema}".orders
      `),
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          COALESCE(SUM(total), 0) AS "salesToday"
        FROM "${schema}".orders
        WHERE status IN ('payment_verified','in_production','ready','shipped','delivered')
          AND created_at >= CURRENT_DATE
      `),
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          o.id, o.order_number AS "orderNumber", o.status, o.total,
          o.created_at AS "createdAt",
          c.name AS "customerName"
        FROM "${schema}".orders o
        JOIN "${schema}".customers c ON c.id = o.customer_id
        ORDER BY o.created_at DESC
        LIMIT 5
      `),
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          o.id, o.order_number AS "orderNumber", o.status, o.items,
          o.assigned_to AS "assignedTo",
          u.name AS "assignedToName"
        FROM "${schema}".orders o
        LEFT JOIN "${schema}".users u ON u.id = o.assigned_to
        WHERE o.status IN ('payment_verified', 'in_production')
        ORDER BY o.created_at ASC
        LIMIT 5
      `),
    ]);

    const s = orderStats[0];
    return {
      stats: {
        ordersToday: parseInt(s.ordersToday) || 0,
        inProduction: parseInt(s.inProduction) || 0,
        readyForShipment: parseInt(s.readyForShipment) || 0,
        salesToday: parseFloat(salesStats[0]?.salesToday) || 0,
        newOrders: parseInt(s.newOrders) || 0,
      },
      recentOrders,
      productionQueue,
    };
  }
}
