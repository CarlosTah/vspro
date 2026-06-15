import { Controller, Get, Post, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ServiceRemindersService, CreateServiceReminderDto } from './service-reminders.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('service-reminders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('service-reminders')
export class ServiceRemindersController {
  constructor(private readonly reminders: ServiceRemindersService) {}

  @Post()
  @Roles('admin', 'manager', 'operator')
  create(@Body() dto: CreateServiceReminderDto, @TenantSchema() schema: string) {
    return this.reminders.create(dto, schema);
  }

  @Get('customer/:customerId')
  @Roles('admin', 'manager', 'operator')
  getByCustomer(@Param('customerId', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.reminders.getByCustomer(id, schema);
  }

  @Post(':id/complete')
  @Roles('admin', 'manager', 'operator')
  complete(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.reminders.complete(id, schema);
  }

  @Get('due')
  @Roles('admin', 'manager')
  getDue(@TenantSchema() schema: string) {
    return this.reminders.getDueReminders(schema);
  }
}
