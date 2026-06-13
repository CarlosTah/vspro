import { Controller, Get, Delete, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProactivityService } from './proactivity.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('proactivity')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('proactivity')
export class ProactivityController {
  constructor(private readonly proactivityService: ProactivityService) {}

  /** List all pending follow-ups for the tenant */
  @Get('follow-ups')
  @Roles('admin', 'manager')
  getPendingFollowUps(@TenantSchema() schema: string) {
    return this.proactivityService.getPendingFollowUps(schema);
  }

  /** Cancel a pending follow-up */
  @Delete('follow-ups/:conversationId')
  @Roles('admin', 'manager')
  async cancelFollowUp(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @TenantSchema() schema: string,
  ) {
    await this.proactivityService.cancelFollowUp(conversationId, schema);
    return { success: true, message: 'Follow-up cancelled' };
  }
}
