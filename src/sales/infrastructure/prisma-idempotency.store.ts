import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  IdempotencyStorePort,
  StoredIdempotentResponse,
} from '../application/ports/idempotency-store.port.js';
import { IdempotencyKeyRaceException } from '../domain/sale-exceptions.js';

@Injectable()
export class PrismaIdempotencyStore implements IdempotencyStorePort {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    scope: string,
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<StoredIdempotentResponse | null> {
    const record = await (tx ?? this.prisma).idempotencyKey.findUnique({
      where: { key_scope: { key, scope } },
      select: {
        requestHash: true,
        userId: true,
        responseStatusCode: true,
        responseBody: true,
        expiresAt: true,
      },
    });
    if (!record) return null;
    return {
      requestHash: record.requestHash,
      userId: record.userId,
      responseStatusCode: record.responseStatusCode ?? 201,
      responseBody: record.responseBody,
      expiresAt: record.expiresAt,
    };
  }

  async remove(
    scope: string,
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).idempotencyKey.deleteMany({
      where: { key, scope },
    });
  }

  async saveCompleted(
    record: StoredIdempotentResponse & { scope: string; key: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    try {
      await (tx ?? this.prisma).idempotencyKey.create({
        data: {
          key: record.key,
          scope: record.scope,
          requestHash: record.requestHash,
          status: 'COMPLETED',
          responseStatusCode: record.responseStatusCode,
          responseBody: record.responseBody as Prisma.InputJsonValue,
          userId: record.userId,
          expiresAt: record.expiresAt,
        },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new IdempotencyKeyRaceException('Solicitud idempotente en curso');
      }
      throw error;
    }
  }
}
