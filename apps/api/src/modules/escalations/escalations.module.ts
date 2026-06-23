import { Module } from '@nestjs/common';
import { EscalationsController } from './escalations.controller';

@Module({
  controllers: [EscalationsController],
})
export class EscalationsModule {}
