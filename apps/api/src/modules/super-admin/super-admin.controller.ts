import {
  Controller, Get, Post, Param, UseGuards, Req, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuperAdminService } from './super-admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('super-admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin') // Only tenant admins can access (super_admin role in future)
@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('stats')
  getStats() {
    return this.superAdminService.getStats();
  }

  @Get('tenants')
  listTenants() {
    return this.superAdminService.listTenants();
  }

  @Get('tenants/:id')
  getTenantDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.superAdminService.getTenantDetail(id);
  }

  @Post('tenants/:id/impersonate')
  impersonate(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.superAdminService.impersonate(id, req.user.sub);
  }

  @Post('tenants/:id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.superAdminService.suspendTenant(id);
  }

  @Post('tenants/:id/reactivate')
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.superAdminService.reactivateTenant(id);
  }
}
