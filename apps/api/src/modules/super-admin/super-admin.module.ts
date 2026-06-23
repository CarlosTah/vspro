import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { TenantNotificationsCronService } from './tenant-notifications-cron.service';
import { TenantsModule } from '../tenants/tenants.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
    TenantsModule,
    MessagingModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, TenantNotificationsCronService],
})
export class SuperAdminModule {}
