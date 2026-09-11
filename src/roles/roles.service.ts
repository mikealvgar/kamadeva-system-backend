import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ROLE_NAMES } from './role-names.js';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      where: { name: { in: [...ROLE_NAMES] } },
      select: { id: true, name: true, description: true, isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}
