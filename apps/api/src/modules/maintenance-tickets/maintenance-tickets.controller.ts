import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MaintenanceTicketsService, CreateTicketDto, TicketStatus } from './maintenance-tickets.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('maintenance-tickets')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('maintenance-tickets')
export class MaintenanceTicketsController {
  constructor(private readonly tickets: MaintenanceTicketsService) {}

  @Post()
  @Roles('admin', 'manager', 'operator')
  create(@Body() dto: CreateTicketDto, @TenantSchema() schema: string) { return this.tickets.create(dto, schema); }

  @Get()
  @Roles('admin', 'manager', 'operator')
  findAll(@TenantSchema() schema: string, @Query('status') status?: TicketStatus) { return this.tickets.findAll(schema, status); }

  @Get(':id')
  @Roles('admin', 'manager', 'operator')
  findOne(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) { return this.tickets.findById(id, schema); }

  @Post(':id/assign')
  @Roles('admin', 'manager')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() body: { providerId: string }, @TenantSchema() schema: string) { return this.tickets.assign(id, body.providerId, schema); }

  @Post(':id/quote')
  @Roles('admin', 'manager', 'operator')
  quote(@Param('id', ParseUUIDPipe) id: string, @Body() body: { amount: number; description: string }, @TenantSchema() schema: string) { return this.tickets.addQuote(id, body.amount, body.description, schema); }

  @Post(':id/authorize')
  @Roles('admin', 'manager')
  authorize(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) { return this.tickets.authorize(id, schema); }

  @Post(':id/complete')
  @Roles('admin', 'manager', 'operator')
  complete(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) { return this.tickets.complete(id, schema); }
}
