import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CategoryDto } from './dto/category.dto.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

export function normalizeCategoryDescription(desc: string): string {
  return desc.trim().replace(/\s+/g, ' ').toUpperCase();
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto): Promise<CategoryDto> {
    const raw = dto.descripcion !== undefined ? dto.descripcion : dto.name;
    if (!raw || !raw.trim()) {
      throw new BadRequestException('La descripción es obligatoria');
    }
    const descripcion = normalizeCategoryDescription(raw);
    try {
      const record = await this.prisma.category.create({
        data: {
          descripcion,
        },
      });
      return this.mapToDto(record);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findAll(includeInactive = false): Promise<CategoryDto[]> {
    const records = await this.prisma.category.findMany({
      where: includeInactive ? {} : { activo: true },
      orderBy: { descripcion: 'asc' },
    });
    return records.map((r) => this.mapToDto(r));
  }

  async findById(id: string): Promise<CategoryDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('Categoría inexistente');
    return this.mapToDto(category);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Debe enviar al menos un campo');
    }
    const data: Prisma.CategoryUpdateInput = {};
    const raw = dto.descripcion !== undefined ? dto.descripcion : dto.name;
    if (raw !== undefined) {
      if (typeof raw !== 'string' || !raw.trim()) {
        throw new BadRequestException('La descripción es obligatoria');
      }
      data.descripcion = normalizeCategoryDescription(raw);
    }
    const activo = dto.activo !== undefined ? dto.activo : dto.isActive;
    if (activo !== undefined) {
      if (typeof activo !== 'boolean') {
        throw new BadRequestException('El estado activo debe ser un valor booleano');
      }
      data.activo = activo;
    }
    try {
      const updated = await this.prisma.category.update({
        where: { id },
        data,
      });
      return this.mapToDto(updated);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.category.delete({
        where: { id },
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  private mapToDto(r: {
    id: string;
    descripcion: string;
    activo: boolean;
    fechaCreacion: Date;
    fechaActualizacion: Date;
  }): CategoryDto {
    return {
      id: r.id,
      descripcion: r.descripcion,
      name: r.descripcion,
      activo: r.activo,
      isActive: r.activo,
      fechaCreacion: r.fechaCreacion.toISOString(),
      fechaActualizacion: r.fechaActualizacion.toISOString(),
    };
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('La categoría ya existe');
      if (error.code === 'P2025')
        throw new NotFoundException('Categoría inexistente');
      if (error.code === 'P2003')
        throw new ConflictException('La categoría tiene productos asociados');
    }
    throw error;
  }
}
