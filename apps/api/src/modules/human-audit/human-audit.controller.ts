import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HumanAuditService } from './human-audit.service';
import { AuditTrailService } from './audit-trail.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ApprovalType, ApprovalStatus, DecideApprovalDto, ApprovalRule } from './types';

@ApiTags('human-audit')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('audit')
export class HumanAuditController {
  constructor(
    private readonly humanAudit: HumanAuditService,
    private readonly auditTrail: AuditTrailService,
  ) {}

  // ─── Approval Requests ────────────────────────────────────────

  /** Get pending approval requests */
  @Get('approvals/pending')
  @Roles('admin', 'manager')
  getPending(@TenantSchema() schema: string) {
    return this.humanAudit.getPendingApprovals(schema);
  }

  /** Get approval history with filters */
  @Get('approvals')
  @Roles('admin', 'manager')
  getHistory(
    @TenantSchema() schema: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
    @Query('type') type?: ApprovalType,
    @Query('status') status?: ApprovalStatus,
  ) {
    return this.humanAudit.getApprovalHistory(schema, { limit, offset, type, status });
  }

  /** Approve or reject a pending request */
  @Post('approvals/:id/decide')
  @Roles('admin', 'manager')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideApprovalDto,
    @TenantSchema() schema: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    const userRole = req.user?.role ?? 'admin';
    const tenantId = req.user?.tenantId ?? req.tenantId;
    return this.humanAudit.decide(id, dto, userId, userRole, schema, tenantId);
  }

  // ─── Approval Rules Configuration ────────────────────────────

  /** Get current approval rules */
  @Get('rules')
  @Roles('admin')
  getRules(@TenantSchema() schema: string) {
    return this.humanAudit.getApprovalRules(schema);
  }

  /** Update approval rules */
  @Patch('rules')
  @Roles('admin')
  updateRules(@TenantSchema() schema: string, @Body() rules: ApprovalRule[]) {
    return this.humanAudit.updateApprovalRules(schema, rules);
  }

  // ─── Audit Trail ──────────────────────────────────────────────

  /** Get recent audit entries */
  @Get('trail')
  @Roles('admin', 'manager')
  getTrail(
    @TenantSchema() schema: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
    @Query('module') module?: string,
    @Query('action') action?: string,
  ) {
    return this.auditTrail.getRecent(schema, { limit, offset, module, action });
  }

  /** Get audit trail for a specific entity */
  @Get('trail/:entityType/:entityId')
  @Roles('admin', 'manager')
  getEntityTrail(
    @TenantSchema() schema: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditTrail.getEntityHistory(schema, entityType, entityId);
  }
}
