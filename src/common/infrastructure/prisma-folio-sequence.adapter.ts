import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { FolioSequencePort } from '../application/folio-sequence.port.js';
import { Folio, type FolioSeries } from '../domain/folio.js';

@Injectable()
export class PrismaFolioSequenceAdapter implements FolioSequencePort {
  constructor(private readonly prisma: PrismaService) {}

  async next(
    series: FolioSeries,
    tx?: Prisma.TransactionClient,
  ): Promise<Folio> {
    const client = tx ?? this.prisma;
    if (series === 'C') {
      const last = await client.quote.findFirst({
        orderBy: { folio: 'desc' },
        select: { folio: true },
      });
      const nextNum = (last?.folio ?? 0) + 1;
      return Folio.fromSequence('C', nextNum);
    } else {
      const last = await client.sale.findFirst({
        orderBy: { folio: 'desc' },
        select: { folio: true },
      });
      const nextNum = (last?.folio ?? 0) + 1;
      return Folio.fromSequence('V', nextNum);
    }
  }
}
