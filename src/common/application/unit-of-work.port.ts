import { Prisma } from '../../generated/prisma/client.js';

export const UNIT_OF_WORK_PORT = Symbol('UNIT_OF_WORK_PORT');

/** Runs work in one serializable transaction; each module binds its own adapter. */
export interface UnitOfWorkPort {
  execute<T>(work: (tx?: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
