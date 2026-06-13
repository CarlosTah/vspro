import { Controller, Get, Patch, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AiConfigService } from './ai-config.service';
import { AiEngineService } from './ai-engine.service';
import { AiMemoryService } from './ai-memory.service';
import { AiToolsExtenderService } from './ai-tools-extender.service';
import { UpdateAiConfigDto, TestChatDto } from './dto/ai-config.dto';
import { UpdateAiToolsDto } from './dto/update-ai-tools.dto';
import { TenantSchema, CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiConfigService: AiConfigService,
    private readonly aiEngine: AiEngineService,
    private readonly aiMemory: AiMemoryService,
    private readonly aiToolsExtender: AiToolsExtenderService,
  ) {}

  /** Obtener configuración actual de la IA */
  @Get('config')
  @Roles('admin', 'manager')
  getConfig(@TenantSchema() schema: string) {
    return this.aiConfigService.getConfig(schema);
  }

  /** Actualizar configuración de la IA */
  @Patch('config')
  @Roles('admin')
  updateConfig(@Body() dto: UpdateAiConfigDto, @TenantSchema() schema: string) {
    return this.aiConfigService.updateConfig(dto, schema);
  }

  /** Chat de prueba — simula un mensaje de cliente para ver cómo responde la IA */
  @Post('test-chat')
  @Roles('admin', 'manager')
  async testChat(
    @Body() dto: TestChatDto,
    @CurrentTenant() tenant: any,
    @TenantSchema() schema: string,
  ) {
    const mockConversation = { id: '00000000-0000-0000-0000-000000000000', context: {} };
    const mockMessage = {
      channelType: 'whatsapp' as const,
      senderId: 'test-user',
      messageId: 'test-msg',
      type: 'text' as const,
      text: dto.message,
      timestamp: new Date(),
      raw: {},
    };

    const response = await this.aiEngine.processMessage(
      tenant,
      mockConversation,
      mockMessage,
      schema,
    );

    return {
      userMessage: dto.message,
      aiResponse: response.text,
      note: 'Esta es una simulación — no se guardó en la base de datos',
    };
  }

  /** Obtener memorias de un cliente */
  @Get('memories/:customerId')
  @Roles('admin', 'manager')
  getMemories(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @TenantSchema() schema: string,
  ) {
    return this.aiMemory.getCustomerMemories(customerId, schema);
  }

  /** Obtener herramientas custom del tenant */
  @Get('tools')
  @Roles('admin')
  getCustomTools(@TenantSchema() schema: string) {
    return this.aiToolsExtender.getCustomTools(schema);
  }

  /** Guardar herramientas custom del tenant */
  @Post('tools')
  @Roles('admin')
  saveCustomTools(@Body() dto: UpdateAiToolsDto, @TenantSchema() schema: string) {
    return this.aiToolsExtender.saveCustomTools(dto.tools, schema);
  }
}
