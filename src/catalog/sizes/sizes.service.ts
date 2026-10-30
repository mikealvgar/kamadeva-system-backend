import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateSizeDto } from './dto/create-size.dto.js';
import type { SizeDto } from './dto/size.dto.js';
import type { UpdateSizeDto } from './dto/update-size.dto.js';

const sizeSelect = {
  id: true,
  name: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.SizeSelect;

@Injectable()
export class SizesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSizeDto): Promise<SizeDto> {
    try {
      return await this.prisma.size.create({
        data: {
          name: dto.name.trim().toUpperCase(),
          sortOrder: dto.sortOrder ?? 0,
        },
        select: sizeSelect,
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findAll(includeInactive = false): Promise<SizeDto[]> {
    return this.prisma.size.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: sizeSelect,
    });
  }

  async findById(id: string): Promise<SizeDto> {
    const size = await this.prisma.size.findUnique({
      where: { id },
      select: sizeSelect,
    });
    if (!size) throw new NotFoundException('Talla inexistente');
    return size;
  }

  async update(id: string, dto: UpdateSizeDto): Promise<SizeDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Debe enviar al menos un campo');
    }
    const data: Prisma.SizeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim().toUpperCase();
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    try {
      return await this.prisma.size.update({
        where: { id },
        data,
        select: sizeSelect,
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      // Product, quote item and sale item relations use RESTRICT, including races.
      await this.prisma.size.delete({ where: { id }, select: { id: true } });
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('La talla ya existe');
      if (error.code === 'P2025')
        throw new NotFoundException('Talla inexistente');
      if (error.code === 'P2003')
        throw new ConflictException('La talla tiene registros asociados');
    }
    throw error;
  }
}
