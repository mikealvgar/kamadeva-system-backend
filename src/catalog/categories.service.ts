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
import type { ListCategoriesDto } from './dto/list-categories.dto.js';
import {
  calculateSkipTake,
  resolvePrismaOrderBy,
} from '../common/pagination/prisma-pagination.helper.js';
import {
  createPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto.js';

export function normalizeCategoryDescription(desc: string): string {
  return desc.trim().replace(/\s+/g, ' ').toUpperCase();
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto): Promise<CategoryDto> {
    const raw = dto.nombre;
    if (!raw || !raw.trim()) {
      throw new BadRequestException('La descripción es obligatoria');
    }
    const descripcion = normalizeCategoryDescription(raw);
    const activo = dto.isActive;
    if (activo !== undefined && typeof activo !== 'boolean') {
      throw new BadRequestException('El estado activo debe ser un valor booleano');
    }
    try {
      const record = await this.prisma.category.create({
        data: {
          nombre: descripcion,
          ...(activo !== undefined ? { isActive: activo } : {}),
        },
      });
      return this.mapToDto(record);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findAll(
    queryOrIncludeInactive: ListCategoriesDto | boolean = false,
  ): Promise<PaginatedResponseDto<CategoryDto>> {
    const query: ListCategoriesDto =
      typeof queryOrIncludeInactive === 'boolean'
        ? { includeInactive: queryOrIncludeInactive ? 'true' : 'false' }
        : queryOrIncludeInactive ?? {};

    const includeInactive = query.includeInactive === 'true';
    const where = includeInactive ? {} : { isActive: true };

    const { skip, take } = calculateSkipTake(query);
    const orderBy = resolvePrismaOrderBy({
      sortBy: query.sortBy,
      direction: query.direction,
      allowedFields: {
        nombre: 'nombre',
        descripcion: 'nombre',
        name: 'nombre',
        fechaCreacion: 'fechaCreacion',
        createdAt: 'fechaCreacion',
      },
      defaultOrderBy: { nombre: 'asc' },
    });

    const [totalRecords, records] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
    ]);

    return createPaginatedResponse({
      items: records.map((r) => this.mapToDto(r)),
      totalRecords,
      page: query.page,
      size: query.size,
    });
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
    const raw = dto.nombre;
    if (raw !== undefined) {
      if (typeof raw !== 'string' || !raw.trim()) {
        throw new BadRequestException('La descripción es obligatoria');
      }
      data.nombre = normalizeCategoryDescription(raw);
    }
    const activo = dto.isActive;
    if (activo !== undefined) {
      if (typeof activo !== 'boolean') {
        throw new BadRequestException('El estado activo debe ser un valor booleano');
      }
      data.isActive = activo;
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
    nombre: string;
    isActive: boolean;
    fechaCreacion: Date;
    fechaActualizacion: Date;
  }): CategoryDto {
    return {
      id: r.id,
      descripcion: r.nombre,
      name: r.nombre,
      activo: r.isActive,
      isActive: r.isActive,
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
