import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MenuVisionService, ApproveMenuDto } from './menu-vision.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('menu-vision')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('menu-vision')
export class MenuVisionController {
  constructor(private readonly menuVision: MenuVisionService) {}

  /**
   * Parse a menu image and return extracted products.
   * Does NOT create products yet — just returns what was detected.
   */
  @Post('parse')
  @Roles('admin', 'manager')
  parseMenu(@Body() body: { imageUrl: string }) {
    return this.menuVision.parseMenuImage(body.imageUrl);
  }

  /**
   * Approve parsed items and create products + inventory.
   * Called after the owner reviews the parsed results.
   */
  @Post('approve')
  @Roles('admin', 'manager')
  approveMenu(@Body() dto: ApproveMenuDto, @TenantSchema() schema: string) {
    return this.menuVision.approveAndCreateProducts(dto, schema);
  }

  /**
   * Parse + format for display (used by dashboard preview).
   */
  @Post('preview')
  @Roles('admin', 'manager')
  async previewMenu(@Body() body: { imageUrl: string }) {
    const result = await this.menuVision.parseMenuImage(body.imageUrl);
    return {
      ...result,
      formattedMessage: this.menuVision.formatForReview(result),
    };
  }
}
