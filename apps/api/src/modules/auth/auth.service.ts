import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { TenantPrismaService } from '../../database/tenant-prisma.service';
import { EmailService } from '../email/email.service';
import { JwtPayload } from './strategies/jwt.strategy';

interface PasswordResetPayload {
  sub: string;
  tenantSchema: string;
  tenantSlug: string;
  purpose: 'password_reset';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string, tenantSlug: string) {
    // 1. Resolver tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: { plan: true },
    });

    if (!tenant) {
      throw new UnauthorizedException('El negocio no existe. Verifica el slug (URL del negocio).');
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
    if (!user) {
      throw new UnauthorizedException('El correo electrónico no está registrado en este negocio.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Tu cuenta está desactivada. Contacta al administrador.');
    }

    // 3. Verificar contraseña
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Contraseña incorrecta.');
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

  async updateUserProfile(
    userId: string,
    dto: { phone?: string; name?: string },
    schemaName: string,
  ) {
    // Ensure phone column exists
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`,
    );

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(dto.phone);
    }
    if (dto.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(dto.name);
    }

    if (fields.length === 0) return;

    values.push(userId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".users SET ${fields.join(', ')} WHERE id = $${idx}::uuid`,
      ...values,
    );
  }

  // ─── Password Recovery ─────────────────────────────────────────

  /**
   * Generates a password reset token and sends it via email.
   * Always returns success (to avoid email enumeration attacks).
   */
  async forgotPassword(email: string, tenantSlug: string): Promise<{ success: boolean }> {
    try {
      // 1. Resolve tenant
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });

      if (!tenant) {
        // Don't reveal that the tenant doesn't exist
        return { success: true };
      }

      // 2. Find user
      const users = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, email, name, is_active as "isActive"
         FROM "${tenant.schemaName}".users
         WHERE email = $1`,
        email,
      );

      const user = users[0];
      if (!user || !user.isActive) {
        // Don't reveal that the user doesn't exist
        return { success: true };
      }

      // 3. Generate reset token (JWT with short expiry)
      const resetPayload: PasswordResetPayload = {
        sub: user.id,
        tenantSchema: tenant.schemaName,
        tenantSlug: tenant.slug,
        purpose: 'password_reset',
      };

      const resetToken = this.jwt.sign(resetPayload, { expiresIn: '1h' });

      // 4. Build reset URL
      const appUrl = this.config.get('APP_URL', 'http://localhost:3000');
      const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

      // 5. Send email
      await this.emailService.sendPasswordResetEmail({
        to: user.email,
        userName: user.name || 'Usuario',
        resetUrl,
        businessName: tenant.businessName,
      });

      this.logger.log(`Password reset requested for ${email} in tenant ${tenantSlug}`);
    } catch (err: any) {
      // Log but don't expose errors to prevent info leakage
      this.logger.error(`forgotPassword error: ${err.message}`);
    }

    return { success: true };
  }

  /**
   * Validates the reset token and sets a new password.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
    // 1. Verify and decode token
    let payload: PasswordResetPayload;
    try {
      payload = this.jwt.verify<PasswordResetPayload>(token);
    } catch {
      throw new BadRequestException('El enlace ha expirado o no es válido. Solicita uno nuevo.');
    }

    // Ensure this is actually a password reset token
    if (payload.purpose !== 'password_reset') {
      throw new BadRequestException('Token inválido.');
    }

    // 2. Validate new password
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres.');
    }

    // 3. Hash and update
    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${payload.tenantSchema}".users SET password_hash = $1 WHERE id = $2::uuid`,
      hash,
      payload.sub,
    );

    this.logger.log(`Password reset completed for user ${payload.sub} in ${payload.tenantSlug}`);
    return { success: true };
  }
}
