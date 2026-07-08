import { Module, forwardRef } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiEngineService } from './ai-engine.service';
import { AiConfigService } from './ai-config.service';
import { AiMemoryService } from './ai-memory.service';
import { AiToolsExtenderService } from './ai-tools-extender.service';
import { CustomerMemoryService } from './customer-memory.service';
import { CustomerMemoryController } from './customer-memory.controller';
import { ProductsModule } from '../products/products.module';
import { OrdersModule } from '../orders/orders.module';
import { CustomersModule } from '../customers/customers.module';
import { ProactivityModule } from '../proactivity/proactivity.module';
import { TenantsModule } from '../tenants/tenants.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { IntentClassifierService } from './state-machine/intent-classifier';
import { TextGeneratorService } from './state-machine/text-generator';
import { StateMachineOrchestratorService } from './state-machine/state-machine-orchestrator.service';

@Module({
  imports: [ProductsModule, OrdersModule, CustomersModule, forwardRef(() => ProactivityModule), forwardRef(() => TenantsModule), KnowledgeBaseModule, BillingModule, NotificationsModule, PromotionsModule, LoyaltyModule],
  controllers: [AiController, CustomerMemoryController],
  providers: [
    AiEngineService,
    AiConfigService,
    AiMemoryService,
    AiToolsExtenderService,
    CustomerMemoryService,
    IntentClassifierService,
    TextGeneratorService,
    StateMachineOrchestratorService,
  ],
  exports: [
    AiEngineService,
    AiConfigService,
    AiMemoryService,
    AiToolsExtenderService,
    CustomerMemoryService,
    StateMachineOrchestratorService,
  ],
})
export class AiModule {}
