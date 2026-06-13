import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.tenant.findMany({
      include: { plan: true, subscription: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findBySlug(slug: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { slug },
      include: { plan: true, subscription: true },
    });
  }

  findById(id: string) {
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id },
      include: { plan: true, subscription: true },
    });
  }
}
