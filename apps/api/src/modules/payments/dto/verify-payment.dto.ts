import { IsUUID, IsString, IsOptional, IsIn, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyPaymentByImageDto {
  @ApiProperty({ example: 'uuid-del-pedido' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ example: 'https://s3.../comprobante.jpg' })
  @IsString()
  proofImageUrl!: string;
}

export class ManualVerifyPaymentDto {
  @ApiProperty({ example: 'uuid-del-pedido' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ example: 350.00 })
  @IsNumber()
  amount!: number;

  @ApiProperty({ example: 'REF123456', required: false })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiProperty({ enum: ['transfer', 'stripe', 'mercadopago', 'cash'] })
  @IsIn(['transfer', 'stripe', 'mercadopago', 'cash'])
  method!: string;
}
