import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { IndustryTemplatesService } from './industry-templates.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('templates')
@Controller('industry-templates')
export class IndustryTemplatesController {
  constructor(private readonly templatesService: IndustryTemplatesService) {}

  /** List available templates (public, no auth required) */
  @Get()
  list() {
    return this.templatesService.listTemplates();
  }

  /** Get template details */
  @Get(':slug')
  getTemplate(@Param('slug') slug: string) {
    return this.templatesService.getTemplate(slug);
  }

  /** Apply template to current tenant */
  @Post(':slug/apply')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  apply(@Param('slug') slug: string, @TenantSchema() schema: string) {
    return this.templatesService.applyTemplate(slug, schema);
  }
}
