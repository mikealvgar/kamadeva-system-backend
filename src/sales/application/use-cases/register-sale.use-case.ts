import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  FOLIO_SEQUENCE_PORT,
  type FolioSequencePort,
} from '../../../common/application/folio-sequence.port.js';
import { Quantity } from '../../../common/domain/money.js';
import { InsufficientStockException } from '../../domain/sale-exceptions.js';
import {
  PaymentRecord,
  SaleAggregate,
  type PaymentMethod,
  type SaleItem,
  type SaleTotals,
} from '../../domain/sale.aggregate.js';
import {
  INVENTORY_QUERY_PORT,
  type InventoryQueryPort,
} from '../ports/inventory-query.port.js';
import {
  SALE_REPOSITORY_PORT,
  type SaleRepositoryPort,
} from '../ports/sale-repository.port.js';

export interface RegisterSaleCommand {
  customerId: string | null;
  quoteId?: string | null;
  createdById: string;
  notes?: string | null;
  items: SaleItem[];
  totals: SaleTotals;
  paymentMethod: PaymentMethod;
}

/**
 * Records a completed, fully paid sale: stock check, gapless `V-` folio,
 * lines, SALE_OUT movements and payment. Runs inside the caller's
 * transaction so direct sales and paid quotes share one path.
 */
@Injectable()
export class RegisterSaleUseCase {
  constructor(
    @Inject(SALE_REPOSITORY_PORT)
    private readonly saleRepo: SaleRepositoryPort,
    @Inject(INVENTORY_QUERY_PORT)
    private readonly inventoryQuery: InventoryQueryPort,
    @Inject(FOLIO_SEQUENCE_PORT)
    private readonly folioSequence: FolioSequencePort,
  ) {}

  async execute(
    command: RegisterSaleCommand,
    tx?: Prisma.TransactionClient,
  ): Promise<SaleAggregate> {
    // Repeated products across lines draw from the same stock.
    const requested = new Map<string, Quantity>();
    for (const item of command.items) {
      const current = requested.get(item.productId) ?? new Quantity(0);
      requested.set(item.productId, current.plus(item.quantity));
    }
    const stock = await this.inventoryQuery.getStockForProducts(
      [...requested.keys()],
      tx,
    );
    for (const [productId, quantity] of requested) {
      const available = stock.get(productId) ?? new Prisma.Decimal(0);
      if (quantity.greaterThan(available)) {
        throw new InsufficientStockException('Sin inventario suficiente');
      }
    }

    const folio = await this.folioSequence.next('V', tx);
    const sale = new SaleAggregate({
      folio,
      status: 'COMPLETED',
      customerId: command.customerId,
      quoteId: command.quoteId ?? null,
      createdById: command.createdById,
      notes: command.notes ?? null,
      ...command.totals,
      items: command.items,
    });
    const completed = new SaleAggregate({
      id: sale.id,
      folio,
      status: 'COMPLETED',
      customerId: sale.customerId,
      quoteId: sale.quoteId,
      createdById: sale.createdById,
      notes: sale.notes,
      ...command.totals,
      items: command.items,
      payment: new PaymentRecord({
        saleId: sale.id,
        amount: command.totals.total,
        method: command.paymentMethod,
        status: 'PAID',
        createdById: command.createdById,
      }),
    });
    await this.saleRepo.save(completed, tx);
    return completed;
  }
}
