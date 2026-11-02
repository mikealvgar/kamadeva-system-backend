import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import type { CreateExpenseCategoryDto } from './dto/create-expense-category.dto.js';
import type { ExpenseCategoryDto } from './dto/expense-category.dto.js';
import type { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto.js';

const categorySelect = {
  id: true,
  nombre: true,
  activo: true,
} satisfies Prisma.ExpenseCategorySelect;
type CategoryRecord = Prisma.ExpenseCategoryGetPayload<{
  select: typeof categorySelect;
}>;

function toDto(category: CategoryRecord): ExpenseCategoryDto {
  return {
    id: category.id,
    nombre: category.nombre,
    name: category.nombre,
    activo: category.activo,
    isActive: category.activo,
  };
}

@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExpenseCategoryDto): Promise<ExpenseCategoryDto> {
    const raw = dto.nombre ?? dto.name;
    if (!raw || !raw.trim()) {
      throw new BadRequestException('El nombre de la categoría es obligatorio');
    }
    const nombre = raw.trim();
    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        await this.assertNameFree(nombre, tx);
        const record = await tx.expenseCategory.create({
          data: { nombre },
          select: categorySelect,
        });
        return toDto(record);
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async findAll(includeInactive = false): Promise<ExpenseCategoryDto[]> {
    const records = await this.prisma.expenseCategory.findMany({
      where: includeInactive ? {} : { activo: true },
      orderBy: { nombre: 'asc' },
      select: categorySelect,
    });
    return records.map(toDto);
  }

  async findById(id: string): Promise<ExpenseCategoryDto> {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id },
      select: categorySelect,
    });
    if (!category) throw new NotFoundException('Categoría inexistente');
    return toDto(category);
  }

  async update(
    id: string,
    dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategoryDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Debe enviar al menos un campo');
    }
    const raw = dto.nombre ?? dto.name;
    const nombre = raw !== undefined ? raw.trim() : undefined;
    const activo = dto.activo ?? dto.isActive;

    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        const existing = await tx.expenseCategory.findUnique({
          where: { id },
          select: { id: true, nombre: true },
        });
        if (!existing) throw new NotFoundException('Categoría inexistente');
        if (nombre && nombre.toLowerCase() !== existing.nombre.toLowerCase()) {
          await this.assertNameFree(nombre, tx);
        }
        const data: Prisma.ExpenseCategoryUpdateInput = {};
        if (nombre !== undefined) data.nombre = nombre;
        if (activo !== undefined) data.activo = activo;
        const record = await tx.expenseCategory.update({
          where: { id },
          data,
          select: categorySelect,
        });
        return toDto(record);
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.expenseCategory.delete({
        where: { id },
        select: { id: true },
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  private async assertNameFree(
    nombre: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const clash = await tx.expenseCategory.findFirst({
      where: {
        nombre: { equals: nombre, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('La categoría ya existe');
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('La categoría ya existe');
      if (error.code === 'P2025')
        throw new NotFoundException('Categoría inexistente');
      if (error.code === 'P2003')
        throw new ConflictException('La categoría tiene egresos asociados');
    }
    throw error;
  }
}
