import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ROLE_NAMES } from './role-names.js';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      where: { nombre: { in: [...ROLE_NAMES] } },
      select: { id: true, nombre: true, descripcion: true, activo: true },
      orderBy: { nombre: 'asc' },
    });
  }
}
