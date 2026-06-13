import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { InviteUserDto, UpdateUserRoleDto } from './dto/team.dto';

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, email, name, role,
        is_active AS "isActive",
        created_at AS "createdAt",
        last_login_at AS "lastLoginAt"
      FROM "${schemaName}".users
      ORDER BY created_at ASC
    `);
  }

  async inviteUser(dto: InviteUserDto, schemaName: string) {
    // Verificar que el email no exista
    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "${schemaName}".users WHERE email = $1`,
      dto.email,
    );
    if (existing.length > 0) {
      throw new ConflictException(`Ya existe un usuario con email ${dto.email}`);
    }

    // Generar contraseña temporal si no se proporcionó
    const password = dto.password ?? this.generateTempPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".users (email, password_hash, name, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, name, role, is_active AS "isActive", created_at AS "createdAt"
    `, dto.email, passwordHash, dto.name, dto.role);

    return {
      user: rows[0],
      tempPassword: dto.password ? undefined : password,
      message: dto.password
        ? `Usuario ${dto.name} creado con la contraseña proporcionada`
        : `Usuario ${dto.name} creado. Contraseña temporal: ${password}`,
    };
  }

  async updateRole(userId: string, dto: UpdateUserRoleDto, schemaName: string) {
    const users = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, role FROM "${schemaName}".users WHERE id = $1::uuid`,
      userId,
    );
    if (!users[0]) throw new NotFoundException('Usuario no encontrado');

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".users SET role = $1 WHERE id = $2::uuid`,
      dto.role,
      userId,
    );

    return { success: true, message: `Rol actualizado a ${dto.role}` };
  }

  async deactivateUser(userId: string, currentUserId: string, schemaName: string) {
    if (userId === currentUserId) {
      throw new ForbiddenException('No puedes desactivar tu propia cuenta');
    }

    const users = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "${schemaName}".users WHERE id = $1::uuid`,
      userId,
    );
    if (!users[0]) throw new NotFoundException('Usuario no encontrado');

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".users SET is_active = false WHERE id = $1::uuid`,
      userId,
    );

    return { success: true, message: 'Usuario desactivado' };
  }

  async reactivateUser(userId: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".users SET is_active = true WHERE id = $1::uuid`,
      userId,
    );
    return { success: true, message: 'Usuario reactivado' };
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass + '!';
  }
}
