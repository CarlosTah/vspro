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

@Module({
  imports: [ProductsModule, OrdersModule, CustomersModule, forwardRef(() => ProactivityModule)],
  controllers: [AiController, CustomerMemoryController],
  providers: [
    AiEngineService,
    AiConfigService,
    AiMemoryService,
    AiToolsExtenderService,
    CustomerMemoryService,
  ],
  exports: [
    AiEngineService,
    AiConfigService,
    AiMemoryService,
    AiToolsExtenderService,
    CustomerMemoryService,
  ],
})
export class AiModule {}
