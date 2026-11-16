import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEvent } from '../../../common/domain/domain-event.js';
import type { EventPublisherPort } from '../../application/ports/event-publisher.port.js';

@Injectable()
export class NestEventEmitterAdapter implements EventPublisherPort {
  constructor(private readonly emitter: EventEmitter2) {}

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    await this.emitter.emitAsync(event.eventName, event);
  }

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
