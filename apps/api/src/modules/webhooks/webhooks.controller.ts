import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Headers,
  HttpCode,
  Logger,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Get('meta/:tenantSlug')
  @ApiExcludeEndpoint()
  verifyWebhook(
    @Param('tenantSlug') tenantSlug: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.webhooksService.verify(tenantSlug, mode, token, challenge);
  }

  @Post('meta/:tenantSlug')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receiveMessage(
    @Param('tenantSlug') tenantSlug: string,
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: unknown,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    // Usar el rawBody para verificar la firma — el body parseado puede diferir
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(payload));
    await this.webhooksService.verifySignature(rawBody, signature);
    await this.webhooksService.enqueueMessage(tenantSlug, payload);
    this.logger.debug(`Mensaje encolado para tenant: ${tenantSlug}`);
    return { status: 'ok' };
  }
}
