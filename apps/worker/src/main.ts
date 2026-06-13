import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const logger = new Logger('Worker');

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });

  logger.log('═══════════════════════════════════════════');
  logger.log('  VSPRO Worker — Background Processors');
  logger.log('═══════════════════════════════════════════');
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  logger.log(`Redis: ${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? '6380'}`);
  logger.log('');
  logger.log('Active processors:');
  logger.log('  • messages          — AI message processing');
  logger.log('  • production-queue  — Order → production injection');
  logger.log('  • inventory-events  — Stock commit/release');
  logger.log('  • proactive-outreach — Scheduled follow-ups');
  logger.log('');
  logger.log('Active crons:');
  logger.log('  • Proactivity scan  — every 60s');
  logger.log('  • Inventory scan    — every 6h');
  logger.log('  • Finance reconcile — daily 6:00 AM');
  logger.log('═══════════════════════════════════════════');

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.log(`Received ${signal} — shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  }
}

bootstrap();
