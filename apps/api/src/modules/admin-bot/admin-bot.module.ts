import { Module } from '@nestjs/common';
import { AdminBotService } from './admin-bot.service';
import { AdminBotController } from './admin-bot.controller';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [ReportsModule],
  controllers: [AdminBotController],
  providers: [AdminBotService],
  exports: [AdminBotService],
})
export class AdminBotModule {}
