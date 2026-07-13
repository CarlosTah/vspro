import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { KnowledgeBaseService, CreateKbEntryDto, UpdateKbEntryDto } from './knowledge-base.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('knowledge-base')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  @Get()
  @Roles('admin', 'manager')
  findAll(@TenantSchema() schema: string) {
    return this.kbService.findAll(schema);
  }

  @Get(':id')
  @Roles('admin', 'manager')
  findOne(@Param('id') id: string, @TenantSchema() schema: string) {
    return this.kbService.findById(id, schema);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateKbEntryDto, @TenantSchema() schema: string) {
    return this.kbService.create(dto, schema);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateKbEntryDto, @TenantSchema() schema: string) {
    return this.kbService.update(id, dto, schema);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string, @TenantSchema() schema: string) {
    return this.kbService.delete(id, schema);
  }

  @Post('regenerate-embeddings')
  @Roles('admin')
  regenerateEmbeddings(@TenantSchema() schema: string) {
    return this.kbService.regenerateEmbeddings(schema).then(count => ({ regenerated: count }));
  }
}
