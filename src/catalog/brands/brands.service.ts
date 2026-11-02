import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { BrandDto } from './dto/brand.dto.js';
import type { CreateBrandDto } from './dto/create-brand.dto.js';
import type { UpdateBrandDto } from './dto/update-brand.dto.js';

export function normalizeBrandDescription(desc: string): string {
  return desc.trim().replace(/\s+/g, ' ').toUpperCase();
}

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBrandDto): Promise<BrandDto> {
    const descripcion = normalizeBrandDescription(dto.descripcion);
    try {
      const record = await this.prisma.brand.create({
        data: { descripcion },
      });
      return this.mapToDto(record);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findAll(includeInactive = false): Promise<BrandDto[]> {
    const records = await this.prisma.brand.findMany({
      where: includeInactive ? {} : { activo: true },
      orderBy: { descripcion: 'asc' },
    });
    return records.map((r) => this.mapToDto(r));
  }

  async findById(id: string): Promise<BrandDto> {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
    });
    if (!brand) throw new NotFoundException('Marca inexistente');
    return this.mapToDto(brand);
  }

  async update(id: string, dto: UpdateBrandDto): Promise<BrandDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Debe enviar al menos un campo');
    }
    const data: Prisma.BrandUpdateInput = {};
    if (dto.descripcion !== undefined) {
      data.descripcion = normalizeBrandDescription(dto.descripcion);
    }
    if (dto.activo !== undefined) {
      data.activo = dto.activo;
    }
    try {
      const updated = await this.prisma.brand.update({
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
      await this.prisma.brand.delete({
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
  }): BrandDto {
    return {
      id: r.id,
      descripcion: r.descripcion,
      activo: r.activo,
      fechaCreacion: r.fechaCreacion.toISOString(),
      fechaActualizacion: r.fechaActualizacion.toISOString(),
    };
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('La marca ya existe');
      if (error.code === 'P2025')
        throw new NotFoundException('Marca inexistente');
      if (error.code === 'P2003')
        throw new ConflictException('La marca tiene productos asociados');
    }
    throw error;
  }
}
