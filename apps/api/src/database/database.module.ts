import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantPrismaService } from './tenant-prisma.service';

@Global() // disponible en todos los módulos sin importar explícitamente
@Module({
  providers: [PrismaService, TenantPrismaService],
  exports: [PrismaService, TenantPrismaService],
})
export class DatabaseModule {}
