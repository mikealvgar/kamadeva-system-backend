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
  name: true,
  isActive: true,
} satisfies Prisma.ExpenseCategorySelect;

@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExpenseCategoryDto): Promise<ExpenseCategoryDto> {
    const name = dto.name.trim();
    try {
      // Serializable read of the name predicate blocks concurrent duplicates.
      return await serializableTransaction(this.prisma, async (tx) => {
        await this.assertNameFree(name, tx);
        return tx.expenseCategory.create({
          data: { name },
          select: categorySelect,
        });
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  findAll(includeInactive = false): Promise<ExpenseCategoryDto[]> {
    return this.prisma.expenseCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      select: categorySelect,
    });
  }

  async findById(id: string): Promise<ExpenseCategoryDto> {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id },
      select: categorySelect,
    });
    if (!category)
      throw new NotFoundException('Categoría de gasto inexistente');
    return category;
  }

  async update(
    id: string,
    dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategoryDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Debe enviar al menos un campo');
    }
    const data: Prisma.ExpenseCategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    try {
      return await serializableTransaction(this.prisma, async (tx) => {
        if (typeof data.name === 'string')
          await this.assertNameFree(data.name, tx, id);
        return tx.expenseCategory.update({
          where: { id },
          data,
          select: categorySelect,
        });
      });
    } catch (error) {
      this.rethrow(error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      // Expenses reference categories with RESTRICT, including races.
      await this.prisma.expenseCategory.delete({
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
    const existing = await tx.expenseCategory.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException('La categoría de gasto ya existe');
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException('La categoría de gasto ya existe');
      if (error.code === 'P2025')
        throw new NotFoundException('Categoría de gasto inexistente');
      if (error.code === 'P2003')
        throw new ConflictException(
          'La categoría de gasto tiene gastos asociados',
        );
    }
    throw error;
  }
}
