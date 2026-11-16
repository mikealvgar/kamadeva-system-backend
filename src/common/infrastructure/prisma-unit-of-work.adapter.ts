import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { serializableTransaction } from '../../prisma/serializable-transaction.js';
import type { UnitOfWorkPort } from '../application/unit-of-work.port.js';

/** Plain serializable unit of work; errors propagate unchanged. */
@Injectable()
export class PrismaUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly prisma: PrismaService) {}

  execute<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return serializableTransaction(this.prisma, work);
  }
}
