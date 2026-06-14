import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WorkflowOrchestratorService } from './workflow-orchestrator.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { WorkflowStatus } from '@vspro/shared';

@ApiTags('workflow-orchestrator')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('workflows')
export class WorkflowOrchestratorController {
  constructor(private readonly orchestrator: WorkflowOrchestratorService) {}

  /** List workflow instances with pagination and optional filters */
  @Get()
  @Roles('admin', 'manager')
  getWorkflows(
    @TenantSchema() schema: string,
    @Query('status') status?: WorkflowStatus,
    @Query('type') type?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.orchestrator.getWorkflowInstances(schema, { status, type, limit, offset });
  }

  /** Get recent workflow events (for activity feed) */
  @Get('events')
  @Roles('admin', 'manager')
  getRecentEvents(
    @TenantSchema() schema: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.orchestrator.getRecentEvents(schema, limit);
  }
}
