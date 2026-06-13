import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { CustomToolDto } from './dto/update-ai-tools.dto';
import OpenAI from 'openai';

/**
 * Servicio que permite a cada tenant definir herramientas de IA personalizadas.
 * Las herramientas se guardan en ai_config.custom_tools (JSONB) y se cargan
 * dinámicamente en cada llamada al motor de IA.
 *
 * Cada herramienta apunta a un módulo + método del backend que se ejecuta
 * cuando GPT-4o la invoca.
 */
@Injectable()
export class AiToolsExtenderService {
  private readonly logger = new Logger(AiToolsExtenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Obtiene las herramientas custom del tenant.
   */
  async getCustomTools(schemaName: string): Promise<CustomToolDto[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT custom_instructions FROM "${schemaName}".ai_config LIMIT 1
    `);

    // Las custom tools se guardan como JSON en un campo dedicado
    // Por ahora usamos una tabla separada o el campo custom_instructions
    const toolsRows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'ai_config' AND column_name = 'custom_tools'
      ) AS exists
    `, schemaName);

    if (!toolsRows[0]?.exists) {
      // Crear columna si no existe
      await this.prisma.$executeRawUnsafe(`
        ALTER TABLE "${schemaName}".ai_config
        ADD COLUMN IF NOT EXISTS custom_tools JSONB DEFAULT '[]'
      `);
      return [];
    }

    const config = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT custom_tools AS "customTools" FROM "${schemaName}".ai_config LIMIT 1
    `);

    return (config[0]?.customTools ?? []) as CustomToolDto[];
  }

  /**
   * Guarda las herramientas custom del tenant.
   */
  async saveCustomTools(tools: CustomToolDto[], schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schemaName}".ai_config
      ADD COLUMN IF NOT EXISTS custom_tools JSONB DEFAULT '[]'
    `);

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".ai_config
      SET custom_tools = $1::jsonb
      WHERE id = (SELECT id FROM "${schemaName}".ai_config LIMIT 1)
    `, JSON.stringify(tools));

    return { success: true, toolCount: tools.length };
  }

  /**
   * Convierte las herramientas custom al formato de OpenAI Function Calling.
   */
  toOpenAiTools(customTools: CustomToolDto[]): OpenAI.Chat.ChatCompletionTool[] {
    return customTools
      .filter((t) => t.enabled !== false)
      .map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: Object.fromEntries(
              tool.parameters.map((p) => [
                p.name,
                { type: p.type, description: p.description },
              ]),
            ),
            required: tool.parameters
              .filter((p) => p.required)
              .map((p) => p.name),
          },
        },
      }));
  }

  /**
   * Ejecuta una herramienta custom resolviendo el servicio dinámicamente.
   * Busca el módulo por nombre y llama al método indicado.
   */
  async executeCustomTool(
    tool: CustomToolDto,
    args: Record<string, any>,
    schemaName: string,
  ): Promise<string> {
    try {
      // Mapeo de handler → servicio
      const serviceMap: Record<string, string> = {
        logistics: 'LogisticsService',
        rental: 'RentalService',
        products: 'ProductsService',
        orders: 'OrdersService',
        customers: 'CustomersService',
        payments: 'PaymentsService',
        shipments: 'ShipmentsService',
      };

      const serviceName = serviceMap[tool.handler];
      if (!serviceName) {
        return JSON.stringify({ error: `Handler '${tool.handler}' no reconocido` });
      }

      // Resolver servicio dinámicamente
      const service = this.moduleRef.get(serviceName, { strict: false });
      if (!service || typeof service[tool.method] !== 'function') {
        return JSON.stringify({ error: `Método '${tool.method}' no encontrado en ${serviceName}` });
      }

      // Ejecutar el método con los argumentos + schemaName
      const result = await service[tool.method](args, schemaName);
      return JSON.stringify(result);
    } catch (error: any) {
      this.logger.error(`Error ejecutando tool custom ${tool.name}:`, error.message);
      return JSON.stringify({ error: error.message });
    }
  }
}
