import { Prisma } from '../../../generated/prisma/client.js';

export const UNIT_OF_WORK_PORT = Symbol('UNIT_OF_WORK_PORT');

export interface UnitOfWorkPort {
  execute<T>(
    work: (tx?: Prisma.TransactionClient) => Promise<T>,
    retryFolio?: boolean,
  ): Promise<T>;
}
