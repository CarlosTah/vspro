import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerMemoryService } from './customer-memory.service';
import { UpdateProfileDto } from './dto/customer-memory.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('customer-memory')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('customers/:customerId/memory')
export class CustomerMemoryController {
  constructor(private readonly memoryService: CustomerMemoryService) {}

  /** Get full customer memory (profile + recent episodes) */
  @Get()
  @Roles('admin', 'manager')
  getMemory(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @TenantSchema() schema: string,
  ) {
    return this.memoryService.getFullMemory(customerId, schema);
  }

  /** Update profile category */
  @Patch('profile')
  @Roles('admin', 'manager')
  async updateProfile(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: UpdateProfileDto,
    @TenantSchema() schema: string,
  ) {
    await this.memoryService.upsertProfile(customerId, dto.category, dto.data, schema);
    return { success: true, message: `Profile updated: ${dto.category}` };
  }

  /** Delete a specific episode */
  @Delete('episodes/:episodeId')
  @Roles('admin', 'manager')
  async deleteEpisode(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('episodeId', ParseUUIDPipe) episodeId: string,
    @TenantSchema() schema: string,
  ) {
    await this.memoryService.deleteEpisode(episodeId, customerId, schema);
    return { success: true, message: 'Episode deleted' };
  }

  /** Delete all memory for a customer */
  @Delete()
  @Roles('admin')
  async deleteAllMemory(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @TenantSchema() schema: string,
  ) {
    await this.memoryService.deleteAllMemory(customerId, schema);
    return { success: true, message: 'All memory deleted' };
  }
}
