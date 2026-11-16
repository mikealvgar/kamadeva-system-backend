import { Prisma } from '../../generated/prisma/client.js';
import type { Folio, FolioSeries } from '../domain/folio.js';

export const FOLIO_SEQUENCE_PORT = Symbol('FOLIO_SEQUENCE_PORT');

export interface FolioSequencePort {
  /**
   * Reserve the next folio of a series. Call inside the transaction that
   * persists the record so a rollback releases the number (no gaps).
   */
  next(series: FolioSeries, tx?: Prisma.TransactionClient): Promise<Folio>;
}
