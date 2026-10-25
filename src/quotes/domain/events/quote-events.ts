import type { DomainEvent } from '../../../common/domain/domain-event.js';

let eventCounter = 0;
function nextEventId(): string {
  return `evt-${Date.now()}-${++eventCounter}`;
}

export class QuoteCreatedEvent implements DomainEvent {
  readonly eventId = nextEventId();
  readonly eventName = 'quote.created';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly folio: string,
    readonly customerId: string,
    readonly createdById: string,
    readonly total: string,
    readonly expiresAt: string | null,
  ) {}
}

export class QuoteSentEvent implements DomainEvent {
  readonly eventId = nextEventId();
  readonly eventName = 'quote.sent';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly folio: string,
    readonly customerId: string,
    readonly total: string,
  ) {}
}

export interface QuoteConvertedItemPayload {
  productId: string;
  quantity: string;
  unitPrice: string;
  total: string;
}

export class QuoteConvertedToSaleEvent implements DomainEvent {
  readonly eventId = nextEventId();
  readonly eventName = 'quote.converted-to-sale';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly saleId: string,
    readonly saleFolio: string,
    readonly customerId: string,
    readonly total: string,
    readonly paymentMethod: 'CASH' | 'CARD' | 'TRANSFER' | 'OTHER',
    readonly items: ReadonlyArray<QuoteConvertedItemPayload>,
  ) {}
}

export class InventoryAllocatedEvent implements DomainEvent {
  readonly eventId = nextEventId();
  readonly eventName = 'inventory.allocated';
  readonly occurredAt = new Date();

  constructor(
    readonly aggregateId: string,
    readonly saleId: string,
    readonly items: ReadonlyArray<{
      productId: string;
      quantityDeducted: string;
    }>,
  ) {}
}
