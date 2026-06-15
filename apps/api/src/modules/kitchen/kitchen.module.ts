import { Module } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { KitchenController } from './kitchen.controller';
import { OrdersModule } from '../orders/orders.module';

/**
 * Kitchen Display System (KDS) Module.
 *
 * Real-time kitchen view for food businesses:
 * - Orders queue: new → in_production → ready
 * - Timer per order (time since received)
 * - Transition buttons (start cooking, mark ready)
 * - Print ticket (PDF generation for thermal printers)
 * - WebSocket real-time updates (via EventsGateway)
 *
 * Designed for: taquerías, panaderías, cocinas, cafés
 * Display: tablet/monitor in cocina showing pending orders
 */
@Module({
  imports: [OrdersModule],
  controllers: [KitchenController],
  providers: [KitchenService],
  exports: [KitchenService],
})
export class KitchenModule {}
