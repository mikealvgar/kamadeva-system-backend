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

export const DEFAULT_CUSTOMER_NAME = 'Cliente default';
const customerSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
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

  /** Also available to the future sales module when no customer is supplied. */
  async ensureDefaultCustomer(): Promise<CustomerDto> {
    const customer = await serializableTransaction(this.prisma, async (tx) => {
      // Persist identity across edits; serializable retries prevent concurrent defaults.
      const defaultCustomer = await tx.customer.findFirst({
        where: { isDefault: true },
        select: customerSelect,
      });
      if (defaultCustomer) return defaultCustomer;
      const existing = await tx.customer.findFirst({
        where: { name: DEFAULT_CUSTOMER_NAME },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: customerSelect,
      });
      if (existing)
        return tx.customer.update({
          where: { id: existing.id },
          data: { isDefault: true },
          select: customerSelect,
        });
      return tx.customer.create({
        data: {
          name: DEFAULT_CUSTOMER_NAME,
          phone: null,
          email: null,
          isActive: true,
          isDefault: true,
        },
        select: customerSelect,
      });
    });
    return this.toDto(customer);
  }

  async create(dto: CreateCustomerDto): Promise<CustomerDto> {
    const name = dto.name.trim();
    try {
      return this.toDto(
        await this.prisma.customer.create({
          data: {
            name,
            phone: dto.phone?.trim() || null,
            email: dto.email?.trim().toLowerCase() || null,
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
      ...(query.includeInactive === 'true' ? {} : { isActive: true }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
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
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined)
      data.email = dto.email?.trim().toLowerCase() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
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
      select: { isDefault: true },
    });
    if (!customer) throw new NotFoundException('Cliente inexistente');
    if (customer.isDefault) {
      throw new ConflictException('No se puede eliminar el cliente default');
    }
    try {
      // Both foreign keys use RESTRICT, including concurrent quote/sale inserts.
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
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      isActive: customer.isActive,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
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
