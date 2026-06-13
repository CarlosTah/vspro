import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, Req, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, UpdateChannelDto } from './dto/channel.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('channels')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  findAll(@TenantSchema() schema: string) {
    return this.channelsService.findAll(schema);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.channelsService.findById(id, schema);
  }

  @Post()
  create(
    @Body() dto: CreateChannelDto,
    @Req() req: any,
    @TenantSchema() schema: string,
  ) {
    return this.channelsService.create(dto, req.user.tenantSlug, schema);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChannelDto,
    @TenantSchema() schema: string,
  ) {
    return this.channelsService.update(id, dto, schema);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.channelsService.delete(id, schema);
  }

  @Post(':id/test')
  testConnection(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.channelsService.testConnection(id, schema);
  }
}
