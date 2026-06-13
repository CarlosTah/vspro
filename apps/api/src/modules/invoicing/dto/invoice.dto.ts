import { IsUUID, IsString, IsOptional, IsIn, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvoiceDto {
  @ApiProperty({ example: 'uuid-del-pedido' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ example: 'XAXX010101000', description: 'RFC del cliente (genérico si no tiene)' })
  @IsString()
  customerRfc!: string;

  @ApiProperty({ example: 'María García López', required: false })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiProperty({ example: 'cliente@email.com', required: false })
  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @ApiProperty({ example: '86000', required: false, description: 'Código postal fiscal' })
  @IsString()
  @IsOptional()
  customerZipCode?: string;

  @ApiProperty({ enum: ['G01', 'G03', 'P01', 'S01'], description: 'Uso de CFDI', required: false })
  @IsIn(['G01', 'G03', 'P01', 'S01'])
  @IsOptional()
  cfdiUse?: string;

  @ApiProperty({ enum: ['PUE', 'PPD'], description: 'Método de pago', required: false })
  @IsIn(['PUE', 'PPD'])
  @IsOptional()
  paymentMethod?: string;
}
