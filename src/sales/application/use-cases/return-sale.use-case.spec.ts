import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import { ReturnSaleUseCase } from './return-sale.use-case.js';
import {
  SaleNotCancellableException,
  SaleNotFoundException,
} from '../../domain/sale-exceptions.js';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { SaleQueryPort } from '../ports/sale-query.port.js';
import type { UnitOfWorkPort } from '../../../common/application/unit-of-work.port.js';

describe('ReturnSaleUseCase', () => {
  let useCase: ReturnSaleUseCase;
  let saleQueryMock: { findDetail: ReturnType<typeof vi.fn> };
  let txMock: {
    sale: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    inventoryMovement: {
      createMany: ReturnType<typeof vi.fn>;
    };
  };
  let unitOfWorkMock: UnitOfWorkPort;

  beforeEach(() => {
    saleQueryMock = {
      findDetail: vi.fn(),
    };

    txMock = {
      sale: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      inventoryMovement: {
        createMany: vi.fn(),
      },
    };

    unitOfWorkMock = {
      execute: vi.fn(async (callback) => {
        return callback(txMock as unknown as Prisma.TransactionClient);
      }),
    };

    useCase = new ReturnSaleUseCase(
      saleQueryMock as unknown as SaleQueryPort,
      unitOfWorkMock,
      txMock as unknown as any,
    );
  });

  const sampleSale = () => ({
    id: 'sale-1',
    folio: 100,
    estado: 'COMPLETED' as const,
    items: [
      {
        id: 'item-1',
        productoId: 'prod-1',
        tallaId: 'size-1',
        cantidad: new Prisma.Decimal('2.000'),
        total: new Prisma.Decimal('500.00'),
        inventoryMovements: [] as Array<{ cambioExistencias: Prisma.Decimal }>,
      },
      {
        id: 'item-2',
        productoId: 'prod-2',
        tallaId: null,
        cantidad: new Prisma.Decimal('1.000'),
        total: new Prisma.Decimal('150.00'),
        inventoryMovements: [] as Array<{ cambioExistencias: Prisma.Decimal }>,
      },
    ],
  });

  it('processes a partial return of 1 unit of item-1', async () => {
    txMock.sale.findUnique.mockResolvedValueOnce(sampleSale());
    saleQueryMock.findDetail.mockResolvedValueOnce({
      id: 'sale-1',
      status: 'COMPLETED',
    });

    const result = await useCase.execute('sale-1', {
      actorId: 'user-admin',
      reason: 'Talla incorrecta',
      items: [
        {
          productId: 'prod-1',
          sizeId: 'size-1',
          quantity: 1,
          reason: 'Le quedó chico',
        },
      ],
    });

    expect(result).toEqual({ id: 'sale-1', status: 'COMPLETED' });

    // Verificamos el movimiento de inventario RETURN_IN
    expect(txMock.inventoryMovement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          tipo: 'RETURN_IN',
          productoId: 'prod-1',
          renglonVentaId: 'item-1',
          cambioExistencias: new Prisma.Decimal(1),
          tipoReferencia: 'SALE_RETURN',
          referenciaId: 'sale-1',
          creadoPorId: 'user-admin',
          notas: 'Le quedó chico',
        }),
      ],
    });

    // Como aún queda 1 pieza de item-1 y 1 pieza de item-2, la venta NO pasa a REFUNDED
    expect(txMock.sale.update).not.toHaveBeenCalled();
  });

  it('marks sale as REFUNDED when all remaining items are fully returned', async () => {
    txMock.sale.findUnique.mockResolvedValueOnce(sampleSale());
    saleQueryMock.findDetail.mockResolvedValueOnce({
      id: 'sale-1',
      status: 'REFUNDED',
    });

    await useCase.execute('sale-1', {
      actorId: 'user-admin',
      items: [
        { saleItemId: 'item-1', quantity: 2 },
        { saleItemId: 'item-2', quantity: 1 },
      ],
    });

    // Venta se actualiza a REFUNDED
    expect(txMock.sale.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: expect.objectContaining({
        estado: 'REFUNDED',
        canceladoPorId: 'user-admin',
      }),
    });
  });

  it('rejects return if requested quantity exceeds available remaining', async () => {
    const sale = sampleSale();
    // Simula que ya se devolvió 1 pieza de item-1 anteriormente
    sale.items[0]!.inventoryMovements = [
      { cambioExistencias: new Prisma.Decimal('1.000') },
    ];
    txMock.sale.findUnique.mockResolvedValueOnce(sale);

    // Intentar devolver 2 piezas cuando solo queda 1 disponible
    await expect(
      useCase.execute('sale-1', {
        actorId: 'user-admin',
        items: [{ saleItemId: 'item-1', quantity: 2 }],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects return if product does not belong to sale', async () => {
    txMock.sale.findUnique.mockResolvedValueOnce(sampleSale());

    await expect(
      useCase.execute('sale-1', {
        actorId: 'user-admin',
        items: [{ productId: 'prod-desconocido', quantity: 1 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects return if sale is already CANCELLED or REFUNDED', async () => {
    const sale = sampleSale();
    sale.estado = 'CANCELLED';
    txMock.sale.findUnique.mockResolvedValueOnce(sale);

    await expect(
      useCase.execute('sale-1', {
        actorId: 'user-admin',
        items: [{ saleItemId: 'item-1', quantity: 1 }],
      }),
    ).rejects.toThrow(SaleNotCancellableException);
  });

  it('rejects return if sale does not exist', async () => {
    txMock.sale.findUnique.mockResolvedValueOnce(null);

    await expect(
      useCase.execute('sale-inexistente', {
        actorId: 'user-admin',
        items: [{ productId: 'prod-1', quantity: 1 }],
      }),
    ).rejects.toThrow(SaleNotFoundException);
  });
});
