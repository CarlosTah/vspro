import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { MessageProcessor } from './message.processor';
import { ConversationsModule } from '../conversations/conversations.module';
import { CustomersModule } from '../customers/customers.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AiModule } from '../ai/ai.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'messages' }),
    ConversationsModule,
    CustomersModule,
    MessagingModule,
    AiModule,
    PaymentsModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, MessageProcessor],
  exports: [WebhooksService],
})
export class WebhooksModule {}
