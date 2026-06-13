import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { CreateInvoiceDto } from './dto/invoice.dto';

interface FacturapiInvoice {
  id: string;
  status: string;
  total: number;
  uuid: string; // UUID fiscal del CFDI
  pdf_url: string;
  xml_url: string;
}

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);
  private readonly apiKey: string | null;
  private readonly baseUrl = 'https://www.facturapi.io/v2';

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
  ) {
    this.apiKey = this.config.get('FACTURAPI_KEY') ?? null;
    if (!this.apiKey) {
      this.logger.warn('FACTURAPI_KEY no configurada — facturación en modo simulado');
    }
  }

  // ─── Crear factura ────────────────────────────────────────────

  async createInvoice(dto: CreateInvoiceDto, schemaName: string) {
    const order = await this.ordersService.findById(dto.orderId, schemaName);
    const orderTotal = parseFloat(order.total);

    // Calcular IVA (16%)
    const subtotal = orderTotal / 1.16;
    const taxAmount = orderTotal - subtotal;

    // Parsear items del pedido
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

    if (!this.apiKey) {
      // Modo simulado
      const mockInvoice = {
        id: `sim_inv_${Date.now()}`,
        uuid: `SIM-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        status: 'valid',
        total: orderTotal,
        pdfUrl: `https://facturapi.io/mock/pdf/${Date.now()}`,
        xmlUrl: `https://facturapi.io/mock/xml/${Date.now()}`,
      };

      await this.recordAccountingEntry(dto.orderId, orderTotal, taxAmount, mockInvoice.id, schemaName);

      return {
        invoice: mockInvoice,
        order: { orderNumber: order.orderNumber },
        mode: 'simulated',
        message: 'Factura simulada — configura FACTURAPI_KEY para facturación real',
      };
    }

    // Llamar a Facturapi
    const facturapiInvoice = await this.callFacturapi(dto, items, subtotal, taxAmount, orderTotal);

    // Registrar en contabilidad
    await this.recordAccountingEntry(
      dto.orderId,
      orderTotal,
      taxAmount,
      facturapiInvoice.id,
      schemaName,
    );

    // Enviar por email si se proporcionó
    if (dto.customerEmail) {
      await this.sendInvoiceByEmail(facturapiInvoice.id, dto.customerEmail);
    }

    return {
      invoice: {
        id: facturapiInvoice.id,
        uuid: facturapiInvoice.uuid,
        status: facturapiInvoice.status,
        total: facturapiInvoice.total,
        pdfUrl: facturapiInvoice.pdf_url,
        xmlUrl: facturapiInvoice.xml_url,
      },
      order: { orderNumber: order.orderNumber },
      emailSent: !!dto.customerEmail,
    };
  }

  // ─── Historial de facturas ────────────────────────────────────

  async getByOrder(orderId: string, schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, order_id AS "orderId", type, amount,
        tax_amount AS "taxAmount", description,
        invoice_id AS "invoiceId",
        created_at AS "createdAt"
      FROM "${schemaName}".accounting_entries
      WHERE order_id = $1::uuid
      ORDER BY created_at DESC
    `, orderId);
  }

  // ─── Resumen contable del mes ─────────────────────────────────

  async getMonthlySummary(schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS "totalInvoices",
        COALESCE(SUM(amount), 0) AS "totalRevenue",
        COALESCE(SUM(tax_amount), 0) AS "totalTax",
        COALESCE(SUM(amount) FILTER (WHERE type = 'refund'), 0) AS "totalRefunds"
      FROM "${schemaName}".accounting_entries
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    const r = rows[0];
    return {
      totalInvoices: parseInt(r.totalInvoices) || 0,
      totalRevenue: parseFloat(r.totalRevenue) || 0,
      totalTax: parseFloat(r.totalTax) || 0,
      totalRefunds: parseFloat(r.totalRefunds) || 0,
      netRevenue: (parseFloat(r.totalRevenue) || 0) - (parseFloat(r.totalRefunds) || 0),
    };
  }

  // ─── Helpers privados ─────────────────────────────────────────

  private async callFacturapi(
    dto: CreateInvoiceDto,
    items: any[],
    subtotal: number,
    taxAmount: number,
    total: number,
  ): Promise<FacturapiInvoice> {
    const body = {
      customer: {
        legal_name: dto.customerName ?? 'Público en General',
        tax_id: dto.customerRfc,
        tax_system: '616', // Sin obligaciones fiscales (genérico)
        address: { zip: dto.customerZipCode ?? '86000' },
        email: dto.customerEmail,
      },
      items: items.map((item: any) => ({
        description: item.productName ?? item.name ?? 'Producto',
        product_key: '01010101', // Genérico — en producción mapear por categoría
        quantity: item.quantity,
        price: item.unitPrice ?? item.subtotal / item.quantity,
        tax_included: true,
        taxes: [{ type: 'IVA', rate: 0.16 }],
      })),
      use: dto.cfdiUse ?? 'S01',
      payment_form: '03', // Transferencia electrónica
      payment_method: dto.paymentMethod ?? 'PUE',
    };

    const res = await fetch(`${this.baseUrl}/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.json() as any;
      throw new BadRequestException(
        `Error de Facturapi: ${error.message ?? JSON.stringify(error)}`,
      );
    }

    return res.json() as Promise<FacturapiInvoice>;
  }

  private async sendInvoiceByEmail(invoiceId: string, email: string) {
    try {
      await fetch(`${this.baseUrl}/invoices/${invoiceId}/email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      this.logger.log(`Factura ${invoiceId} enviada a ${email}`);
    } catch (err) {
      this.logger.error(`Error enviando factura por email:`, err);
    }
  }

  private async recordAccountingEntry(
    orderId: string,
    amount: number,
    taxAmount: number,
    invoiceId: string,
    schemaName: string,
  ) {
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".accounting_entries
        (order_id, type, amount, tax_amount, description, invoice_id)
      VALUES ($1::uuid, 'sale', $2, $3, 'Venta facturada', $4)
    `, orderId, amount, taxAmount, invoiceId);
  }
}
