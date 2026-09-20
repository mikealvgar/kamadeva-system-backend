import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InventoryMovementsService } from './inventory.service.js';
import { manualMovementTypes } from './dto/create-inventory-movement.dto.js';

describe('InventoryMovementsService', () => {
  const prisma = {
    product: { findUnique: vi.fn() },
    inventoryMovement: { create: vi.fn(), findMany: vi.fn() },
  };
  const service = new InventoryMovementsService(
    prisma as unknown as PrismaService,
  );
  const date = new Date('2026-09-14T12:00:00Z');
  const movement = {
    id: 'movement',
    type: 'PURCHASE_IN',
    quantityChange: new Prisma.Decimal('2.125'),
    unitCost: null,
    notes: null,
    referenceType: null,
    referenceId: null,
    createdAt: date,
  };
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.product.findUnique.mockResolvedValue({ id: 'product' });
    prisma.inventoryMovement.create.mockResolvedValue(movement);
    prisma.inventoryMovement.findMany.mockResolvedValue([movement]);
  });
  it.each(manualMovementTypes)(
    'derives sign and records authenticated author for %s',
    async (type) => {
      await service.create(
        'product',
        { type, quantity: 2.125, unitCost: 0, notes: ' compra ' },
        'actor',
      );
      expect(prisma.inventoryMovement.create.mock.calls[0]![0].data).toEqual({
        product: { connect: { id: 'product' } },
        createdBy: { connect: { id: 'actor' } },
        type,
        quantityChange: new Prisma.Decimal(
          type === 'ADJUSTMENT_OUT' ? '-2.125' : '2.125',
        ),
        unitCost: new Prisma.Decimal(0),
        notes: 'compra',
        referenceType: null,
        referenceId: null,
      });
    },
  );
  it('serializes public decimals and normalizes omitted cost and blank notes', async () => {
    const result = await service.create(
      'product',
      { type: 'PURCHASE_IN', quantity: 2.125, notes: ' ' },
      'actor',
    );
    expect(result).toEqual({
      ...movement,
      quantityChange: '2.125',
      createdAt: date.toISOString(),
    });
    expect(
      prisma.inventoryMovement.create.mock.calls[0]![0].data,
    ).toMatchObject({ unitCost: null, notes: null });
  });
  it('rejects SALE_OUT before writing', async () => {
    await expect(
      service.create('product', { type: 'SALE_OUT', quantity: 1 }, 'actor'),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });
  it('requires an existing product for creation and filtering', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(
      service.create('missing', { type: 'RETURN_IN', quantity: 1 }, 'actor'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.findAll({ productId: 'missing' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.findMany).not.toHaveBeenCalled();
  });
  it('maps P2025 without disguising infrastructure errors', async () => {
    prisma.inventoryMovement.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: '7.10.0',
      }),
    );
    await expect(
      service.create('product', { type: 'RETURN_IN', quantity: 1 }, 'actor'),
    ).rejects.toMatchObject({ status: 404 });
    const failure = new Error('offline');
    prisma.inventoryMovement.create.mockRejectedValue(failure);
    await expect(
      service.create('product', { type: 'RETURN_IN', quantity: 1 }, 'actor'),
    ).rejects.toBe(failure);
  });
  it('combines inclusive filters and orders newest first', async () => {
    prisma.inventoryMovement.findMany.mockResolvedValue([
      { ...movement, unitCost: new Prisma.Decimal('780.25') },
    ]);
    expect(
      await service.findAll({
        productId: 'product',
        type: 'SALE_OUT',
        startDate: date.toISOString(),
        endDate: date.toISOString(),
      }),
    ).toEqual([
      {
        ...movement,
        quantityChange: '2.125',
        unitCost: '780.25',
        createdAt: date.toISOString(),
      },
    ]);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId: 'product',
          type: 'SALE_OUT',
          createdAt: { gte: date, lte: date },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
  it('rejects dates unsupported by persistence before querying', async () => {
    await expect(
      service.findAll({ startDate: '2026-W01-1' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.inventoryMovement.findMany).not.toHaveBeenCalled();
  });
  it('returns an empty global list without checking a product', async () => {
    prisma.inventoryMovement.findMany.mockResolvedValue([]);
    expect(await service.findAll()).toEqual([]);
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
  });
  it.each(['startDate', 'endDate'] as const)(
    'supports only %s',
    async (key) => {
      await service.findAll({ [key]: date.toISOString() });
      expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdAt: { [key === 'startDate' ? 'gte' : 'lte']: date } },
        }),
      );
    },
  );
});
