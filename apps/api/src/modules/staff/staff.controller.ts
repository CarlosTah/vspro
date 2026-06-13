import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService, CreateStaffDto, UpdateStaffDto } from './staff.service';
import { AuditLogService } from './audit-log.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('staff')
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** List all staff members */
  @Get()
  @Roles('admin', 'manager')
  list(@TenantSchema() schema: string) {
    return this.staff.listStaff(schema);
  }

  /** Get single staff member */
  @Get(':id')
  @Roles('admin', 'manager')
  getOne(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.staff.getStaffMember(id, schema);
  }

  /** Create new staff member */
  @Post()
  @Roles('admin', 'manager')
  create(@Body() dto: CreateStaffDto, @Req() req: any, @TenantSchema() schema: string) {
    const actor = { id: req.user.sub, role: req.user.role };
    return this.staff.createStaff(dto, actor, schema);
  }

  /** Update staff member */
  @Patch(':id')
  @Roles('admin', 'manager')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto, @Req() req: any, @TenantSchema() schema: string) {
    const actor = { id: req.user.sub, role: req.user.role };
    return this.staff.updateStaff(id, dto, actor, schema);
  }

  /** Deactivate staff member */
  @Delete(':id')
  @Roles('admin')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @Req() req: any, @TenantSchema() schema: string) {
    const actor = { id: req.user.sub, role: req.user.role };
    return this.staff.deactivateStaff(id, actor, schema);
  }

  /** Reset password */
  @Post(':id/reset-password')
  @Roles('admin')
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() body: { password: string }, @Req() req: any, @TenantSchema() schema: string) {
    const actor = { id: req.user.sub, role: req.user.role };
    return this.staff.resetPassword(id, body.password, actor, schema);
  }

  /** Get permissions for current user's role */
  @Get('me/permissions')
  @Roles('admin', 'manager', 'operator')
  getMyPermissions(@Req() req: any) {
    return this.staff.getPermissions(req.user.role);
  }

  /** Get audit logs */
  @Get('audit/recent')
  @Roles('admin')
  getAuditLogs(@TenantSchema() schema: string) {
    return this.auditLog.getRecentLogs(schema);
  }
}
