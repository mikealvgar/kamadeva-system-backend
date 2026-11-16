import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createPaginatedResponse } from '../common/dto/paginated-response.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { Money, Quantity } from '../common/domain/money.js';
import { InvalidAmountException } from '../common/domain/domain-exception.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import type { ListPurchasesDto } from './dto/list-purchases.dto.js';
import type { PurchaseDto, PurchasePageDto } from './dto/purchase.dto.js';
import {
  calculateSkipTake,
  resolvePrismaOrderBy,
} from '../common/pagination/prisma-pagination.helper.js';

const purchaseSelect = {
  id: true,
  proveedor: { select: { id: true, nombre: true } },
  fechaCompra: true,
  fechaRecepcion: true,
  folioProveedor: true,
  notas: true,
  iva: true,
  total: true,
  creadoPorId: true,
  estado: true,
  fechaCancelacion: true,
  canceladoPor: { select: { id: true, nombre: true } },
  motivoCancelacion: true,
  fechaCreacion: true,
  items: {
    orderBy: { posicion: 'asc' },
    select: {
      id: true,
      productoId: true,
      nombreProducto: true,
      codigoBarras: true,
      cantidad: true,
      costoUnitario: true,
      subtotalRenglon: true,
    },
  },
} satisfies Prisma.PurchaseSelect;

type PurchaseRecord = Prisma.PurchaseGetPayload<{
  select: typeof purchaseSelect;
}>;

