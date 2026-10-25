import type { DomainEvent } from '../../../common/domain/domain-event.js';

export const EVENT_PUBLISHER_PORT = Symbol('EVENT_PUBLISHER_PORT');

export interface EventPublisherPort {
  publish<T extends DomainEvent>(event: T): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
}
