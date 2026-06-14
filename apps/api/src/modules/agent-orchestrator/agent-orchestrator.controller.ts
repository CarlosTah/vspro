import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AgentSupervisorService } from './agent-supervisor.service';
import { AgentRegistryService } from './agent-registry.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('agent-orchestrator')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('orchestrator')
export class AgentOrchestratorController {
  constructor(
    private readonly supervisor: AgentSupervisorService,
    private readonly registry: AgentRegistryService,
  ) {}

  /** Execute an objective through the multi-agent supervisor */
  @Post('execute')
  @Roles('admin', 'manager')
  execute(
    @Body() body: { objective: string; context?: Record<string, any> },
    @TenantSchema() schema: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    const tenantId = req.user?.tenantId ?? req.tenantId;
    return this.supervisor.executeObjective(
      body.objective,
      tenantId,
      schema,
      userId,
      { schemaName: schema, ...body.context },
    );
  }

  /** Get a specific session by ID */
  @Get('sessions/:id')
  @Roles('admin', 'manager')
  getSession(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.supervisor.getSession(id, schema);
  }

  /** Get recent orchestrator sessions */
  @Get('sessions')
  @Roles('admin', 'manager')
  getSessions(
    @TenantSchema() schema: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    return this.supervisor.getRecentSessions(schema, limit);
  }

  /** List available agents and their capabilities */
  @Get('agents')
  @Roles('admin', 'manager')
  getAgents() {
    return this.registry.getAllAgents().map(a => ({
      name: a.name,
      description: a.description,
      domains: a.domains,
      riskLevel: a.riskLevel,
      requiresApproval: a.requiresApproval,
    }));
  }
}
