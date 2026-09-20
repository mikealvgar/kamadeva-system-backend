import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  manualMovementTypes,
  type CreateInventoryMovementDto,
} from './dto/create-inventory-movement.dto.js';
import type { ListInventoryMovementsDto } from './dto/list-inventory-movements.dto.js';
import type { InventoryMovementDto } from '../products/dto/inventory-movement.dto.js';

const movementSelect = {
  id: true,
  type: true,
  quantityChange: true,
  unitCost: true,
  referenceType: true,
  referenceId: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.InventoryMovementSelect;
type MovementRecord = Prisma.InventoryMovementGetPayload<{
  select: typeof movementSelect;
}>;

function toDto(movement: MovementRecord): InventoryMovementDto {
  return {
    ...movement,
    quantityChange: movement.quantityChange.toFixed(3),
    unitCost: movement.unitCost?.toFixed(2) ?? null,
    createdAt: movement.createdAt.toISOString(),
  };
}

@Injectable()
export class InventoryMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    productId: string,
    dto: CreateInventoryMovementDto,
    actorId: string,
  ): Promise<InventoryMovementDto> {
    if (!manualMovementTypes.some((type) => type === dto.type))
      throw new BadRequestException('Tipo de movimiento manual inválido');
    await this.requireProduct(productId);
    const quantity = new Prisma.Decimal(dto.quantity);
    try {
      const movement = await this.prisma.inventoryMovement.create({
        data: {
          product: { connect: { id: productId } },
          createdBy: { connect: { id: actorId } },
          type: dto.type,
          quantityChange:
            dto.type === 'ADJUSTMENT_OUT' ? quantity.negated() : quantity,
          unitCost:
            dto.unitCost === undefined
              ? null
              : new Prisma.Decimal(dto.unitCost),
          notes: dto.notes?.trim() || null,
          referenceType: null,
          referenceId: null,
        },
        select: movementSelect,
      });
      return toDto(movement);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      )
        throw new NotFoundException('Registro relacionado inexistente');
      throw error;
    }
  }

  async findAll(
    query: ListInventoryMovementsDto = {},
  ): Promise<InventoryMovementDto[]> {
    for (const value of [query.startDate, query.endDate]) {
      if (value !== undefined && !Number.isFinite(new Date(value).getTime()))
        throw new BadRequestException('Fecha inválida');
    }
    if (query.productId) await this.requireProduct(query.productId);
    const where: Prisma.InventoryMovementWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.type) where.type = query.type;
    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }
    const movements = await this.prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: movementSelect,
    });
    return movements.map(toDto);
  }

  private async requireProduct(id: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Producto inexistente');
  }
}
