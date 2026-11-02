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
  tipo: true,
  cambioExistencias: true,
  costoUnitario: true,
  tipoReferencia: true,
  referenciaId: true,
  notas: true,
  fechaCreacion: true,
} satisfies Prisma.InventoryMovementSelect;
type MovementRecord = Prisma.InventoryMovementGetPayload<{
  select: typeof movementSelect;
}>;

function toDto(movement: MovementRecord): InventoryMovementDto {
  return {
    id: movement.id,
    type: movement.tipo,
    quantityChange: movement.cambioExistencias.toFixed(3),
    unitCost: movement.costoUnitario?.toFixed(2) ?? null,
    referenceType: movement.tipoReferencia,
    referenceId: movement.referenciaId,
    notes: movement.notas,
    createdAt: movement.fechaCreacion.toISOString(),
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
          productoId: productId,
          creadoPorId: actorId,
          tipo: dto.type,
          cambioExistencias:
            dto.type === 'ADJUSTMENT_OUT' ? quantity.negated() : quantity,
          costoUnitario:
            dto.unitCost === undefined
              ? null
              : new Prisma.Decimal(dto.unitCost),
          notas: dto.notes?.trim() || null,
          tipoReferencia: null,
          referenciaId: null,
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
    if (query.productId) where.productoId = query.productId;
    if (query.type) where.tipo = query.type;
    if (query.startDate || query.endDate) {
      where.fechaCreacion = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }
    const movements = await this.prisma.inventoryMovement.findMany({
      where,
      orderBy: { fechaCreacion: 'desc' },
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
