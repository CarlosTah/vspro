import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { TenantPrismaService } from '../../database/tenant-prisma.service';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string, tenantSlug: string) {
    // 1. Resolver tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: { plan: true },
    });

    if (!tenant) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 2. Buscar usuario en el schema del tenant usando raw SQL
    // (las tablas del tenant no están en el schema de Prisma)
    const db = this.tenantPrisma.forSchema(tenant.schemaName);
    const users = await db.$queryRawUnsafe<any[]>(
      `SELECT id, email, password_hash as "passwordHash", name, role, is_active as "isActive" 
       FROM "${tenant.schemaName}".users 
       WHERE email = $1`,
      email,
    );

    const user = users[0];
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 3. Verificar contraseña
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 4. Generar JWT con contexto del tenant
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      tenantId: tenant.id,
      tenantSchema: tenant.schemaName,
      tenantSlug: tenant.slug,
      role: user.role,
    };

    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        businessName: tenant.businessName,
        plan: tenant.plan.slug,
        industry: (tenant.settings as any)?.industry ?? null,
      },
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    schemaName: string,
  ) {
    const db = this.tenantPrisma.forSchema(schemaName);
    
    const users = await db.$queryRawUnsafe<any[]>(
      `SELECT id, password_hash as "passwordHash" 
       FROM "${schemaName}".users 
       WHERE id = $1`,
      userId,
    );

    const user = users[0];
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Contraseña actual incorrecta');

    const hash = await bcrypt.hash(newPassword, 12);
    await db.$executeRawUnsafe(
      `UPDATE "${schemaName}".users SET password_hash = $1 WHERE id = $2`,
      hash,
      userId,
    );

    return { success: true };
  }

  async updateUserProfile(userId: string, dto: { phone?: string; name?: string }, schemaName: string) {
    // Ensure phone column exists
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`
    );

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(dto.phone); }
    if (dto.name !== undefined) { fields.push(`name = $${idx++}`); values.push(dto.name); }

    if (fields.length === 0) return;

    values.push(userId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".users SET ${fields.join(', ')} WHERE id = $${idx}::uuid`,
      ...values,
    );
  }
}
