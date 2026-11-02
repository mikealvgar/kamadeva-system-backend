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
      where: { llave_ambito: { llave: key, ambito: scope } },
      select: {
        hashPeticion: true,
        usuarioId: true,
        codigoRespuesta: true,
        cuerpoRespuesta: true,
        fechaVencimiento: true,
      },
    });
    if (!record) return null;
    return {
      requestHash: record.hashPeticion,
      userId: record.usuarioId,
      responseStatusCode: record.codigoRespuesta ?? 201,
      responseBody: record.cuerpoRespuesta,
      expiresAt: record.fechaVencimiento,
    };
  }

  async remove(
    scope: string,
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).idempotencyKey.deleteMany({
      where: { llave: key, ambito: scope },
    });
  }

  async saveCompleted(
    record: StoredIdempotentResponse & { scope: string; key: string },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    try {
      await (tx ?? this.prisma).idempotencyKey.create({
        data: {
          llave: record.key,
          ambito: record.scope,
          hashPeticion: record.requestHash,
          estado: 'COMPLETED',
          codigoRespuesta: record.responseStatusCode,
          cuerpoRespuesta: record.responseBody as Prisma.InputJsonValue,
          usuarioId: record.userId,
          fechaVencimiento: record.expiresAt,
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
