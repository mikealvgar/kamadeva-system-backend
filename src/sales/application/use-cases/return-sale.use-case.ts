import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  UNIT_OF_WORK_PORT,
  type UnitOfWorkPort,
} from '../../../common/application/unit-of-work.port.js';
import {
  SaleNotCancellableException,
  SaleNotFoundException,
} from '../../domain/sale-exceptions.js';
import {
  SALE_QUERY_PORT,
  type SaleDetailView,
  type SaleQueryPort,
} from '../ports/sale-query.port.js';

export interface ReturnItemCommand {
  saleItemId?: string;
  productId?: string;
  sizeId?: string;
  quantity: number;
  reason?: string;
}

export interface ReturnSaleCommand {
  actorId: string;
  reason?: string;
  items: ReturnItemCommand[];
}

@Injectable()
export class ReturnSaleUseCase {
  constructor(
    @Inject(SALE_QUERY_PORT)
    private readonly saleQuery: SaleQueryPort,
    @Inject(UNIT_OF_WORK_PORT)
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    id: string,
    command: ReturnSaleCommand,
  ): Promise<SaleDetailView> {
    if (!command.items || command.items.length === 0) {
      throw new BadRequestException(
        'Debe especificar al menos un producto a devolver',
      );
    }

    return this.unitOfWork.execute(async (tx) => {
      const client = tx ?? this.prisma;
      const sale = await client.sale.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              inventoryMovements: {
                where: { tipo: 'RETURN_IN' },
                select: { cambioExistencias: true },
              },
            },
          },
        },
      });

      if (!sale) throw new SaleNotFoundException('Venta inexistente');

      if (sale.estado === 'CANCELLED') {
        throw new SaleNotCancellableException(
          'La venta se encuentra cancelada',
        );
      }
      if (sale.estado === 'REFUNDED') {
        throw new SaleNotCancellableException(
          'La venta ya fue devuelta en su totalidad',
        );
      }

      const returningByItemId = new Map<string, Prisma.Decimal>();
      const movementsToCreate: Prisma.InventoryMovementCreateManyInput[] = [];

      for (const itemCommand of command.items) {
        if (!itemCommand.saleItemId && !itemCommand.productId) {
          throw new BadRequestException(
            'Debe indicar renglonId o productoId para cada artículo a devolver',
          );
        }

        const saleItem = sale.items.find((it) => {
          if (itemCommand.saleItemId) {
            return it.id === itemCommand.saleItemId;
          }
          if (itemCommand.productId) {
            const matchesProduct = it.productoId === itemCommand.productId;
            const matchesSize = itemCommand.sizeId
              ? it.tallaId === itemCommand.sizeId
              : true;
            return matchesProduct && matchesSize;
          }
          return false;
        });

        if (!saleItem) {
          throw new BadRequestException(
            'El producto a devolver no pertenece a esta venta',
          );
        }

        const requestedQuantity = new Prisma.Decimal(itemCommand.quantity);
        if (requestedQuantity.lessThanOrEqualTo(0)) {
          throw new BadRequestException('La cantidad debe ser mayor a cero');
        }

        const alreadyReturned = saleItem.inventoryMovements.reduce(
          (sum, mov) => sum.plus(mov.cambioExistencias),
          new Prisma.Decimal(0),
        );

        const currentRequested =
          returningByItemId.get(saleItem.id) ?? new Prisma.Decimal(0);
        const totalPendingReturn = alreadyReturned.plus(currentRequested);
        const remainingAvailable = saleItem.cantidad.minus(totalPendingReturn);

        if (requestedQuantity.greaterThan(remainingAvailable)) {
          throw new ConflictException(
            `La cantidad a devolver (${requestedQuantity.toFixed(3)}) excede lo disponible (${remainingAvailable.toFixed(3)}) en la venta`,
          );
        }

        returningByItemId.set(
          saleItem.id,
          currentRequested.plus(requestedQuantity),
        );

        movementsToCreate.push({
          tipo: 'RETURN_IN',
          cambioExistencias: requestedQuantity,
          productoId: saleItem.productoId,
          renglonVentaId: saleItem.id,
          tipoReferencia: 'SALE_RETURN',
          referenciaId: sale.id,
          creadoPorId: command.actorId,
          notas:
            itemCommand.reason?.trim() ??
            command.reason?.trim() ??
            `Devolución parcial de venta ${sale.folio}`,
        });
      }

      // 1. Crear movimientos de entrada de stock
      await client.inventoryMovement.createMany({
        data: movementsToCreate,
      });

      // 2. Si todos los productos de la venta ya quedaron devueltos al 100%, marcar la venta como REFUNDED
      const isCompletelyReturned = sale.items.every((it) => {
        const returnedBefore = it.inventoryMovements.reduce(
          (sum, mov) => sum.plus(mov.cambioExistencias),
          new Prisma.Decimal(0),
        );
        const returnedNow =
          returningByItemId.get(it.id) ?? new Prisma.Decimal(0);
        const totalReturned = returnedBefore.plus(returnedNow);
        return it.cantidad.minus(totalReturned).lessThanOrEqualTo(0);
      });

      if (isCompletelyReturned) {
        await client.sale.update({
          where: { id: sale.id },
          data: {
            estado: 'REFUNDED',
            fechaCancelacion: new Date(),
            canceladoPorId: command.actorId,
            motivoCancelacion: command.reason?.trim() ?? 'Devolución total',
          },
        });
      }

      const detail = await this.saleQuery.findDetail(id, client);
      if (!detail) throw new SaleNotFoundException('Venta inexistente');
      return detail;
    });
  }
}
