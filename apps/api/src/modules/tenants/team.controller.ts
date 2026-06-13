import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, Req, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TeamService } from './team.service';
import { InviteUserDto, UpdateUserRoleDto } from './dto/team.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('team')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  listUsers(@TenantSchema() schema: string) {
    return this.teamService.listUsers(schema);
  }

  @Post('invite')
  invite(@Body() dto: InviteUserDto, @TenantSchema() schema: string) {
    return this.teamService.inviteUser(dto, schema);
  }

  @Patch(':id/role')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @TenantSchema() schema: string,
  ) {
    return this.teamService.updateRole(id, dto, schema);
  }

  @Delete(':id')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @TenantSchema() schema: string,
  ) {
    return this.teamService.deactivateUser(id, req.user.sub, schema);
  }

  @Post(':id/reactivate')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.teamService.reactivateUser(id, schema);
  }
}
