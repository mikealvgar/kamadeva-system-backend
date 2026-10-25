import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  PaymentRecord,
  SaleAggregate,
  SaleItem,
  type PaymentMethod,
} from '../../domain/entities/sale.aggregate.js';
import {
  InventoryAllocatedEvent,
  QuoteConvertedToSaleEvent,
} from '../../domain/events/quote-events.js';
import {
  InsufficientStockException,
  PaymentAmountMismatchException,
  QuoteAlreadyConvertedException,
  QuoteNotFoundException,
} from '../../domain/exceptions/quote-exceptions.js';
import { Quantity } from '../../domain/value-objects/money.js';
import {
  INVENTORY_QUERY_PORT,
  QUOTE_REPOSITORY_PORT,
  type InventoryQueryPort,
  type QuoteRepositoryPort,
} from '../ports/quote-repository.port.js';
import {
  SALE_REPOSITORY_PORT,
  type SaleRepositoryPort,
} from '../ports/sale-repository.port.js';
import {
  UNIT_OF_WORK_PORT,
  type UnitOfWorkPort,
} from '../ports/unit-of-work.port.js';
import {
  EVENT_PUBLISHER_PORT,
  type EventPublisherPort,
} from '../ports/event-publisher.port.js';

export interface PayQuoteCommand {
  amount: number | string | Prisma.Decimal;
  method: PaymentMethod;
  actorId: string;
}

@Injectable()
export class PayQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY_PORT)
    private readonly quoteRepo: QuoteRepositoryPort,
    @Inject(SALE_REPOSITORY_PORT)
    private readonly saleRepo: SaleRepositoryPort,
    @Inject(INVENTORY_QUERY_PORT)
    private readonly inventoryQuery: InventoryQueryPort,
    @Inject(UNIT_OF_WORK_PORT)
    private readonly unitOfWork: UnitOfWorkPort,
    @Inject(EVENT_PUBLISHER_PORT)
    private readonly eventPublisher: EventPublisherPort,
  ) {}

  async execute(id: string, command: PayQuoteCommand): Promise<SaleAggregate> {
    const sale = await this.unitOfWork.execute(async (tx) => {
      const quote = await this.quoteRepo.findById(id, tx);
      if (!quote) {
        throw new QuoteNotFoundException('Cotización inexistente');
      }

      quote.assertPayable();

      const existingSale = await this.saleRepo.findByQuoteId(id, tx);
      if (existingSale) {
        throw new QuoteAlreadyConvertedException(
          'La cotización ya fue convertida',
        );
      }

      if (!quote.total.equals(command.amount)) {
        throw new PaymentAmountMismatchException(
          'El importe debe coincidir con el total de la cotización',
        );
      }

      // Sum repeated products in lines
      const requested = new Map<string, Quantity>();
      for (const item of quote.items) {
        const current = requested.get(item.productId) ?? new Quantity(0);
        requested.set(item.productId, current.plus(item.quantity));
      }

      const productIds = [...requested.keys()];
      await this.quoteRepo.requireProductsExist(productIds, tx);

      const stock = await this.inventoryQuery.getStockForProducts(
        productIds,
        tx,
      );

      for (const [productId, quantity] of requested) {
        const available = stock.get(productId) ?? new Prisma.Decimal(0);
        if (quantity.greaterThan(available)) {
          throw new InsufficientStockException('Sin inventario suficiente');
        }
      }

      const saleAggregate = new SaleAggregate({
        customerId: quote.customerId,
        quoteId: quote.id,
        createdById: command.actorId,
        notes: quote.notes,
        subtotal: quote.subtotal,
        discount: quote.discount,
        tax: quote.tax,
        total: quote.total,
        items: quote.items.map(
          (item) =>
            new SaleItem({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              tax: item.tax,
              total: item.total,
            }),
        ),
      });

      const payment = new PaymentRecord({
        saleId: saleAggregate.id,
        amount: quote.total,
        method: command.method,
        status: 'PAID',
        createdById: command.actorId,
      });

      const finalizedSale = new SaleAggregate({
        id: saleAggregate.id,
        folio: saleAggregate.folio,
        status: 'COMPLETED',
        customerId: saleAggregate.customerId,
        quoteId: saleAggregate.quoteId,
        createdById: saleAggregate.createdById,
        notes: saleAggregate.notes,
        subtotal: saleAggregate.subtotal,
        discount: saleAggregate.discount,
        tax: saleAggregate.tax,
        total: saleAggregate.total,
        items: [...saleAggregate.items],
        payment,
      });

      const savedSaleRecord = await this.saleRepo.save(finalizedSale, tx);
      finalizedSale.rawRecord = savedSaleRecord;

      quote.markConverted();
      await this.quoteRepo.update(quote, tx, { status: 'CONVERTED' }, { id: true });

      return finalizedSale;
    }, true);

    await this.eventPublisher.publish(
      new QuoteConvertedToSaleEvent(
        id,
        sale.id,
        sale.folio.toString(),
        sale.customerId ?? '',
        sale.total.toString(),
        command.method,
        sale.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          total: item.total.toString(),
        })),
      ),
    );

    await this.eventPublisher.publish(
      new InventoryAllocatedEvent(
        sale.id,
        sale.id,
        sale.items.map((item) => ({
          productId: item.productId,
          quantityDeducted: item.quantity.toString(),
        })),
      ),
    );

    return sale;
  }
}
