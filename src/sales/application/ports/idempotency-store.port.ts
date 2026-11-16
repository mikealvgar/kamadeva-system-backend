import { Prisma } from '../../../generated/prisma/client.js';

export const IDEMPOTENCY_STORE_PORT = Symbol('IDEMPOTENCY_STORE_PORT');

export interface StoredIdempotentResponse {
  requestHash: string;
  userId: string | null;
  responseStatusCode: number;
  responseBody: unknown;
  expiresAt: Date;
}

export interface IdempotencyStorePort {
  find(
    scope: string,
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<StoredIdempotentResponse | null>;
  remove(
    scope: string,
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
  /** Throws IdempotencyKeyRaceException when another request stored the key first. */
  saveCompleted(
    record: StoredIdempotentResponse & { scope: string; key: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
