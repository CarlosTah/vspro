import { Module, Global } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { QuotaService } from './quota.service';

@Global() // QuotaService se usa en guards/interceptors globales
@Module({
  controllers: [BillingController],
  providers: [BillingService, QuotaService],
  exports: [BillingService, QuotaService],
})
export class BillingModule {}
