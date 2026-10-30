import { Prisma } from '../../../generated/prisma/client.js';
import type {
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
} from '../../domain/sale.aggregate.js';

export const SALE_QUERY_PORT = Symbol('SALE_QUERY_PORT');

export interface SaleRef {
  id: string;
  name: string;
}

export interface SaleDetailView {
  id: string;
  folio: string;
  status: SaleStatus;
  customer: SaleRef | null;
  createdBy: SaleRef | null;
  quoteId: string | null;
  notes: string | null;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  items: Array<{
    id: string;
    product: { id: string; barcode: string; name: string };
    size: SaleRef | null;
    quantity: string;
    unitPrice: string;
    discount: string;
    tax: string;
    total: string;
  }>;
  payments: Array<{
    id: string;
    method: PaymentMethod;
    amount: string;
    status: PaymentStatus;
    paidAt: string | null;
  }>;
  cancelledAt: string | null;
  cancelledBy: SaleRef | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaleSummaryView {
  id: string;
  folio: string;
  status: SaleStatus;
  total: string;
  paymentMethod: PaymentMethod | null;
  customer: SaleRef | null;
  createdBy: SaleRef | null;
  quoteId: string | null;
  createdAt: string;
}

export interface SaleListFilter {
  startDate?: Date;
  endDate?: Date;
  status?: SaleStatus;
  createdById?: string;
  customerId?: string;
  paymentMethod?: PaymentMethod;
  folio?: string;
  page: number;
  pageSize: number;
}

export interface SalePage {
  data: SaleSummaryView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaleQueryPort {
  findDetail(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SaleDetailView | null>;
  list(filter: SaleListFilter): Promise<SalePage>;
}
