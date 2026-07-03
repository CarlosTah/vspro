import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';

import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProductionModule } from './modules/production/production.module';
import { BillingModule } from './modules/billing/billing.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { StorageModule } from './modules/storage/storage.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { EventsModule } from './modules/events/events.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { RentalModule } from './modules/rental/rental.module';
import { ProactivityModule } from './modules/proactivity/proactivity.module';
import { AdminBotModule } from './modules/admin-bot/admin-bot.module';
import { ClientIntelligenceModule } from './modules/client-intelligence/client-intelligence.module';
import { ReportsModule } from './modules/reports/reports.module';
import { WorkflowOrchestratorModule } from './modules/workflow-orchestrator/workflow-orchestrator.module';
import { HumanAuditModule } from './modules/human-audit/human-audit.module';
import { AgentOrchestratorModule } from './modules/agent-orchestrator/agent-orchestrator.module';
import { MenuVisionModule } from './modules/menu-vision/menu-vision.module';
import { KitchenModule } from './modules/kitchen/kitchen.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { AudioModule } from './modules/audio/audio.module';
import { StaffNotificationsModule } from './modules/staff-notifications/staff-notifications.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { ServiceRemindersModule } from './modules/service-reminders/service-reminders.module';
import { AssetRegistryModule } from './modules/asset-registry/asset-registry.module';
import { MaintenanceTicketsModule } from './modules/maintenance-tickets/maintenance-tickets.module';
import { IssueClassifierModule } from './modules/issue-classifier/issue-classifier.module';
import { UrgencyDetectionModule } from './modules/urgency-detection/urgency-detection.module';
import { ProductCollectionsModule } from './modules/product-collections/product-collections.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { EscalationsModule } from './modules/escalations/escalations.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { MediaAssetsModule } from './modules/media-assets/media-assets.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';

@Module({
  imports: [
    // Configuración global desde variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'],
    }),

    // Rate limiting: protege contra abuso por tenant
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 60_000,
        limit: 200,
      },
    ]),

    // Cola de mensajes con BullMQ sobre Redis
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
        },
      }),
    }),

    DatabaseModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    WebhooksModule,
    OrdersModule,
    ProductsModule,
    CustomersModule,
    ConversationsModule,
    PaymentsModule,
    InventoryModule,
    ProductionModule,
    BillingModule,
    MessagingModule,
    ShipmentsModule,
    StorageModule,
    ChannelsModule,
    EventsModule,
    SuperAdminModule,
    InvoicingModule,
    LogisticsModule,
    RentalModule,
    ProactivityModule,
    AdminBotModule,
    ClientIntelligenceModule,
    ReportsModule,
    WorkflowOrchestratorModule,
    HumanAuditModule,
    AgentOrchestratorModule,
    MenuVisionModule,
    KitchenModule,
    DeliveryModule,
    AudioModule,
    StaffNotificationsModule,
    ReturnsModule,
    ServiceRemindersModule,
    AssetRegistryModule,
    MaintenanceTicketsModule,
    IssueClassifierModule,
    UrgencyDetectionModule,
    ProductCollectionsModule,
    KnowledgeBaseModule,
    NotificationsModule,
    EscalationsModule,
    TicketsModule,
    ReservationsModule,
    MediaAssetsModule,
    PromotionsModule,
    LoyaltyModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // El middleware de tenant se aplica a todas las rutas
    // excepto las públicas (health, webhooks de Stripe, registro)
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/(.*)', method: RequestMethod.GET },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'tenants/register', method: RequestMethod.POST },
        { path: 'tenants/onboarding', method: RequestMethod.POST },
        { path: 'tenants/check-slug', method: RequestMethod.GET },
        { path: 'webhooks/stripe', method: RequestMethod.POST },
        { path: 'billing/webhook', method: RequestMethod.POST },
        { path: 'docs', method: RequestMethod.GET },
        { path: 'docs/(.*)', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
