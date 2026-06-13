import { Injectable, Logger, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from './audit-log.service';

/**
 * Staff Service — Tenant user management with RBAC.
 *
 * Features:
 * - tenant-user-management: CRUD for staff members within tenant schema
 * - rbac-validation: Role-based permissions (admin > manager > operator)
 * - jwt-role-extraction: Works with JWT payload { sub, role, tenantSchema }
 *
 * Roles hierarchy:
 * - admin: Full access (manage staff, config, billing)
 * - manager: Orders, products, customers, reports
 * - operator: Orders (view/update), conversations
 *
 * Schema tables: users (within tenant schema)
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────

  /**
   * List all staff members for a tenant.
   */
  async listStaff(schemaName: string): Promise<StaffMember[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, email, name, role, is_active, last_login_at, created_at
      FROM "${schemaName}".users
      ORDER BY created_at ASC
    `);

    return rows.map(r => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      isActive: r.is_active,
      lastLoginAt: r.last_login_at,
      createdAt: r.created_at,
    }));
  }

  /**
   * Get a single staff member.
   */
  async getStaffMember(userId: string, schemaName: string): Promise<StaffMember> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, email, name, role, is_active, last_login_at, created_at FROM "${schemaName}".users WHERE id = $1::uuid`,
      userId,
    );

    if (!rows[0]) throw new NotFoundException('Staff member not found');
    const r = rows[0];
    return { id: r.id, email: r.email, name: r.name, role: r.role, isActive: r.is_active, lastLoginAt: r.last_login_at, createdAt: r.created_at };
  }

  /**
   * Create a new staff member.
   * Only admins can create users. Admins can create any role.
   * Managers can only create operators.
   */
  async createStaff(
    data: CreateStaffDto,
    createdBy: { id: string; role: string },
    schemaName: string,
  ): Promise<StaffMember> {
    // RBAC: validate role assignment
    this.validateRoleAssignment(createdBy.role, data.role);

    // Check email uniqueness within tenant
    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "${schemaName}".users WHERE email = $1`, data.email,
    );
    if (existing[0]) throw new ConflictException('Email already exists in this organization');

    const passwordHash = await bcrypt.hash(data.password, 12);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".users (email, password_hash, name, role, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, email, name, role, is_active, created_at
    `, data.email, passwordHash, data.name, data.role);

    const newUser = rows[0];

    // Audit log
    await this.auditLog.log({
      schemaName,
      action: 'staff_created',
      actorId: createdBy.id,
      targetId: newUser.id,
      details: { email: data.email, role: data.role },
    });

    this.logger.log(`[${schemaName}] Staff created: ${data.email} (${data.role}) by ${createdBy.id}`);

    return { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, isActive: newUser.is_active, lastLoginAt: null, createdAt: newUser.created_at };
  }

  /**
   * Update a staff member (name, role, active status).
   */
  async updateStaff(
    userId: string,
    data: UpdateStaffDto,
    updatedBy: { id: string; role: string },
    schemaName: string,
  ): Promise<StaffMember> {
    // Cannot demote yourself
    if (userId === updatedBy.id && data.role && data.role !== updatedBy.role) {
      throw new ForbiddenException('Cannot change your own role');
    }

    // RBAC: validate role change if applicable
    if (data.role) this.validateRoleAssignment(updatedBy.role, data.role);

    const sets: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.name) { sets.push(`name = $${paramIndex++}`); params.push(data.name); }
    if (data.role) { sets.push(`role = $${paramIndex++}`); params.push(data.role); }
    if (data.isActive !== undefined) { sets.push(`is_active = $${paramIndex++}`); params.push(data.isActive); }

    if (sets.length === 0) return this.getStaffMember(userId, schemaName);

    params.push(userId);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      UPDATE "${schemaName}".users SET ${sets.join(', ')} WHERE id = $${paramIndex}::uuid
      RETURNING id, email, name, role, is_active, last_login_at, created_at
    `, ...params);

    if (!rows[0]) throw new NotFoundException('Staff member not found');

    await this.auditLog.log({
      schemaName,
      action: 'staff_updated',
      actorId: updatedBy.id,
      targetId: userId,
      details: data,
    });

    const r = rows[0];
    return { id: r.id, email: r.email, name: r.name, role: r.role, isActive: r.is_active, lastLoginAt: r.last_login_at, createdAt: r.created_at };
  }

  /**
   * Deactivate a staff member (soft delete).
   */
  async deactivateStaff(
    userId: string,
    deactivatedBy: { id: string; role: string },
    schemaName: string,
  ): Promise<void> {
    if (userId === deactivatedBy.id) throw new ForbiddenException('Cannot deactivate yourself');

    // Check target exists and get their role
    const target = await this.getStaffMember(userId, schemaName);
    this.validateRoleAssignment(deactivatedBy.role, target.role); // Can only deactivate lower roles

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".users SET is_active = false WHERE id = $1::uuid`, userId,
    );

    await this.auditLog.log({
      schemaName,
      action: 'staff_deactivated',
      actorId: deactivatedBy.id,
      targetId: userId,
      details: { email: target.email },
    });
  }

  /**
   * Reset password for a staff member.
   */
  async resetPassword(
    userId: string,
    newPassword: string,
    resetBy: { id: string; role: string },
    schemaName: string,
  ): Promise<void> {
    const target = await this.getStaffMember(userId, schemaName);

    // Only admin can reset others' passwords
    if (userId !== resetBy.id && resetBy.role !== 'admin') {
      throw new ForbiddenException('Only admins can reset other users\' passwords');
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".users SET password_hash = $1 WHERE id = $2::uuid`, hash, userId,
    );

    await this.auditLog.log({
      schemaName,
      action: 'password_reset',
      actorId: resetBy.id,
      targetId: userId,
      details: { self: userId === resetBy.id },
    });
  }

  // ─── RBAC Validation ──────────────────────────────────────────

  private validateRoleAssignment(actorRole: string, targetRole: string): void {
    const hierarchy: Record<string, number> = { admin: 3, manager: 2, operator: 1 };
    const actorLevel = hierarchy[actorRole] ?? 0;
    const targetLevel = hierarchy[targetRole] ?? 0;

    if (actorLevel < targetLevel) {
      throw new ForbiddenException(`Role '${actorRole}' cannot manage role '${targetRole}'`);
    }

    // Managers can only create/manage operators
    if (actorRole === 'manager' && targetRole !== 'operator') {
      throw new ForbiddenException('Managers can only manage operators');
    }
  }

  /**
   * Get permissions for a role (used by frontend for UI rendering).
   */
  getPermissions(role: string): RolePermissions {
    const perms: Record<string, RolePermissions> = {
      admin: {
        canManageStaff: true, canManageProducts: true, canManageOrders: true,
        canViewReports: true, canManageConfig: true, canManageBilling: true,
        canViewConversations: true, canManageChannels: true,
      },
      manager: {
        canManageStaff: false, canManageProducts: true, canManageOrders: true,
        canViewReports: true, canManageConfig: false, canManageBilling: false,
        canViewConversations: true, canManageChannels: false,
      },
      operator: {
        canManageStaff: false, canManageProducts: false, canManageOrders: true,
        canViewReports: false, canManageConfig: false, canManageBilling: false,
        canViewConversations: true, canManageChannels: false,
      },
    };
    return perms[role] ?? perms.operator;
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface CreateStaffDto {
  email: string;
  name: string;
  password: string;
  role: 'admin' | 'manager' | 'operator';
}

export interface UpdateStaffDto {
  name?: string;
  role?: 'admin' | 'manager' | 'operator';
  isActive?: boolean;
}

export interface RolePermissions {
  canManageStaff: boolean;
  canManageProducts: boolean;
  canManageOrders: boolean;
  canViewReports: boolean;
  canManageConfig: boolean;
  canManageBilling: boolean;
  canViewConversations: boolean;
  canManageChannels: boolean;
}
