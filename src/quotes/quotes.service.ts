import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { serializableTransaction } from '../prisma/serializable-transaction.js';
import type {
  CreateQuoteDto,
  QuoteItemInputDto,
  UpdateQuoteDto,
} from './dto/create-quote.dto.js';
import type { ListQuotesDto } from './dto/list-quotes.dto.js';
import type { PayQuoteDto } from './dto/pay-quote.dto.js';
import type { QuoteDto, SaleDto } from './dto/quote.dto.js';
import {
  quoteDto,
  quoteSelect,
  saleDto,
  saleSelect,
  type QuoteRecord,
} from './quote-records.js';

function folio(prefix: 'COT' | 'VEN'): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;
}

function money(value: Prisma.Decimal): Prisma.Decimal {
  const rounded = value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (rounded.isNegative() || rounded.greaterThan('9999999999.99'))
    throw new BadRequestException('Importe fuera de rango');
  return rounded;
}

function futureDate(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
    throw new BadRequestException('La fecha de expiración debe ser futura');
  return date;
}

function isFolioConstraint(value: unknown): boolean {
  return Array.isArray(value)
    ? value.includes('folio')
    : typeof value === 'string' && /(?:^|_)folio(?:_|$)/.test(value);
}

function isFolioCollision(
  error: Prisma.PrismaClientKnownRequestError,
): boolean {
  if (isFolioConstraint(error.meta?.target)) return true;
  // Prisma 7 preserves adapter-pg's structured constraint instead of meta.target.
  const adapter: unknown = error.meta?.driverAdapterError;
  if (typeof adapter !== 'object' || adapter === null || !('cause' in adapter))
    return false;
  const cause = adapter.cause;
  if (typeof cause !== 'object' || cause === null || !('constraint' in cause))
    return false;
  const constraint = cause.constraint;
  if (typeof constraint !== 'object' || constraint === null) return false;
  return (
    ('fields' in constraint && isFolioConstraint(constraint.fields)) ||
    ('index' in constraint && isFolioConstraint(constraint.index))
  );
}

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateQuoteDto, actorId: string): Promise<QuoteDto> {
    const quote = await this.write(async (tx) => {
      const expiresAt = futureDate(dto.expiresAt) ?? null;
      await this.requireCustomer(tx, dto.customerId);
      const { items, ...totals } = await this.calculate(tx, dto.items);
      return tx.quote.create({
        data: {
          folio: folio('COT'),
          status: 'DRAFT',
          customerId: dto.customerId,
          createdById: actorId,
          notes: dto.notes?.trim() || null,
          expiresAt,
          ...totals,
          items: { create: items },
        },
        select: quoteSelect,
      });
    }, true);
    return quoteDto(quote);
  }

  async findAll(query: ListQuotesDto = {}): Promise<QuoteDto[]> {
    if (query.customerId)
      await this.requireCustomer(this.prisma, query.customerId);
    const quotes = await this.prisma.quote.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.search?.trim()
          ? { folio: { contains: query.search.trim(), mode: 'insensitive' } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: quoteSelect,
    });
    return quotes.map(quoteDto);
  }

  async findById(id: string): Promise<QuoteDto> {
    return quoteDto(await this.requireQuote(this.prisma, id));
  }

  async update(id: string, dto: UpdateQuoteDto): Promise<QuoteDto> {
    if (Object.values(dto).every((value) => value === undefined))
      throw new BadRequestException('Debe enviar al menos un campo');
    const quote = await this.write(async (tx) => {
      this.requireDraft(await this.requireQuote(tx, id));
      const expiresAt = futureDate(dto.expiresAt);
      if (dto.customerId !== undefined)
        await this.requireCustomer(tx, dto.customerId);
      const data: Prisma.QuoteUncheckedUpdateInput = {
        ...(dto.customerId !== undefined ? { customerId: dto.customerId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      };
      if (dto.items !== undefined) {
        const { items, ...totals } = await this.calculate(tx, dto.items);
        Object.assign(data, totals);
        data.items = { deleteMany: {}, create: items };
      }
      return tx.quote.update({ where: { id }, data, select: quoteSelect });
    });
    return quoteDto(quote);
  }

  async send(id: string): Promise<QuoteDto> {
    const quote = await this.write(async (tx) => {
      this.requireDraft(await this.requireQuote(tx, id));
      return tx.quote.update({
        where: { id },
        data: { status: 'SENT' },
        select: quoteSelect,
      });
    });
    return quoteDto(quote);
  }

  async delete(id: string): Promise<void> {
    await this.write(async (tx) => {
      this.requireDraft(await this.requireQuote(tx, id));
      await tx.quote.delete({ where: { id }, select: { id: true } });
    });
  }

  async pay(id: string, dto: PayQuoteDto, actorId: string): Promise<SaleDto> {
    const sale = await this.write(async (tx) => {
      const quote = await this.requireQuote(tx, id);
      if (quote.status !== 'DRAFT' && quote.status !== 'SENT')
        throw new ConflictException('La cotización no admite pago');
      if (quote.expiresAt !== null && quote.expiresAt.getTime() <= Date.now())
        throw new ConflictException('La cotización ha expirado');
      if (
        await tx.sale.findUnique({
          where: { quoteId: id },
          select: { id: true },
        })
      )
        throw new ConflictException('La cotización ya fue convertida');
      if (!quote.total.equals(dto.amount))
        throw new BadRequestException(
          'El importe debe coincidir con el total de la cotización',
        );

      // Sum repeated products before comparing stock; isolation also protects concurrent sales.
      const requested = new Map<string, Prisma.Decimal>();
      for (const item of quote.items) {
        requested.set(
          item.product.id,
          (requested.get(item.product.id) ?? new Prisma.Decimal(0)).plus(
            item.quantity,
          ),
        );
      }
      const productIds = [...requested.keys()];
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });
      if (products.length !== productIds.length)
        throw new NotFoundException('Producto inexistente');
      const stock = await tx.inventoryMovement.groupBy({
        by: ['productId'],
        where: { productId: { in: productIds } },
        _sum: { quantityChange: true },
      });
      const available = new Map(
        stock.map((row) => [
          row.productId,
          row._sum.quantityChange ?? new Prisma.Decimal(0),
        ]),
      );
      for (const [productId, quantity] of requested) {
        if (quantity.greaterThan(available.get(productId) ?? 0))
          throw new ConflictException('Sin inventario suficiente');
      }

      const created = await tx.sale.create({
        data: {
          folio: folio('VEN'),
          status: 'COMPLETED',
          customerId: quote.customer.id,
          quoteId: quote.id,
          createdById: actorId,
          notes: quote.notes,
          subtotal: quote.subtotal,
          discount: quote.discount,
          tax: quote.tax,
          total: quote.total,
          items: {
            create: quote.items.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              tax: item.tax,
              total: item.total,
            })),
          },
        },
        select: {
          ...saleSelect,
          items: { select: { id: true, productId: true, quantity: true } },
        },
      });
      await tx.inventoryMovement.createMany({
        data: created.items.map((item) => ({
          type: 'SALE_OUT',
          quantityChange: item.quantity.negated(),
          productId: item.productId,
          saleItemId: item.id,
          referenceType: 'SALE',
          referenceId: created.id,
          createdById: actorId,
        })),
      });
      await tx.payment.create({
        data: {
          saleId: created.id,
          method: dto.method,
          amount: quote.total,
          status: 'PAID',
          createdById: actorId,
          paidAt: new Date(),
        },
        select: { id: true },
      });
      await tx.quote.update({
        where: { id },
        data: { status: 'CONVERTED' },
        select: { id: true },
      });
      return created;
    }, true);
    return saleDto(sale);
  }

  private async calculate(
    tx: Prisma.TransactionClient,
    inputs: QuoteItemInputDto[],
  ) {
    const products = await tx.product.findMany({
      where: { id: { in: [...new Set(inputs.map((item) => item.productId))] } },
      select: { id: true, price: true },
    });
    const prices = new Map(
      products.map((product) => [product.id, product.price]),
    );
    let subtotal = new Prisma.Decimal(0);
    let discount = new Prisma.Decimal(0);
    let tax = new Prisma.Decimal(0);
    const items = inputs.map((input) => {
      const unitPrice = prices.get(input.productId);
      if (unitPrice === undefined)
        throw new NotFoundException('Producto inexistente');
      const quantity = new Prisma.Decimal(input.quantity);
      // Round each line once, half up, so persisted line totals sum to the quote total.
      const lineSubtotal = money(quantity.times(unitPrice));
      const lineDiscount = money(new Prisma.Decimal(input.discount ?? 0));
      const lineTax = money(new Prisma.Decimal(input.tax ?? 0));
      const total = money(lineSubtotal.minus(lineDiscount).plus(lineTax));
      subtotal = subtotal.plus(lineSubtotal);
      discount = discount.plus(lineDiscount);
      tax = tax.plus(lineTax);
      return {
        productId: input.productId,
        quantity,
        unitPrice,
        discount: lineDiscount,
        tax: lineTax,
        total,
      };
    });
    return {
      items,
      subtotal: money(subtotal),
      discount: money(discount),
      tax: money(tax),
      total: money(subtotal.minus(discount).plus(tax)),
    };
  }

  private async requireCustomer(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    if (
      !(await tx.customer.findUnique({ where: { id }, select: { id: true } }))
    )
      throw new NotFoundException('Cliente inexistente');
  }

  private async requireQuote(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<QuoteRecord> {
    const quote = await tx.quote.findUnique({
      where: { id },
      select: quoteSelect,
    });
    if (!quote) throw new NotFoundException('Cotización inexistente');
    return quote;
  }

  private requireDraft(quote: QuoteRecord): void {
    if (quote.status !== 'DRAFT')
      throw new ConflictException('La cotización no está en borrador');
  }

  private async write<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    retryFolio = false,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await serializableTransaction(this.prisma, operation);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            const isFolio = isFolioCollision(error);
            // Retry the entire transaction: PostgreSQL aborts it after a unique violation.
            if (retryFolio && isFolio && attempt === 0) continue;
            throw new ConflictException(
              isFolio
                ? 'No se pudo generar un folio único'
                : 'La cotización ya fue convertida',
            );
          }
          if (error.code === 'P2025')
            throw new NotFoundException('Registro inexistente');
          if (error.code === 'P2003')
            throw new ConflictException(
              'Conflicto con un registro relacionado',
            );
        }
        throw error;
      }
    }
  }
}
