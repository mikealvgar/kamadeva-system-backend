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

@Injectable()
export class SizesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSizeDto): Promise<SizeDto> {
    const raw = dto.nombre ?? dto.name;
    if (!raw || !raw.trim()) {
      throw new BadRequestException('El nombre de la talla es obligatorio');
    }
    const nombre = raw.trim().toUpperCase();
    try {
      const record = await this.prisma.size.create({
        data: {
          nombre,
        },
      });
      return this.mapToDto(record);
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findAll(includeInactive = false): Promise<SizeDto[]> {
    const records = await this.prisma.size.findMany({
      where: includeInactive ? {} : { activo: true },
      orderBy: { nombre: 'asc' },
    });
    return records.map((r) => this.mapToDto(r));
  }

  async findById(id: string): Promise<SizeDto> {
    const size = await this.prisma.size.findUnique({
      where: { id },
    });
    if (!size) throw new NotFoundException('Talla inexistente');
    return this.mapToDto(size);
  }

  async update(id: string, dto: UpdateSizeDto): Promise<SizeDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Debe enviar al menos un campo');
    }
    const data: Prisma.SizeUpdateInput = {};
    const raw = dto.nombre ?? dto.name;
    if (raw !== undefined) {
      data.nombre = raw.trim().toUpperCase();
    }
    const activo = dto.activo ?? dto.isActive;
    if (activo !== undefined) {
      data.activo = activo;
    }
    try {
      const updated = await this.prisma.size.update({
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
      await this.prisma.size.delete({ where: { id } });
    } catch (error) {
      this.rethrow(error);
    }
  }

  private mapToDto(r: { id: string; nombre: string; activo: boolean }): SizeDto {
    return {
      id: r.id,
      nombre: r.nombre,
      name: r.nombre,
      activo: r.activo,
      isActive: r.activo,
    };
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
