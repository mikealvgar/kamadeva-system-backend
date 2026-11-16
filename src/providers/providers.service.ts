import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProviderDto } from './dto/provider.dto.js';
import type { CreateProviderDto } from './dto/create-provider.dto.js';
import type { UpdateProviderDto } from './dto/update-provider.dto.js';
import type { ListProvidersDto } from './dto/list-providers.dto.js';
import {
  calculateSkipTake,
  resolvePrismaOrderBy,
} from '../common/pagination/prisma-pagination.helper.js';
import {
  createPaginatedResponse,
  PaginatedResponseDto,
} from '../common/dto/paginated-response.dto.js';

const providerSelect = {
  id: true,
  nombre: true,
  telefono: true,
  correo: true,
  nombreContacto: true,
  direccion: true,
  activo: true,
  fechaCreacion: true,
  fechaActualizacion: true,
} satisfies Prisma.ProviderSelect;
type PublicProvider = Prisma.ProviderGetPayload<{
  select: typeof providerSelect;
}>;

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProviderDto): Promise<ProviderDto> {
    const nombre = dto.nombre.trim();
    const existing = await this.prisma.provider.findFirst({
      where: { nombre: { equals: nombre, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('Ya existe un proveedor con ese nombre');
    }
    const correo = (dto.correo ?? dto.email)?.trim().toLowerCase() || null;
    const nombreContacto = (dto.nombreContacto ?? dto.contacto)?.trim() || null;
    try {
      return this.toDto(
        await this.prisma.provider.create({
          data: {
            nombre,
            telefono: dto.telefono?.trim() || null,
            correo,
            nombreContacto,
            direccion: dto.direccion?.trim() || null,
            activo: dto.activo ?? true,
          },
          select: providerSelect,
        }),
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findAll(query: ListProvidersDto = {}): Promise<PaginatedResponseDto<ProviderDto>> {
    const search = query.search?.trim();
    const where: Prisma.ProviderWhereInput = {
      ...(query.includeInactive === 'true' ? {} : { activo: true }),
      ...(search
        ? {
            OR: [
              { nombre: { contains: search, mode: 'insensitive' as const } },
              { correo: { contains: search, mode: 'insensitive' as const } },
              { telefono: { contains: search, mode: 'insensitive' as const } },
              { nombreContacto: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const { skip, take } = calculateSkipTake(query);
    const orderBy = resolvePrismaOrderBy({
      sortBy: query.sortBy,
      direction: query.direction,
      allowedFields: {
        nombre: 'nombre',
        name: 'nombre',
        correo: 'correo',
        email: 'correo',
        telefono: 'telefono',
        phone: 'telefono',
        nombreContacto: 'nombreContacto',
        contactName: 'nombreContacto',
        direccion: 'direccion',
        address: 'direccion',
        fechaCreacion: 'createdAt',
        createdAt: 'createdAt',
      },
      defaultOrderBy: { nombre: 'asc' },
    });

    const [totalRecords, providers] = await Promise.all([
      this.prisma.provider.count({ where }),
      this.prisma.provider.findMany({
        where,
        orderBy,
        skip,
        take,
        select: providerSelect,
      }),
    ]);

    return createPaginatedResponse({
      items: providers.map((provider) => this.toDto(provider)),
      totalRecords,
      page: query.page,
      size: query.size,
    });
  }

  async findById(id: string): Promise<ProviderDto> {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      select: providerSelect,
    });
    if (!provider) throw new NotFoundException('Proveedor inexistente');
    return this.toDto(provider);
  }

  async update(id: string, dto: UpdateProviderDto): Promise<ProviderDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Debe enviar al menos un campo');
    }
    const data: Prisma.ProviderUpdateInput = {};
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      const existing = await this.prisma.provider.findFirst({
        where: {
          nombre: { equals: nombre, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException('Ya existe un proveedor con ese nombre');
      }
      data.nombre = nombre;
    }
    if (dto.telefono !== undefined)
      data.telefono = dto.telefono?.trim() || null;
    const correo = dto.correo ?? dto.email;
    if (correo !== undefined)
      data.correo = correo?.trim().toLowerCase() || null;
    const contacto = dto.nombreContacto ?? dto.contacto;
    if (contacto !== undefined)
      data.nombreContacto = contacto?.trim() || null;
    if (dto.direccion !== undefined)
      data.direccion = dto.direccion?.trim() || null;
    const activo = dto.activo ?? dto.isActive;
    if (activo !== undefined) data.activo = activo;

    try {
      return this.toDto(
        await this.prisma.provider.update({
          where: { id },
          data,
          select: providerSelect,
        }),
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.provider.delete({
        where: { id },
        select: { id: true },
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  private toDto(provider: PublicProvider): ProviderDto {
    return {
      id: provider.id,
      nombre: provider.nombre,
      telefono: provider.telefono,
      correo: provider.correo,
      email: provider.correo,
      nombreContacto: provider.nombreContacto,
      contacto: provider.nombreContacto,
      direccion: provider.direccion,
      activo: provider.activo,
      isActive: provider.activo,
      fechaCreacion: provider.fechaCreacion.toISOString(),
      fechaActualizacion: provider.fechaActualizacion.toISOString(),
      createdAt: provider.fechaCreacion.toISOString(),
      updatedAt: provider.fechaActualizacion.toISOString(),
    };
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('El nombre de proveedor ya existe');
      if (error.code === 'P2025')
        throw new NotFoundException('Proveedor inexistente');
      if (error.code === 'P2003')
        throw new ConflictException('El proveedor tiene compras asociadas');
    }
    throw error;
  }
}
