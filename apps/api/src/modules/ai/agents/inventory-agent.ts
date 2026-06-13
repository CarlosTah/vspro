import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { CustomerMemoryService } from '../customer-memory.service';
import { BaseAgent } from './base-agent';
import { AgentContext, AgentSettings, LowStockItem, SupplierInfo } from './types';

/**
 * Autonomous cron-based agent that monitors inventory levels.
 * Detects products below stock_minimum and generates supplier
 * reorder email drafts for admin review.
 *
 * This agent does NOT process customer messages — it runs on a schedule.
 */
@Injectable()
export class InventoryAgent extends BaseAgent {
  readonly name = 'inventory';
  readonly description = 'Agente autónomo de monitoreo de inventario';

  constructor(prisma: PrismaService, config: ConfigService, customerMemory: CustomerMemoryService) {
    super(prisma, config, customerMemory);
  }

  getSystemPrompt(_tenant: any, _settings: AgentSettings): string {
    return ''; // Not used — this agent is cron-only
  }

  getTools(): OpenAI.Chat.ChatCompletionTool[] {
    return []; // Not used — this agent is cron-only
  }

  async executeTool(_name: string, _args: any, _context: AgentContext): Promise<string> {
    return JSON.stringify({ error: 'InventoryAgent does not process messages' });
  }

  // ─── Cron Entry Point ─────────────────────────────────────────

  /**
   * Scans all active tenant schemas for low-stock products.
   * Called by the cron scheduler every 6 hours.
   */
  async scanAllTenants(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true, slug: true, businessName: true },
    });

    for (const tenant of tenants) {
      try {
        await this.scanTenant(tenant);
      } catch (err: any) {
        this.logger.error(`InventoryAgent scan failed for ${tenant.slug}: ${err.message}`);
      }
    }
  }

  private async scanTenant(tenant: { id: string; schemaName: string; slug: string; businessName: string }): Promise<void> {
    const lowStockItems = await this.scanTenantStock(tenant.schemaName);

    if (lowStockItems.length === 0) return;

    this.logger.log(`[${tenant.slug}] ${lowStockItems.length} products below stock minimum`);

    // Group by supplier
    const withSupplier = lowStockItems.filter(i => i.supplierInfo?.supplier_email);
    const withoutSupplier = lowStockItems.filter(i => !i.supplierInfo?.supplier_email);

    // Generate drafts for items with supplier info
    if (withSupplier.length > 0) {
      const draft = this.generateSupplierDraft(withSupplier, tenant.businessName);
      await this.saveDraft(tenant.schemaName, draft, withSupplier);
    }

    // Create alerts for items without supplier info
    if (withoutSupplier.length > 0) {
      this.logger.warn(
        `[${tenant.slug}] ${withoutSupplier.length} low-stock items missing supplier_info: ${withoutSupplier.map(i => i.sku).join(', ')}`,
      );
    }
  }

  // ─── Stock Scanning ───────────────────────────────────────────

  async scanTenantStock(schemaName: string): Promise<LowStockItem[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.name, p.sku, p.supplier_info AS "supplierInfo",
             i.stock_available AS "stockAvailable", i.stock_minimum AS "stockMinimum"
      FROM "${schemaName}".products p
      JOIN "${schemaName}".inventory i ON i.product_id = p.id
      WHERE i.stock_available < i.stock_minimum
        AND p.is_active = true
    `);

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      sku: r.sku ?? 'N/A',
      stockAvailable: r.stockAvailable,
      stockMinimum: r.stockMinimum,
      supplierInfo: (r.supplierInfo ?? {}) as SupplierInfo,
    }));
  }

  // ─── Draft Generation ─────────────────────────────────────────

  generateSupplierDraft(items: LowStockItem[], businessName: string): string {
    const supplierEmail = items[0]?.supplierInfo?.supplier_email ?? 'proveedor@ejemplo.com';
    const supplierName = items[0]?.supplierInfo?.supplier_name ?? 'Proveedor';

    const itemList = items.map(i =>
      `  • ${i.name} (SKU: ${i.sku}) — Stock actual: ${i.stockAvailable}, Mínimo: ${i.stockMinimum}, Sugerido pedir: ${i.stockMinimum * 3}`,
    ).join('\n');

    return `Para: ${supplierEmail}
Asunto: Solicitud de resurtido — ${businessName}

Estimado/a ${supplierName},

Le escribimos de ${businessName} para solicitar resurtido de los siguientes artículos que se encuentran por debajo de nuestro stock mínimo:

${itemList}

Agradeceríamos confirmación de disponibilidad y tiempo de entrega estimado.

Saludos cordiales,
${businessName}
---
[BORRADOR GENERADO POR IA — REQUIERE APROBACIÓN DEL ADMIN]`;
  }

  // ─── Persistence ──────────────────────────────────────────────

  private async saveDraft(schemaName: string, draft: string, items: LowStockItem[]): Promise<void> {
    // Store as a notification/alert in the tenant schema
    // For now, log it — in production this would go to a notifications queue
    this.logger.log(`[Draft saved] ${items.length} items for reorder`);
    this.logger.debug(draft);
  }
}
