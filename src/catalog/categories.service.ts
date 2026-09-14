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
import { SLUG_PATTERN, slugify } from './slugify.js';

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  isActive: true,
} satisfies Prisma.CategorySelect;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto): Promise<CategoryDto> {
    const slug = this.resolveSlug(dto.slug, dto.name);
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name.trim(),
          slug,
          description: dto.description?.trim() || null,
        },
        select: categorySelect,
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findAll(includeInactive = false): Promise<CategoryDto[]> {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      select: categorySelect,
    });
  }

  async findById(id: string): Promise<CategoryDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: categorySelect,
    });
    if (!category) throw new NotFoundException('Categoría inexistente');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Debe enviar al menos un campo');
    }
    const data: Prisma.CategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.name !== undefined || dto.slug !== undefined)
      data.slug = this.resolveSlug(dto.slug, dto.name);
    if (dto.description !== undefined)
      data.description = dto.description?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    try {
      return await this.prisma.category.update({
        where: { id },
        data,
        select: categorySelect,
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      // The required Product relation uses RESTRICT, including concurrent inserts.
      await this.prisma.category.delete({
        where: { id },
        select: { id: true },
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  private resolveSlug(slug: string | undefined, name?: string): string {
    const result = slug ?? slugify(name ?? '');
    if (!SLUG_PATTERN.test(result))
      throw new BadRequestException('Slug inválido');
    return result;
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('El slug ya existe');
      if (error.code === 'P2025')
        throw new NotFoundException('Categoría inexistente');
      if (error.code === 'P2003')
        throw new ConflictException('La categoría tiene productos asociados');
    }
    throw error;
  }
}
