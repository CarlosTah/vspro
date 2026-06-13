import { Injectable, Logger, ConflictException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { TenantPrismaService } from '../../database/tenant-prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { Prisma } from '@vspro/database';

@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  // SQL del schema del tenant — se carga una vez al iniciar
  private readonly tenantSchemaSql: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {
    // Cargar el SQL desde el archivo — ruta relativa al monorepo root
    const sqlPath = path.resolve(
      __dirname,
      '../../../../../packages/database/prisma/tenant-schema.sql',
    );
    this.tenantSchemaSql = fs.readFileSync(sqlPath, 'utf-8');
  }

  async provision(dto: CreateTenantDto) {
    // Verificar que el slug no esté tomado
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`El slug '${dto.slug}' ya está en uso`);
    }

    // Obtener plan básico por defecto
    const basicPlan = await this.prisma.plan.findFirstOrThrow({
      where: { slug: 'basic', isActive: true },
    });

    // Generar nombre de schema único
    const schemaName = `tenant_${this.generateId()}`;

    this.logger.log(`Provisionando tenant: ${dto.slug} → schema: ${schemaName}`);

    // 1. Registrar tenant en schema público (transacción)
    const tenant = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newTenant = await tx.tenant.create({
        data: {
          slug: dto.slug,
          schemaName,
          businessName: dto.businessName,
          ownerEmail: dto.email,
          ownerName: dto.ownerName,
          planId: basicPlan.id,
          status: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.subscription.create({
        data: {
          tenantId: newTenant.id,
          planId: basicPlan.id,
          status: 'TRIALING',
        },
      });

      return newTenant;
    });

    // 2. Crear schema PostgreSQL con todas las tablas de negocio
    await this.createTenantSchema(schemaName);

    // 3. Crear usuario admin inicial
    await this.createOwnerUser(schemaName, dto);

    // 4. Insertar configuración de IA por defecto
    await this.seedAiConfig(schemaName, dto.businessName);

    this.logger.log(`Tenant provisionado exitosamente: ${dto.slug}`);
    return tenant;
  }

  private async createTenantSchema(schemaName: string): Promise<void> {
    // Crear el schema
    await this.prisma.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
    );

    // Ejecutar el SQL completo del tenant reemplazando el placeholder
    const sql = this.tenantSchemaSql.replaceAll('{{schema}}', schemaName);

    // Separar statements: eliminar comentarios de línea y dividir por ;
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))  // quitar comentarios
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await this.prisma.$executeRawUnsafe(statement);
    }

    this.logger.debug(`Schema completo creado: ${schemaName} (${statements.length} statements)`);
  }

  private async createOwnerUser(schemaName: string, dto: CreateTenantDto): Promise<void> {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'admin')`,
      dto.email,
      passwordHash,
      dto.ownerName ?? dto.businessName,
    );
  }

  private async seedAiConfig(schemaName: string, businessName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "${schemaName}".ai_config
         (assistant_name, tone, welcome_message, away_message, language)
       VALUES ($1, 'friendly', $2, $3, 'es')`,
      'Asistente',
      `¡Hola! Soy el asistente virtual de ${businessName}. ¿En qué te puedo ayudar?`,
      'En este momento no estamos disponibles. Te responderemos a la brevedad.',
    );
  }

  async deprovision(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    this.logger.warn(`Deprovisioning tenant: ${tenant.slug}`);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'CANCELLED' },
    });

    await this.prisma.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${tenant.schemaName}" CASCADE`,
    );

    this.logger.warn(`Schema eliminado: ${tenant.schemaName}`);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9);
  }
}
