import { Module } from '@nestjs/common';
import { PreferenceVectorsService } from './preference-vectors.service';
import { PurchaseHistoryService } from './purchase-history.service';
import { ClientIntelligenceController } from './client-intelligence.controller';

@Module({
  controllers: [ClientIntelligenceController],
  providers: [PreferenceVectorsService, PurchaseHistoryService],
  exports: [PreferenceVectorsService, PurchaseHistoryService],
})
export class ClientIntelligenceModule {}
