import { Controller, Get, Post, Param, Body, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReturnsService, CreateReturnDto, ReturnStatus } from './returns.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('returns')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @Roles('admin', 'manager')
  findAll(@TenantSchema() schema: string, @Query('status') status?: ReturnStatus) {
    return this.returns.findAll(schema, status);
  }

  @Get(':id')
  @Roles('admin', 'manager')
  findOne(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.returns.findById(id, schema);
  }

  @Post()
  @Roles('admin', 'manager', 'operator')
  create(@Body() dto: CreateReturnDto & { customerId: string }, @TenantSchema() schema: string) {
    return this.returns.create(dto, dto.customerId, schema);
  }

  @Post(':id/approve')
  @Roles('admin', 'manager')
  approve(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.returns.approve(id, schema);
  }

  @Post(':id/reject')
  @Roles('admin', 'manager')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() body: { reason: string }, @TenantSchema() schema: string) {
    return this.returns.reject(id, body.reason, schema);
  }

  @Post(':id/shipped-back')
  @Roles('admin', 'manager', 'operator')
  shippedBack(@Param('id', ParseUUIDPipe) id: string, @Body() body: { trackingNumber: string }, @TenantSchema() schema: string) {
    return this.returns.markShippedBack(id, body.trackingNumber, schema);
  }

  @Post(':id/received')
  @Roles('admin', 'manager')
  received(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.returns.markReceived(id, schema);
  }

  @Post(':id/process')
  @Roles('admin', 'manager')
  process(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.returns.process(id, schema);
  }
}
