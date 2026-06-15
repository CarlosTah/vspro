import { Controller, Get, Patch, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StaffNotificationsService, StaffNotificationType } from './staff-notifications.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('staff-notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('staff-notifications')
export class StaffNotificationsController {
  constructor(private readonly staffNotifications: StaffNotificationsService) {}

  /** Get notification preferences for a staff member */
  @Get(':staffId/preferences')
  @Roles('admin', 'manager')
  getPreferences(@Param('staffId', ParseUUIDPipe) staffId: string, @TenantSchema() schema: string) {
    return this.staffNotifications.getPreferences(staffId, schema);
  }

  /** Update notification preferences */
  @Patch(':staffId/preferences')
  @Roles('admin', 'manager')
  updatePreferences(
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body() body: { enabled?: boolean; types?: StaffNotificationType[]; phone?: string },
    @TenantSchema() schema: string,
  ) {
    return this.staffNotifications.updatePreferences(staffId, body, schema);
  }

  /** Send a test notification to a staff member */
  @Post(':staffId/test')
  @Roles('admin')
  sendTest(@Param('staffId', ParseUUIDPipe) staffId: string, @TenantSchema() schema: string) {
    return this.staffNotifications.notifyStaff(
      staffId,
      'new_order',
      '🔔 *Notificación de prueba*\n\nEsta es una notificación de prueba de VSPRO. Si la recibes, las notificaciones están configuradas correctamente. ✅',
      schema,
    );
  }

  /** Broadcast a custom message to all staff */
  @Post('broadcast')
  @Roles('admin')
  broadcast(@Body() body: { message: string; type?: StaffNotificationType }, @TenantSchema() schema: string) {
    return this.staffNotifications.notifyAllStaff(
      body.type ?? 'new_order',
      body.message,
      schema,
    );
  }
}
