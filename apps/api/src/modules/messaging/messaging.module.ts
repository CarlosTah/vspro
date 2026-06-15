import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingFactory } from './messaging-factory.service';
import { WhatsAppChannel } from './channels/whatsapp.channel';
import { MessengerChannel } from './channels/messenger.channel';
import { InstagramChannel } from './channels/instagram.channel';

@Module({
  providers: [
    MessagingService,
    MessagingFactory,
    WhatsAppChannel,
    MessengerChannel,
    InstagramChannel,
  ],
  exports: [MessagingService, MessagingFactory],
})
export class MessagingModule {}
