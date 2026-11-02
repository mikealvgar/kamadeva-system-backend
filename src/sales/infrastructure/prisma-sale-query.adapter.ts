import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  SaleDetailView,
  SaleListFilter,
  SalePage,
  SaleQueryPort,
} from '../application/ports/sale-query.port.js';

const ref = { select: { id: true, nombre: true } } as const;

const detailSelect = {
  id: true,
  folio: true,
  estado: true,
  cotizacionId: true,
  notas: true,
  subtotal: true,
  descuento: true,
  total: true,
  metodoPago: true,
  fechaPago: true,
  fechaCancelacion: true,
  motivoCancelacion: true,
  fechaCreacion: true,
  fechaActualizacion: true,
  cliente: ref,
  creadoPor: ref,
  canceladoPor: ref,
  items: {
    orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      cantidad: true,
      precioUnitario: true,
      descuento: true,
      total: true,
      producto: { select: { id: true, codigoBarras: true, nombre: true } },
      talla: ref,
    },
  },
} satisfies Prisma.SaleSelect;

const summarySelect = {
  id: true,
  folio: true,
  estado: true,
  total: true,
  metodoPago: true,
  cotizacionId: true,
  fechaCreacion: true,
  cliente: ref,
  creadoPor: ref,
} satisfies Prisma.SaleSelect;

type DetailRecord = Prisma.SaleGetPayload<{ select: typeof detailSelect }>;

function toDetail(sale: DetailRecord): SaleDetailView {
  const folioFormatted = `V-${sale.folio.toString().padStart(6, '0')}`;
  return {
    id: sale.id,
    folio: folioFormatted,
    status: sale.estado,
    customer: sale.cliente ? { id: sale.cliente.id, name: sale.cliente.nombre } : null,
    createdBy: sale.creadoPor ? { id: sale.creadoPor.id, name: sale.creadoPor.nombre } : null,
    quoteId: sale.cotizacionId,
    notes: sale.notas,
    subtotal: sale.subtotal.toFixed(2),
    discount: sale.descuento.toFixed(2),
    tax: '0.00',
    total: sale.total.toFixed(2),
    items: sale.items.map((item) => ({
      id: item.id,
      product: {
        id: item.producto.id,
        barcode: item.producto.codigoBarras,
        name: item.producto.nombre,
      },
      size: item.talla ? { id: item.talla.id, name: item.talla.nombre } : null,
      quantity: item.cantidad.toFixed(3),
      unitPrice: item.precioUnitario.toFixed(2),
      discount: item.descuento.toFixed(2),
      tax: '0.00',
      total: item.total.toFixed(2),
    })),
    payments: [
      {
        id: sale.id,
        method: sale.metodoPago,
        amount: sale.total.toFixed(2),
        status: sale.estado === 'CANCELLED' || sale.estado === 'REFUNDED' ? 'REFUNDED' : 'PAID',
        paidAt: sale.fechaPago?.toISOString() ?? sale.fechaCreacion.toISOString(),
      },
    ],
    cancelledAt: sale.fechaCancelacion?.toISOString() ?? null,
    cancelledBy: sale.canceladoPor ? { id: sale.canceladoPor.id, name: sale.canceladoPor.nombre } : null,
    cancelReason: sale.motivoCancelacion,
    createdAt: sale.fechaCreacion.toISOString(),
    updatedAt: sale.fechaActualizacion.toISOString(),
  };
}

@Injectable()
export class PrismaSaleQueryAdapter implements SaleQueryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findDetail(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SaleDetailView | null> {
    const sale = await (tx ?? this.prisma).sale.findUnique({
      where: { id },
      select: detailSelect,
    });
    return sale ? toDetail(sale) : null;
  }

  async list(filter: SaleListFilter): Promise<SalePage> {
    const where: Prisma.SaleWhereInput = {};
    if (filter.status) where.estado = filter.status;
    if (filter.createdById) where.creadoPorId = filter.createdById;
    if (filter.customerId) where.clienteId = filter.customerId;
    if (filter.folio) {
      const num = parseInt(filter.folio.replace(/\D/g, ''), 10);
      if (!isNaN(num)) where.folio = num;
    }
    if (filter.paymentMethod) where.metodoPago = filter.paymentMethod;
    if (filter.startDate || filter.endDate)
      where.fechaCreacion = {
        ...(filter.startDate ? { gte: filter.startDate } : {}),
        ...(filter.endDate ? { lte: filter.endDate } : {}),
      };
    const [total, sales] = await this.prisma.$transaction([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: summarySelect,
      }),
    ]);
    return {
      data: sales.map((sale) => ({
        id: sale.id,
        folio: `V-${sale.folio.toString().padStart(6, '0')}`,
        status: sale.estado,
        total: sale.total.toFixed(2),
        paymentMethod: sale.metodoPago,
        customer: sale.cliente ? { id: sale.cliente.id, name: sale.cliente.nombre } : null,
        createdBy: sale.creadoPor ? { id: sale.creadoPor.id, name: sale.creadoPor.nombre } : null,
        quoteId: sale.cotizacionId,
        createdAt: sale.fechaCreacion.toISOString(),
      })),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}
