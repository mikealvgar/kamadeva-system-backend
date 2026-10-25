import { Inject, Injectable } from '@nestjs/common';
import type { QuoteAggregate } from '../../domain/entities/quote.aggregate.js';
import { QuoteItem } from '../../domain/entities/quote-item.entity.js';
import {
  DomainException,
  InvalidExpirationDateException,
  ProductNotFoundException,
  QuoteNotFoundException,
} from '../../domain/exceptions/quote-exceptions.js';
import {
  QUOTE_REPOSITORY_PORT,
  type QuoteRepositoryPort,
} from '../ports/quote-repository.port.js';
import {
  UNIT_OF_WORK_PORT,
  type UnitOfWorkPort,
} from '../ports/unit-of-work.port.js';
import type { CreateQuoteItemCommand } from './create-quote.use-case.js';

export interface UpdateQuoteCommand {
  customerId?: string;
  items?: CreateQuoteItemCommand[];
  notes?: string;
  expiresAt?: string;
}

function parseFutureDate(value?: string): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
    throw new InvalidExpirationDateException(
      'La fecha de expiración debe ser futura',
    );
  }
  return date;
}

@Injectable()
export class UpdateQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY_PORT)
    private readonly quoteRepo: QuoteRepositoryPort,
    @Inject(UNIT_OF_WORK_PORT)
    private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  async execute(
    id: string,
    command: UpdateQuoteCommand,
  ): Promise<QuoteAggregate> {
    if (Object.values(command).every((value) => value === undefined)) {
      throw new DomainException('Debe enviar al menos un campo');
    }

    const expiresAt = parseFutureDate(command.expiresAt);

    return this.unitOfWork.execute(async (tx) => {
      const quote = await this.quoteRepo.findById(id, tx);
      if (!quote) {
        throw new QuoteNotFoundException('Cotización inexistente');
      }

      quote.assertDraft();

      if (command.customerId !== undefined) {
        await this.quoteRepo.requireCustomerExists(command.customerId, tx);
      }

      let items: QuoteItem[] | undefined;
      if (command.items !== undefined) {
        const productIds = [
          ...new Set(command.items.map((item) => item.productId)),
        ];
        const prices = await this.quoteRepo.getProductPrices(productIds, tx);

        items = command.items.map((input) => {
          const unitPrice = prices.get(input.productId);
          if (unitPrice === undefined) {
            throw new ProductNotFoundException('Producto inexistente');
          }
          return new QuoteItem({
            productId: input.productId,
            quantity: input.quantity,
            unitPrice,
            discount: input.discount,
            tax: input.tax,
          });
        });
      }

      quote.updateDetails({
        customerId: command.customerId,
        notes: command.notes,
        expiresAt:
          expiresAt !== undefined
            ? expiresAt
            : command.expiresAt === undefined
              ? undefined
              : null,
        items,
      });

      const data: Record<string, unknown> = {
        ...(command.customerId !== undefined
          ? { customerId: command.customerId }
          : {}),
        ...(command.notes !== undefined
          ? { notes: command.notes.trim() || null }
          : {}),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      };

      if (items !== undefined) {
        data.subtotal = quote.subtotal.toDecimal();
        data.discount = quote.discount.toDecimal();
        data.tax = quote.tax.toDecimal();
        data.total = quote.total.toDecimal();
        data.items = {
          deleteMany: {},
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity.toDecimal(),
            unitPrice: item.unitPrice.toDecimal(),
            discount: item.discount.toDecimal(),
            tax: item.tax.toDecimal(),
            total: item.total.toDecimal(),
          })),
        };
      }

      const record = await this.quoteRepo.update(quote, tx, data);
      quote.rawRecord = record;
      return quote;
    });
  }
}
