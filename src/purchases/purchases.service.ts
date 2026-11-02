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
  proveedor: { select: { id: true, nombre: true } },
  fechaRecepcion: true,
  folioProveedor: true,
  notas: true,
  total: true,
  creadoPorId: true,
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
    fechaRecepcion: purchase.fechaRecepcion.toISOString(),
    folioProveedor: purchase.folioProveedor,
    notas: purchase.notas,
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
    createdAt: purchase.fechaCreacion.toISOString(),
  };
}

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePurchaseDto, actorId: string): Promise<PurchaseDto> {
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
            if (product.precioCompra === null)
              throw new BadRequestException(
                `Configura el precio de compra del producto ${product.codigoBarras} antes de registrarlo`,
              );

            const quantity = new Quantity(input.cantidad);
            const unitCost = new Money(product.precioCompra);
            const lineSubtotal = unitCost.times(quantity);
            return {
              posicion,
              product,
              cantidad: quantity.toDecimal(),
              costoUnitario: unitCost.toDecimal(),
              subtotalRenglon: lineSubtotal.toDecimal(),
            };
          });
          const total = lines.reduce(
            (sum, line) => sum.plus(new Money(line.subtotalRenglon)),
            Money.zero(),
          );

          const created = await tx.purchase.create({
            data: {
              proveedorId: provider.id,
              creadoPorId: actorId,
              fechaRecepcion,
              folioProveedor: dto.folioProveedor?.trim() || null,
              notas: dto.notas?.trim() || null,
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
    const pagina = query.pagina ?? 1;
    const limite = query.limite ?? 50;
    const where: Prisma.PurchaseWhereInput = {};
    if (query.proveedorId) where.proveedorId = query.proveedorId;
    if (query.fechaInicio || query.fechaFin) {
      where.fechaRecepcion = {
        ...(query.fechaInicio ? { gte: new Date(query.fechaInicio) } : {}),
        ...(query.fechaFin ? { lte: new Date(query.fechaFin) } : {}),
      };
    }
    const [records, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        orderBy: [{ fechaRecepcion: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * limite,
        take: limite,
        select: purchaseSelect,
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return { datos: records.map(toDto), pagina, limite, total };
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
