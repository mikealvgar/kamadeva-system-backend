import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { Money, Quantity } from '../common/domain/money.js';
import { InvalidAmountException } from '../common/domain/domain-exception.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import type { ListPurchasesDto } from './dto/list-purchases.dto.js';
import type { PurchaseDto, PurchasePageDto } from './dto/purchase.dto.js';

const purchaseSelect = {
  id: true,
  provider: { select: { id: true, name: true } },
  receivedAt: true,
  supplierFolio: true,
  notes: true,
  total: true,
  createdById: true,
  createdAt: true,
  items: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      productId: true,
      productName: true,
      barcode: true,
      quantity: true,
      unitCost: true,
      lineSubtotal: true,
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
      id: purchase.provider.id,
      nombre: purchase.provider.name,
    },
    fechaRecepcion: purchase.receivedAt.toISOString(),
    folioProveedor: purchase.supplierFolio,
    notas: purchase.notes,
    total: purchase.total.toFixed(2),
    productos: purchase.items.map((item) => ({
      id: item.id,
      producto: {
        id: item.productId,
        articulo: item.productName,
        codigoBarras: item.barcode,
      },
      cantidad: item.quantity.toFixed(3),
      costoUnitario: item.unitCost.toFixed(2),
      subtotal: item.lineSubtotal.toFixed(2),
    })),
    creadoPorId: purchase.createdById,
    createdAt: purchase.createdAt.toISOString(),
  };
}

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePurchaseDto, actorId: string): Promise<PurchaseDto> {
    const receivedAt = dto.fechaRecepcion
      ? new Date(dto.fechaRecepcion)
      : new Date();
    const productIds = dto.productos.map(({ productoId }) => productoId);

    try {
      const purchase = await serializableTransaction(
        this.prisma,
        async (tx) => {
          const provider = await tx.provider.findUnique({
            where: { id: dto.proveedorId },
            select: { id: true, isActive: true },
          });
          if (!provider) throw new NotFoundException('Proveedor inexistente');
          if (!provider.isActive)
            throw new ConflictException('El proveedor está inactivo');

          const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              name: true,
              barcode: true,
              cost: true,
              isActive: true,
            },
          });
          if (products.length !== productIds.length)
            throw new NotFoundException('Producto inexistente');

          const byId = new Map(
            products.map((product) => [product.id, product]),
          );
          const lines = dto.productos.map((input, position) => {
            const product = byId.get(input.productoId)!;
            if (!product.isActive)
              throw new ConflictException(
                `El producto ${product.barcode} está inactivo`,
              );
            if (product.cost === null)
              throw new BadRequestException(
                `Configura el precio de compra del producto ${product.barcode} antes de registrarlo`,
              );

            const quantity = new Quantity(input.cantidad);
            const unitCost = new Money(product.cost);
            const lineSubtotal = unitCost.times(quantity);
            return {
              position,
              product,
              quantity: quantity.toDecimal(),
              unitCost: unitCost.toDecimal(),
              lineSubtotal: lineSubtotal.toDecimal(),
            };
          });
          const total = lines.reduce(
            (sum, line) => sum.plus(new Money(line.lineSubtotal)),
            Money.zero(),
          );

          const created = await tx.purchase.create({
            data: {
              provider: { connect: { id: provider.id } },
              createdBy: { connect: { id: actorId } },
              receivedAt,
              supplierFolio: dto.folioProveedor?.trim() || null,
              notes: dto.notas?.trim() || null,
              total: total.toDecimal(),
              items: {
                create: lines.map((line) => ({
                  position: line.position,
                  product: { connect: { id: line.product.id } },
                  productName: line.product.name,
                  barcode: line.product.barcode,
                  quantity: line.quantity,
                  unitCost: line.unitCost,
                  lineSubtotal: line.lineSubtotal,
                })),
              },
            },
            select: purchaseSelect,
          });

          await tx.inventoryMovement.createMany({
            data: lines.map((line) => ({
              productId: line.product.id,
              type: 'PURCHASE_IN',
              quantityChange: line.quantity,
              unitCost: line.unitCost,
              referenceType: 'PURCHASE',
              referenceId: created.id,
              createdById: actorId,
              notes: created.supplierFolio
                ? `Compra recibida: ${created.supplierFolio}`
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
    const pagina = query.pagina ?? 1;
    const limite = query.limite ?? 50;
    const where: Prisma.PurchaseWhereInput = {};
    if (query.proveedorId) where.providerId = query.proveedorId;
    if (query.fechaInicio || query.fechaFin) {
      where.receivedAt = {
        ...(query.fechaInicio ? { gte: new Date(query.fechaInicio) } : {}),
        ...(query.fechaFin ? { lte: new Date(query.fechaFin) } : {}),
      };
    }
    const [records, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * limite,
        take: limite,
        select: purchaseSelect,
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return { items: records.map(toDto), pagina, limite, total };
  }

  async findById(id: string): Promise<PurchaseDto> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      select: purchaseSelect,
    });
    if (!purchase) throw new NotFoundException('Compra inexistente');
    return toDto(purchase);
  }
}
