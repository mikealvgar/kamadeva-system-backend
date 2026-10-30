import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  UNIT_OF_WORK_PORT,
  type UnitOfWorkPort,
} from '../../../common/application/unit-of-work.port.js';
import {
  SALE_REPOSITORY_PORT,
  type SaleRepositoryPort,
} from '../../../sales/application/ports/sale-repository.port.js';
import { RegisterSaleUseCase } from '../../../sales/application/use-cases/register-sale.use-case.js';
import {
  SaleItem,
  type PaymentMethod,
  type SaleAggregate,
} from '../../../sales/domain/sale.aggregate.js';
import {
  InventoryAllocatedEvent,
  QuoteConvertedToSaleEvent,
} from '../../domain/events/quote-events.js';
import {
  PaymentAmountMismatchException,
  QuoteAlreadyConvertedException,
  QuoteNotFoundException,
} from '../../domain/exceptions/quote-exceptions.js';
import {
  QUOTE_REPOSITORY_PORT,
  type QuoteRepositoryPort,
} from '../ports/quote-repository.port.js';
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
    private readonly registerSale: RegisterSaleUseCase,
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

      if (await this.saleRepo.existsForQuote(id, tx)) {
        throw new QuoteAlreadyConvertedException(
          'La cotización ya fue convertida',
        );
      }

      if (!quote.total.equals(command.amount)) {
        throw new PaymentAmountMismatchException(
          'El importe debe coincidir con el total de la cotización',
        );
      }

      await this.quoteRepo.requireProductsExist(
        [...new Set(quote.items.map((item) => item.productId))],
        tx,
      );

      // Quoted prices and totals are preserved; stock, folio and payment
      // follow the same path as a direct sale.
      const registered = await this.registerSale.execute(
        {
          customerId: quote.customerId,
          quoteId: quote.id,
          createdById: command.actorId,
          notes: quote.notes,
          items: quote.items.map(
            (item) =>
              new SaleItem({
                productId: item.productId,
                sizeId: item.sizeId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discount: item.discount,
                tax: item.tax,
                total: item.total,
              }),
          ),
          totals: {
            subtotal: quote.subtotal,
            discount: quote.discount,
            tax: quote.tax,
            total: quote.total,
          },
          paymentMethod: command.method,
        },
        tx,
      );

      quote.markConverted();
      await this.quoteRepo.update(
        quote,
        tx,
        { status: 'CONVERTED' },
        { id: true },
      );

      return registered;
    });

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
