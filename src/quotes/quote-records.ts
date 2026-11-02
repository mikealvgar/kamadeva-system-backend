import { Prisma } from '../generated/prisma/client.js';
import type { CustomerDto } from '../customers/dto/customer.dto.js';
import type { QuoteDto, SaleDto } from './dto/quote.dto.js';

const customerSelect = {
  id: true,
  nombre: true,
  telefono: true,
  correo: true,
  activo: true,
  esPredeterminado: true,
  fechaCreacion: true,
  fechaActualizacion: true,
} satisfies Prisma.CustomerSelect;

const economicSelect = {
  id: true,
  folio: true,
  estado: true,
  subtotal: true,
  descuento: true,
  total: true,
  notas: true,
  fechaCreacion: true,
  fechaActualizacion: true,
  cliente: { select: customerSelect },
} as const;

export const quoteSelect = {
  ...economicSelect,
  fechaVencimiento: true,
  items: {
    orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      cantidad: true,
      precioUnitario: true,
      descuento: true,
      total: true,
      producto: {
        select: { id: true, codigoBarras: true, nombre: true, imageUrl: true },
      },
      talla: { select: { id: true, nombre: true } },
    },
  },
} satisfies Prisma.QuoteSelect;

export const saleSelect = {
  id: true,
  folio: true,
  estado: true,
  metodoPago: true,
  fechaPago: true,
  subtotal: true,
  descuento: true,
  total: true,
  notas: true,
  fechaCreacion: true,
  fechaActualizacion: true,
  cliente: { select: customerSelect },
  cotizacionId: true,
} satisfies Prisma.SaleSelect;

export type QuoteRecord = Prisma.QuoteGetPayload<{
  select: typeof quoteSelect;
}>;
export type SaleRecord = Prisma.SaleGetPayload<{ select: typeof saleSelect }>;
type CustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof customerSelect;
}>;

function customerDto(customer: CustomerRecord): CustomerDto {
  return {
    id: customer.id,
    nombre: customer.nombre,
    name: customer.nombre,
    telefono: customer.telefono,
    phone: customer.telefono,
    correo: customer.correo,
    email: customer.correo,
    activo: customer.activo,
    isActive: customer.activo,
    esPredeterminado: customer.esPredeterminado,
    fechaCreacion: customer.fechaCreacion.toISOString(),
    fechaActualizacion: customer.fechaActualizacion.toISOString(),
    createdAt: customer.fechaCreacion.toISOString(),
    updatedAt: customer.fechaActualizacion.toISOString(),
  };
}

export function quoteDto(quote: QuoteRecord): QuoteDto {
  const folioFormatted = `C-${quote.folio.toString().padStart(6, '0')}`;
  return {
    id: quote.id,
    folio: folioFormatted,
    status: quote.estado,
    customer: customerDto(quote.cliente),
    expiresAt: quote.fechaVencimiento?.toISOString() ?? null,
    canPay:
      (quote.estado === 'DRAFT' || quote.estado === 'SENT') &&
      (quote.fechaVencimiento === null || quote.fechaVencimiento.getTime() > Date.now()),
    items: quote.items.map((item) => ({
      id: item.id,
      product: {
        id: item.producto.id,
        barcode: item.producto.codigoBarras,
        name: item.producto.nombre,
        imageUrl: item.producto.imageUrl,
      },
      size: item.talla ? { id: item.talla.id, nombre: item.talla.nombre, name: item.talla.nombre } : null,
      quantity: item.cantidad.toFixed(3),
      unitPrice: item.precioUnitario.toFixed(2),
      discount: item.descuento.toFixed(2),
      tax: '0.00',
      total: item.total.toFixed(2),
    })),
    subtotal: quote.subtotal.toFixed(2),
    discount: quote.descuento.toFixed(2),
    tax: '0.00',
    total: quote.total.toFixed(2),
    notes: quote.notas,
    createdAt: quote.fechaCreacion.toISOString(),
    updatedAt: quote.fechaActualizacion.toISOString(),
  };
}

export function saleDto(sale: SaleRecord): SaleDto {
  const folioFormatted = `V-${sale.folio.toString().padStart(6, '0')}`;
  return {
    id: sale.id,
    folio: folioFormatted,
    status: sale.estado,
    customer: sale.cliente ? customerDto(sale.cliente) : null,
    quoteId: sale.cotizacionId,
    subtotal: sale.subtotal.toFixed(2),
    discount: sale.descuento.toFixed(2),
    tax: '0.00',
    total: sale.total.toFixed(2),
    notes: sale.notas,
    createdAt: sale.fechaCreacion.toISOString(),
    updatedAt: sale.fechaActualizacion.toISOString(),
  };
}
