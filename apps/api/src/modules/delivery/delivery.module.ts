import { Module } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { DeliverySettingsController } from './delivery-settings.controller';
import { DeliveryTrackingController } from './delivery-tracking.controller';
import { NotificationSettingsController } from './notification-settings.controller';
import { DeliveryDispatchCronService } from './delivery-dispatch-cron.service';
import { MessagingModule } from '../messaging/messaging.module';
import { OrdersModule } from '../orders/orders.module';

/**
 * Delivery Module — Motorepartidores por WhatsApp.
 *
 * Flujo:
 * 1. Pedido marcado como "ready" + tiene dirección de envío
 * 2. Sistema busca repartidor disponible
 * 3. Envía WhatsApp al repartidor con detalles del pedido
 * 4. Repartidor responde "SÍ" → se asigna
 * 5. Si rechaza → se ofrece al siguiente
 * 6. Cliente recibe notificación "Tu pedido va en camino"
 * 7. Repartidor confirma entrega → pedido status "delivered"
 *
 * Tablas en tenant schema:
 * - delivery_drivers (nombre, teléfono, status)
 * - delivery_assignments (order_id, driver_id, status, timestamps)
 */
@Module({
  imports: [MessagingModule, OrdersModule],
  controllers: [DeliveryController, DeliverySettingsController, DeliveryTrackingController, NotificationSettingsController],
  providers: [DeliveryService, DeliveryDispatchCronService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
