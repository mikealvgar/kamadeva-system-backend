import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import type { CustomerDto } from './dto/customer.dto.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';
import type { ListCustomersDto } from './dto/list-customers.dto.js';

export const DEFAULT_CUSTOMER_NAME = 'PÚBLICO EN GENERAL';
const customerSelect = {
  id: true,
  nombre: true,
  telefono: true,
  correo: true,
  activo: true,
  esPredeterminado: true,
  fechaCreacion: true,
  fechaActualizacion: true,
} satisfies Prisma.CustomerSelect;
type PublicCustomer = Prisma.CustomerGetPayload<{
  select: typeof customerSelect;
}>;

@Injectable()
export class CustomersService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultCustomer();
  }

  async ensureDefaultCustomer(): Promise<CustomerDto> {
    const customer = await serializableTransaction(this.prisma, async (tx) => {
      const defaultCustomer = await tx.customer.findFirst({
        where: { esPredeterminado: true },
        select: customerSelect,
      });
      if (defaultCustomer) return defaultCustomer;
      const existing = await tx.customer.findFirst({
        where: { nombre: DEFAULT_CUSTOMER_NAME },
        orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }],
        select: customerSelect,
      });
      if (existing)
        return tx.customer.update({
          where: { id: existing.id },
          data: { esPredeterminado: true },
          select: customerSelect,
        });
      return tx.customer.create({
        data: {
          nombre: DEFAULT_CUSTOMER_NAME,
          telefono: null,
          correo: null,
          activo: true,
          esPredeterminado: true,
        },
        select: customerSelect,
      });
    });
    return this.toDto(customer);
  }

  async create(dto: CreateCustomerDto): Promise<CustomerDto> {
    const rawNombre = dto.nombre ?? dto.name;
    if (!rawNombre || !rawNombre.trim()) {
      throw new BadRequestException('El nombre del cliente es obligatorio');
    }
    const nombre = rawNombre.trim();
    const telefono = (dto.telefono ?? dto.phone)?.trim() || null;
    const correo = (dto.correo ?? dto.email)?.trim().toLowerCase() || null;
    try {
      return this.toDto(
        await this.prisma.customer.create({
          data: {
            nombre,
            telefono,
            correo,
          },
          select: customerSelect,
        }),
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findAll(query: ListCustomersDto = {}): Promise<CustomerDto[]> {
    const search = query.search?.trim();
    const where: Prisma.CustomerWhereInput = {
      ...(query.includeInactive === 'true' ? {} : { activo: true }),
      ...(search
        ? {
            OR: [
              { nombre: { contains: search, mode: 'insensitive' as const } },
              { correo: { contains: search, mode: 'insensitive' as const } },
              { telefono: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { nombre: 'asc' },
      select: customerSelect,
    });
    return customers.map((customer) => this.toDto(customer));
  }

  async findById(id: string): Promise<CustomerDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: customerSelect,
    });
    if (!customer) throw new NotFoundException('Cliente inexistente');
    return this.toDto(customer);
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Debe enviar al menos un campo');
    }
    const data: Prisma.CustomerUpdateInput = {};
    const nombre = dto.nombre !== undefined ? dto.nombre : dto.name;
    if (nombre !== undefined) {
      if (typeof nombre !== 'string' || !nombre.trim()) {
        throw new BadRequestException('El nombre del cliente no puede estar vacío');
      }
      data.nombre = nombre.trim();
    }
    const telefono = dto.telefono !== undefined ? dto.telefono : dto.phone;
    if (telefono !== undefined) data.telefono = telefono?.trim() || null;
    const correo = dto.correo !== undefined ? dto.correo : dto.email;
    if (correo !== undefined)
      data.correo = correo?.trim().toLowerCase() || null;
    const activo = dto.activo !== undefined ? dto.activo : dto.isActive;
    if (activo !== undefined) {
      if (typeof activo !== 'boolean') {
        throw new BadRequestException('El estado activo debe ser un valor booleano');
      }
      data.activo = activo;
    }
    try {
      return this.toDto(
        await this.prisma.customer.update({
          where: { id },
          data,
          select: customerSelect,
        }),
      );
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(id: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { esPredeterminado: true },
    });
    if (!customer) throw new NotFoundException('Cliente inexistente');
    if (customer.esPredeterminado) {
      throw new ConflictException('No se puede eliminar el cliente default');
    }
    try {
      await this.prisma.customer.delete({
        where: { id },
        select: { id: true },
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  private toDto(customer: PublicCustomer): CustomerDto {
    return {
      id: customer.id,
      nombre: customer.nombre,
      name: customer.nombre,
      telefono: customer.telefono,
      phone: customer.telefono,
      correo: customer.correo,
      email: customer.correo,
      activo: customer.activo,
      isActive: customer.activo,
      esPredeterminado: customer.esPredeterminado,
      fechaCreacion: customer.fechaCreacion.toISOString(),
      fechaActualizacion: customer.fechaActualizacion.toISOString(),
      createdAt: customer.fechaCreacion.toISOString(),
      updatedAt: customer.fechaActualizacion.toISOString(),
    };
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025')
        throw new NotFoundException('Cliente inexistente');
      if (error.code === 'P2003')
        throw new ConflictException(
          'El cliente tiene cotizaciones o ventas asociadas',
        );
    }
    throw error;
  }
}
