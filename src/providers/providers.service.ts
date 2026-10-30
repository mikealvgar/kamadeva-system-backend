import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import type { CreateProviderDto } from './dto/create-provider.dto.js';
import type { ListProvidersDto } from './dto/list-providers.dto.js';
import type { ProviderDto } from './dto/provider.dto.js';
import type { UpdateProviderDto } from './dto/update-provider.dto.js';

const DUPLICATE = 'Ya existe un proveedor con ese nombre';
const MISSING = 'Proveedor inexistente';

const providerSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  contactName: true,
  address: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProviderSelect;
type ProviderRecord = Prisma.ProviderGetPayload<{
  select: typeof providerSelect;
}>;

function toDto(provider: ProviderRecord): ProviderDto {
  return {
    id: provider.id,
    nombre: provider.name,
    telefono: provider.phone,
    email: provider.email,
    contacto: provider.contactName,
    direccion: provider.address,
    isActive: provider.isActive,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}

const optional = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() || null;

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProviderDto): Promise<ProviderDto> {
    const name = dto.nombre.trim();
    try {
      // Serializable read of the name predicate blocks concurrent duplicates.
      return await serializableTransaction(this.prisma, async (tx) => {
        await this.assertNameFree(name, tx);
        return toDto(
          await tx.provider.create({
            data: {
              name,
              phone: optional(dto.telefono) ?? null,
              email: optional(dto.email)?.toLowerCase() ?? null,
              contactName: optional(dto.contacto) ?? null,
              address: optional(dto.direccion) ?? null,
            },
            select: providerSelect,
          }),
        );
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findAll(query: ListProvidersDto = {}): Promise<ProviderDto[]> {
    const search = query.search?.trim();
    const contains = (value: string) => ({
      contains: value,
      mode: 'insensitive' as const,
    });
    const providers = await this.prisma.provider.findMany({
      where: {
        ...(query.includeInactive === 'true' ? {} : { isActive: true }),
        ...(search
          ? {
              OR: [
                { name: contains(search) },
                { contactName: contains(search) },
                { email: contains(search) },
                { phone: contains(search) },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      select: providerSelect,
    });
    return providers.map(toDto);
  }

  async findById(id: string): Promise<ProviderDto> {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      select: providerSelect,
    });
    if (!provider) throw new NotFoundException(MISSING);
    return toDto(provider);
  }

  async update(id: string, dto: UpdateProviderDto): Promise<ProviderDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Debe enviar al menos un campo');
    }
    const data: Prisma.ProviderUpdateInput = {};
    if (dto.nombre !== undefined) data.name = dto.nombre.trim();
    if (dto.telefono !== undefined) data.phone = optional(dto.telefono);
    if (dto.email !== undefined)
      data.email = optional(dto.email)?.toLowerCase() ?? null;
    if (dto.contacto !== undefined) data.contactName = optional(dto.contacto);
    if (dto.direccion !== undefined) data.address = optional(dto.direccion);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        if (typeof data.name === 'string')
          await this.assertNameFree(data.name, tx, id);
        return toDto(
          await tx.provider.update({
            where: { id },
            data,
            select: providerSelect,
          }),
        );
      });
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

  private async assertNameFree(
    name: string,
    tx: Prisma.TransactionClient,
    exceptId?: string,
  ): Promise<void> {
    const existing = await tx.provider.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException(DUPLICATE);
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException(DUPLICATE);
      if (error.code === 'P2025') throw new NotFoundException(MISSING);
      // Future relations (expenses, purchases) will reference providers with RESTRICT.
      if (error.code === 'P2003')
        throw new ConflictException('El proveedor tiene registros asociados');
    }
    throw error;
  }
}
