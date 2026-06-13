import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

export interface JwtPayload {
  sub: string; // userId dentro del schema del tenant
  tenantId: string;
  tenantSchema: string;
  tenantSlug: string;
  role: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_SECRET'),
      passReqToCallback: true, // necesario para acceder al request en validate()
    });
  }

  // Con passReqToCallback: true, passport invierte el orden: validate(req, payload)
  async validate(req: any, payload: JwtPayload) {
    // Verificar que el tenant del JWT sigue activo
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: payload.tenantId },
      select: { id: true, status: true, schemaName: true, slug: true },
    });

    if (!tenant || tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      throw new UnauthorizedException('Tenant inactivo o suspendido');
    }

    // CRÍTICO: verificar que el tenant del request (header/subdominio)
    // coincide con el tenant del JWT — previene cross-tenant token reuse
    const requestTenant = req?.tenant;
    if (requestTenant && requestTenant.id !== tenant.id) {
      throw new UnauthorizedException('Token no válido para este tenant');
    }

    return payload;
  }
}
