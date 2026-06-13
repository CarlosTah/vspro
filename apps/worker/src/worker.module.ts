import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';

// Database
import { DatabaseModule } from './database/database.module';

// Processors
import { MessageProcessor } from './processors/message.processor';
import { ProductionFlowProcessor } from './processors/production-flow.processor';
import { InventoryEventsProcessor } from './processors/inventory-events.processor';
import { ProactiveOutreachProcessor } from './processors/proactive-outreach.processor';

// Crons
import { CronSchedulerService } from './crons/cron-scheduler.service';

// Shared services needed by processors
import { CustomerMemoryService } from './services/customer-memory.service';
import { AgentRouterService } from './services/agent-router.service';

@Module({
  imports: [
    // Environment config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env.local', '.env.local', '.env'],
    }),

    // Cron scheduling
    ScheduleModule.forRoot(),

    // BullMQ queues
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6380),
          password: config.get('REDIS_PASSWORD'),
        },
      }),
    }),

    // Register all queues this worker processes
    BullModule.registerQueue(
      { name: 'messages' },
      { name: 'production-queue' },
      { name: 'inventory-events' },
      { name: 'proactive-outreach' },
    ),

    // Database access
    DatabaseModule,
  ],
  providers: [
    // Processors (BullMQ consumers)
    MessageProcessor,
    ProductionFlowProcessor,
    InventoryEventsProcessor,
    ProactiveOutreachProcessor,

    // Cron jobs
    CronSchedulerService,

    // Shared services
    CustomerMemoryService,
    AgentRouterService,
  ],
})
export class WorkerModule {}
