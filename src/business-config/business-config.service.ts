import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  BusinessConfigDto,
  UpdateBusinessConfigDto,
} from './dto/business-config.dto.js';

const KEY = 'default';

const configSelect = {
  nombre: true,
  direccion: true,
  colonia: true,
  municipio: true,
  estado: true,
  telefono: true,
  rfc: true,
  mensajePie: true,
  fechaActualizacion: true,
} satisfies Prisma.BusinessConfigSelect;
type ConfigRecord = Prisma.BusinessConfigGetPayload<{
  select: typeof configSelect;
}>;

function toDto(config: ConfigRecord): BusinessConfigDto {
  return {
    nombre: config.nombre,
    direccion: config.direccion,
    colonia: config.colonia,
    municipio: config.municipio,
    estado: config.estado,
    telefono: config.telefono,
    rfc: config.rfc,
    mensajePie: config.mensajePie,
    updatedAt: config.fechaActualizacion.toISOString(),
  };
}

@Injectable()
export class BusinessConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<BusinessConfigDto> {
    const config = await this.prisma.businessConfig.findUnique({
      where: { clave: KEY },
      select: configSelect,
    });
    if (!config)
      throw new NotFoundException('Configuración del negocio no registrada');
    return toDto(config);
  }

  async update(dto: UpdateBusinessConfigDto): Promise<BusinessConfigDto> {
    const data = {
      nombre: dto.nombre.trim(),
      direccion: dto.direccion.trim(),
      colonia: dto.colonia.trim(),
      municipio: dto.municipio.trim(),
      estado: dto.estado.trim(),
      telefono: dto.telefono.trim(),
      rfc: dto.rfc.trim().toUpperCase(),
      mensajePie: dto.mensajePie.trim(),
    };
    const config = await this.prisma.businessConfig.upsert({
      where: { clave: KEY },
      create: { clave: KEY, ...data },
      update: data,
      select: configSelect,
    });
    return toDto(config);
  }
}