function toDto(purchase: PurchaseRecord): PurchaseDto {
  return {
    id: purchase.id,
    proveedor: {
      id: purchase.proveedor.id,
      nombre: purchase.proveedor.nombre,
    },
    fechaCompra: purchase.fechaCompra.toISOString(),
    fechaRecepcion: purchase.fechaRecepcion.toISOString(),
    folioProveedor: purchase.folioProveedor,
    notas: purchase.notas,
    iva: purchase.iva.toFixed(2),
    total: purchase.total.toFixed(2),
    productos: purchase.items.map((item) => ({
      id: item.id,
      producto: {
        id: item.productoId,
        articulo: item.nombreProducto,
        codigoBarras: item.codigoBarras,
      },
      cantidad: item.cantidad.toFixed(3),
      costoUnitario: item.costoUnitario.toFixed(2),
      subtotal: item.subtotalRenglon.toFixed(2),
    })),
    creadoPorId: purchase.creadoPorId,
    estado: purchase.estado,
    fechaCancelacion: purchase.fechaCancelacion?.toISOString() ?? null,
    canceladoPor: purchase.canceladoPor
      ? { id: purchase.canceladoPor.id, nombre: purchase.canceladoPor.nombre }
      : null,
    motivoCancelacion: purchase.motivoCancelacion,
    createdAt: purchase.fechaCreacion.toISOString(),
  };
}

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePurchaseDto, actorId: string): Promise<PurchaseDto> {
    const fechaCompra = dto.fechaCompra
      ? new Date(dto.fechaCompra)
      : new Date();
    const fechaRecepcion = dto.fechaRecepcion
      ? new Date(dto.fechaRecepcion)
      : new Date();
    const productIds = dto.productos.map(({ productoId }) => productoId);

    try {
      const purchase = await serializableTransaction(
        this.prisma,
        async (tx) => {
          const provider = await tx.provider.findUnique({
            where: { id: dto.proveedorId },
            select: { id: true, activo: true },
          });
          if (!provider) throw new NotFoundException('Proveedor inexistente');
          if (!provider.activo)
            throw new ConflictException('El proveedor está inactivo');

          const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              nombre: true,
              codigoBarras: true,
              precioCompra: true,
              activo: true,
            },
          });
          if (products.length !== productIds.length)
            throw new NotFoundException('Producto inexistente');

          const byId = new Map(
            products.map((product) => [product.id, product]),
          );
          const lines = dto.productos.map((input, posicion) => {
            const product = byId.get(input.productoId)!;
            if (!product.activo)
              throw new ConflictException(
                `El producto ${product.codigoBarras} está inactivo`,
              );
            const effectiveCost =
              input.precioCompra !== undefined
                ? input.precioCompra
                : product.precioCompra;
            if (effectiveCost === null)
              throw new BadRequestException(
                `Configura el precio de compra del producto ${product.codigoBarras} antes de registrarlo`,
              );

            const quantity = new Quantity(input.cantidad);
            const unitCost = new Money(effectiveCost);
            const lineSubtotal = unitCost.times(quantity);
            return {
              posicion,
              product,
              cantidad: quantity.toDecimal(),
              costoUnitario: unitCost.toDecimal(),
              subtotalRenglon: lineSubtotal.toDecimal(),
              updatePrecioCompra:
                input.precioCompra !== undefined
                  ? unitCost.toDecimal()
                  : undefined,
              updatePrecioVenta:
                input.precioVenta !== undefined
                  ? new Money(input.precioVenta).toDecimal()
                  : undefined,
            };
          });

          for (const line of lines) {
            if (
              line.updatePrecioCompra !== undefined ||
              line.updatePrecioVenta !== undefined
            ) {
              await tx.product.update({
                where: { id: line.product.id },
                data: {
                  ...(line.updatePrecioCompra !== undefined
                    ? { precioCompra: line.updatePrecioCompra }
                    : {}),
                  ...(line.updatePrecioVenta !== undefined
                    ? { precioVenta: line.updatePrecioVenta }
                    : {}),
                },
              });
            }
          }

          const subtotal = lines.reduce(
            (sum, line) => sum.plus(new Money(line.subtotalRenglon)),
            Money.zero(),
          );
          const iva =
            dto.iva !== undefined ? new Money(dto.iva) : Money.zero();
          const total =
            dto.total !== undefined
              ? new Money(dto.total)
              : subtotal.plus(iva);

          const created = await tx.purchase.create({
            data: {
              proveedorId: provider.id,
              creadoPorId: actorId,
              fechaCompra,
              fechaRecepcion,
              folioProveedor: dto.folioProveedor?.trim() || null,
              notas: dto.notas?.trim() || null,
              iva: iva.toDecimal(),
              total: total.toDecimal(),
              items: {
                create: lines.map((line) => ({
                  posicion: line.posicion,
                  productoId: line.product.id,
                  nombreProducto: line.product.nombre,
                  codigoBarras: line.product.codigoBarras,
                  cantidad: line.cantidad,
                  costoUnitario: line.costoUnitario,
                  subtotalRenglon: line.subtotalRenglon,
                })),
              },
            },
            select: purchaseSelect,
          });

          await tx.inventoryMovement.createMany({
            data: lines.map((line) => ({
              productoId: line.product.id,
              tipo: 'PURCHASE_IN',
              cambioExistencias: line.cantidad,
              costoUnitario: line.costoUnitario,
              tipoReferencia: 'PURCHASE',
              referenciaId: created.id,
              creadoPorId: actorId,
              notas: created.folioProveedor
                ? `Compra recibida: ${created.folioProveedor}`
                : 'Compra recibida de proveedor',
            })),
          });

          return created;
        },
      );
      return toDto(purchase);
    } catch (error) {
      if (error instanceof InvalidAmountException)
        throw new BadRequestException(error.message);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003')
          throw new ConflictException(
            'El proveedor o producto cambió durante el registro de compra',
          );
      }
      throw error;
    }
  }

  async findAll(query: ListPurchasesDto = {}): Promise<PurchasePageDto> {
    const page = query.page ?? query.pagina ?? 1;
    const size = query.size ?? query.limite ?? 10;
    const where: Prisma.PurchaseWhereInput = {};
    if (query.proveedorId) where.proveedorId = query.proveedorId;
    if (query.fechaInicio || query.fechaFin) {
      where.fechaRecepcion = {
        ...(query.fechaInicio ? { gte: new Date(query.fechaInicio) } : {}),
        ...(query.fechaFin ? { lte: new Date(query.fechaFin) } : {}),
      };
    }

    const { skip, take } = calculateSkipTake({ page, size });
    const orderBy = resolvePrismaOrderBy({
      sortBy: query.sortBy,
      direction: query.direction,
      allowedFields: {
        fechaRecepcion: 'fechaRecepcion',
        fechaCreacion: 'fechaCreacion',
        createdAt: 'fechaCreacion',
        total: 'total',
      },
      defaultOrderBy: [{ fechaRecepcion: 'desc' }, { id: 'desc' }],
    });

    const [records, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        orderBy,
        skip,
        take,
        select: purchaseSelect,
      }),
      this.prisma.purchase.count({ where }),
    ]);

    const items = records.map(toDto);
    return createPaginatedResponse({
      items,
      totalRecords: total,
      page,
      size,
    });
  }

  async findById(id: string): Promise<PurchaseDto> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      select: purchaseSelect,
    });
    if (!purchase) throw new NotFoundException('Compra inexistente');
    return toDto(purchase);
  }

  /**
   * Cancels a completed purchase and reverses its stock in the kardex.
   * Repeating the call on an already cancelled purchase returns it without
   * creating duplicate inventory movements.
   */
  async cancel(
    id: string,
    motivo: string,
    actorId: string,
  ): Promise<PurchaseDto> {
    const purchase = await serializableTransaction(
      this.prisma,
      async (tx) => {
        const existing = await tx.purchase.findUnique({
          where: { id },
          select: purchaseSelect,
        });
        if (!existing) throw new NotFoundException('Compra inexistente');
        if (existing.estado === 'CANCELLED') return existing;

        const productIds = existing.items.map((item) => item.productoId);
        const groupedStock = await tx.inventoryMovement.groupBy({
          by: ['productoId'],
          where: { productoId: { in: productIds } },
          _sum: { cambioExistencias: true },
        });
        const stockByProduct = new Map<string, Prisma.Decimal>(
          groupedStock.map((row) => [
            row.productoId,
            new Prisma.Decimal(row._sum.cambioExistencias ?? 0),
          ]),
        );

        for (const item of existing.items) {
          const available =
            stockByProduct.get(item.productoId) ?? new Prisma.Decimal(0);
          if (available.lessThan(item.cantidad)) {
            throw new ConflictException(
              `Stock insuficiente para cancelar la compra del producto ${item.codigoBarras}`,
            );
          }
        }

        const updated = await tx.purchase.update({
          where: { id: existing.id },
          data: {
            estado: 'CANCELLED',
            fechaCancelacion: new Date(),
            canceladoPorId: actorId,
            motivoCancelacion: motivo,
          },
          select: purchaseSelect,
        });

        await tx.inventoryMovement.createMany({
          data: existing.items.map((item) => ({
            productoId: item.productoId,
            tipo: 'ADJUSTMENT_OUT',
            cambioExistencias: item.cantidad.negated(),
            costoUnitario: item.costoUnitario,
            tipoReferencia: 'PURCHASE_CANCELLATION',
            referenciaId: updated.id,
            creadoPorId: actorId,
            notas: `Cancelación de compra: ${motivo}`,
          })),
        });

        return updated;
      },
    );
    return toDto(purchase);
  }
}
