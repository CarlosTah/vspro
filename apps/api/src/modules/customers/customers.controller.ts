import {
  Controller, Get, Post, Patch,
  Body, Param, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@TenantSchema() schema: string) {
    return this.customersService.findAll(schema);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.customersService.findById(id, schema);
  }

  @Get(':id/orders')
  getOrderHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.customersService.getOrderHistory(id, schema);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto, @TenantSchema() schema: string) {
    return this.customersService.create(dto, schema);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateCustomerDto>,
    @TenantSchema() schema: string,
  ) {
    return this.customersService.update(id, dto, schema);
  }
}
