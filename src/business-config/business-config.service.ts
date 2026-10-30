import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  BusinessConfigDto,
  UpdateBusinessConfigDto,
} from './dto/business-config.dto.js';

const KEY = 'default';

const configSelect = {
  name: true,
  address: true,
  neighborhood: true,
  municipality: true,
  state: true,
  phone: true,
  taxId: true,
  ticketFooter: true,
  updatedAt: true,
} satisfies Prisma.BusinessConfigSelect;
type ConfigRecord = Prisma.BusinessConfigGetPayload<{
  select: typeof configSelect;
}>;

function toDto(config: ConfigRecord): BusinessConfigDto {
  return {
    nombre: config.name,
    direccion: config.address,
    colonia: config.neighborhood,
    municipio: config.municipality,
    estado: config.state,
    telefono: config.phone,
    rfc: config.taxId,
    mensajePie: config.ticketFooter,
    updatedAt: config.updatedAt.toISOString(),
  };
}

@Injectable()
export class BusinessConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<BusinessConfigDto> {
    const config = await this.prisma.businessConfig.findUnique({
      where: { key: KEY },
      select: configSelect,
    });
    if (!config)
      throw new NotFoundException('Configuración del negocio no registrada');
    return toDto(config);
  }

  /** Full replacement of the single configuration row. */
  async update(dto: UpdateBusinessConfigDto): Promise<BusinessConfigDto> {
    const data = {
      name: dto.nombre.trim(),
      address: dto.direccion.trim(),
      neighborhood: dto.colonia.trim(),
      municipality: dto.municipio.trim(),
      state: dto.estado.trim(),
      phone: dto.telefono.trim(),
      taxId: dto.rfc.trim().toUpperCase(),
      ticketFooter: dto.mensajePie.trim(),
    };
    // Atomic INSERT ... ON CONFLICT on the fixed key; concurrent saves cannot
    // create a second row.
    const config = await this.prisma.businessConfig.upsert({
      where: { key: KEY },
      create: { key: KEY, ...data },
      update: data,
      select: configSelect,
    });
    return toDto(config);
  }
}
