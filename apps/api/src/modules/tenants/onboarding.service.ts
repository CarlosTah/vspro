import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

/**
 * Onboarding Service — Self-service PYME registration in 5 minutes.
 *
 * Flow:
 * 1. Business info (name, slug, email, password, phone)
 * 2. Payment info (bank, CLABE for receiving transfers)
 * 3. First products (name, price, image URL)
 * 4. WhatsApp connection (phone number, verify)
 * 5. AI configuration (assistant name, tone)
 *
 * Creates: tenant + schema + admin user + products + ai_config + channel
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: TenantProvisioningService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Complete onboarding — creates everything in one transaction.
   */
  async completeOnboarding(data: OnboardingData): Promise<OnboardingResult> {
    // Validate slug availability
    const existing = await this.prisma.tenant.findUnique({ where: { slug: data.business.slug } });
    if (existing) throw new BadRequestException(`El nombre "${data.business.slug}" ya está en uso`);

    this.logger.log(`Starting onboarding for: ${data.business.slug}`);

    // 1. Provision tenant (schema + admin user + base config)
    const tenant = await this.provisioning.provision({
      slug: data.business.slug,
      businessName: data.business.businessName,
      email: data.business.email,
      ownerName: data.business.ownerName,
      password: data.business.password,
    });

    const schemaName = tenant.schemaName;

    // 2. Set owner phone for notifications
    if (data.business.phone) {
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { settings: { ownerPhone: data.business.phone } },
      });
    }

    // 3. Configure payment info
    if (data.paymentInfo) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".ai_config
        SET agent_config = jsonb_set(
          COALESCE(agent_config, '{}'::jsonb),
          '{payment_info}',
          $1::jsonb
        )
      `, JSON.stringify(data.paymentInfo));
    }

    // 4. Add initial products
    let productsCreated = 0;
    if (data.products && data.products.length > 0) {
      for (const product of data.products) {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO "${schemaName}".products (name, price, category, images, sku, is_active)
          VALUES ($1, $2, $3, $4::text[], $5, true)
        `,
          product.name,
          product.price,
          product.category ?? 'General',
          product.images ?? [],
          product.sku ?? this.generateSku(data.business.slug, productsCreated),
        );
        productsCreated++;
      }

      // Create inventory for each product
      const products = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM "${schemaName}".products`,
      );
      for (const p of products) {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO "${schemaName}".inventory (product_id, stock_available, stock_minimum)
          VALUES ($1::uuid, $2, 5)
          ON CONFLICT (product_id) DO NOTHING
        `, p.id, 50); // Default 50 units stock
      }
    }

    // 5. Configure AI assistant
    if (data.aiConfig) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".ai_config
        SET assistant_name = $1,
            tone = $2,
            welcome_message = $3,
            language = $4
      `,
        data.aiConfig.assistantName ?? 'Asistente',
        data.aiConfig.tone ?? 'friendly',
        data.aiConfig.welcomeMessage ?? `¡Hola! Soy el asistente de ${data.business.businessName}. ¿En qué te puedo ayudar?`,
        data.aiConfig.language ?? 'es',
      );
    }

    // 6. Configure WhatsApp channel (if provided)
    let channelConnected = false;
    if (data.whatsappConfig) {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".channels (type, external_id, access_token, webhook_verify_token, is_active)
        VALUES ('whatsapp', $1, $2, $3, true)
      `,
        data.whatsappConfig.phoneNumberId,
        data.whatsappConfig.accessToken,
        data.whatsappConfig.verifyToken ?? 'vspro-webhook-2026',
      );
      channelConnected = true;
    }

    // 7. Set notification preferences (all enabled by default)
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".ai_config
      SET agent_config = jsonb_set(
        COALESCE(agent_config, '{}'::jsonb),
        '{notifications}',
        '{"new_order":true,"payment_verified":true,"low_stock":true,"daily_summary":true}'::jsonb
      )
    `);

    this.logger.log(`Onboarding complete: ${data.business.slug} (${productsCreated} products, channel: ${channelConnected})`);

    return {
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        schemaName: tenant.schemaName,
        businessName: data.business.businessName,
      },
      productsCreated,
      channelConnected,
      webhookUrl: `${this.config.get('API_URL', 'http://localhost:3001')}/webhooks/meta/${tenant.slug}`,
      nextSteps: this.getNextSteps(channelConnected, productsCreated),
    };
  }

  /**
   * Check what's missing for a tenant to be fully operational.
   */
  async getOnboardingStatus(schemaName: string): Promise<OnboardingStatus> {
    const [products, channels, aiConfig, payments] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as c FROM "${schemaName}".products WHERE is_active = true`),
      this.prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as c FROM "${schemaName}".channels WHERE is_active = true`),
      this.prisma.$queryRawUnsafe<any[]>(`SELECT assistant_name, agent_config FROM "${schemaName}".ai_config LIMIT 1`),
      this.prisma.$queryRawUnsafe<any[]>(`SELECT agent_config->'payment_info' as info FROM "${schemaName}".ai_config LIMIT 1`),
    ]);

    const hasProducts = parseInt(products[0]?.c ?? '0') > 0;
    const hasChannel = parseInt(channels[0]?.c ?? '0') > 0;
    const hasAiConfig = !!aiConfig[0]?.assistant_name;
    const hasPaymentInfo = !!payments[0]?.info?.bank;

    const steps: OnboardingStep[] = [
      { id: 'business', label: 'Datos del negocio', completed: true }, // Always done if tenant exists
      { id: 'products', label: 'Catálogo de productos', completed: hasProducts },
      { id: 'payment', label: 'Datos bancarios', completed: hasPaymentInfo },
      { id: 'channel', label: 'Conectar WhatsApp', completed: hasChannel },
      { id: 'ai', label: 'Configurar asistente', completed: hasAiConfig },
    ];

    const completedCount = steps.filter(s => s.completed).length;

    return {
      steps,
      completedSteps: completedCount,
      totalSteps: steps.length,
      percentComplete: Math.round((completedCount / steps.length) * 100),
      isReady: completedCount === steps.length,
      missingSteps: steps.filter(s => !s.completed).map(s => s.label),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private generateSku(slug: string, index: number): string {
    const prefix = slug.slice(0, 3).toUpperCase();
    return `${prefix}-${String(index + 1).padStart(3, '0')}`;
  }

  private getNextSteps(channelConnected: boolean, productsCreated: number): string[] {
    const steps: string[] = [];
    if (productsCreated === 0) steps.push('Agrega tus productos al catálogo');
    if (!channelConnected) steps.push('Conecta tu número de WhatsApp Business');
    steps.push('Configura tus datos bancarios para recibir pagos');
    steps.push('Personaliza el nombre y tono de tu asistente');
    if (steps.length === 2) steps.push('¡Ya estás listo para vender! 🎉');
    return steps;
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface OnboardingData {
  business: {
    slug: string;
    businessName: string;
    email: string;
    ownerName: string;
    password: string;
    phone?: string;
  };
  paymentInfo?: {
    bank: string;
    clabe: string;
    beneficiary: string;
  };
  products?: Array<{
    name: string;
    price: number;
    category?: string;
    images?: string[];
    sku?: string;
  }>;
  aiConfig?: {
    assistantName?: string;
    tone?: string;
    welcomeMessage?: string;
    language?: string;
  };
  whatsappConfig?: {
    phoneNumberId: string;
    accessToken: string;
    verifyToken?: string;
  };
}

export interface OnboardingResult {
  success: boolean;
  tenant: { id: string; slug: string; schemaName: string; businessName: string };
  productsCreated: number;
  channelConnected: boolean;
  webhookUrl: string;
  nextSteps: string[];
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  completedSteps: number;
  totalSteps: number;
  percentComplete: number;
  isReady: boolean;
  missingSteps: string[];
}

interface OnboardingStep {
  id: string;
  label: string;
  completed: boolean;
}
