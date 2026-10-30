import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PurchasesService } from './purchases.service.js';

describe('PurchasesService', () => {
  const provider = { id: 'provider-1', isActive: true };
  const product = {
    id: 'product-1',
    name: 'Vibrador',
    barcode: '750001',
    cost: new Prisma.Decimal('125.50'),
    isActive: true,
  };
  const purchaseRecord = {
    id: 'purchase-1',
    provider: { id: provider.id, name: 'Proveedor Norte' },
    receivedAt: new Date('2026-10-30T18:00:00.000Z'),
    supplierFolio: 'FAC-1842',
    notes: 'Compra de mercancía',
    total: new Prisma.Decimal('251.00'),
    createdById: 'admin-1',
    createdAt: new Date('2026-10-30T18:00:00.000Z'),
    items: [
      {
        id: 'item-1',
        productId: product.id,
        productName: product.name,
        barcode: product.barcode,
        quantity: new Prisma.Decimal('2.000'),
        unitCost: new Prisma.Decimal('125.50'),
        lineSubtotal: new Prisma.Decimal('251.00'),
      },
    ],
  };

  const tx = {
    provider: { findUnique: vi.fn() },
    product: { findMany: vi.fn() },
    purchase: { create: vi.fn() },
    inventoryMovement: { createMany: vi.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(),
    purchase: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  const service = new PurchasesService(prisma as unknown as PrismaService);
  const input = {
    proveedorId: provider.id,
    fechaRecepcion: '2026-10-30T18:00:00.000Z',
    folioProveedor: ' FAC-1842 ',
    notas: ' Compra de mercancía ',
    productos: [{ productoId: product.id, cantidad: 2 }],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (operation: (client: typeof tx) => unknown) => operation(tx),
    );
    tx.provider.findUnique.mockResolvedValue(provider);
    tx.product.findMany.mockResolvedValue([product]);
    tx.purchase.create.mockResolvedValue(purchaseRecord);
    tx.inventoryMovement.createMany.mockResolvedValue({ count: 1 });
  });

  it('creates the purchase, snapshots product acquisition cost and increases stock atomically', async () => {
    const result = await service.create(input, 'admin-1');

    expect(result).toMatchObject({
      id: 'purchase-1',
      proveedor: { id: provider.id, nombre: 'Proveedor Norte' },
      total: '251.00',
      productos: [
        {
          cantidad: '2.000',
          costoUnitario: '125.50',
          subtotal: '251.00',
        },
      ],
    });
    const createData = tx.purchase.create.mock.calls[0]![0].data;
    expect(createData.total).toEqual(new Prisma.Decimal('251.00'));
    expect(createData.items.create[0]).toMatchObject({
      productName: 'Vibrador',
      barcode: '750001',
      quantity: new Prisma.Decimal('2.000'),
      unitCost: new Prisma.Decimal('125.50'),
      lineSubtotal: new Prisma.Decimal('251.00'),
    });
    expect(tx.inventoryMovement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productId: product.id,
          type: 'PURCHASE_IN',
          quantityChange: new Prisma.Decimal('2.000'),
          unitCost: new Prisma.Decimal('125.50'),
          referenceType: 'PURCHASE',
          referenceId: 'purchase-1',
          createdById: 'admin-1',
        }),
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('rejects an unknown or inactive provider without writing', async () => {
    tx.provider.findUnique.mockResolvedValue(null);
    await expect(service.create(input, 'admin-1')).rejects.toMatchObject({
      status: 404,
    });
    expect(tx.purchase.create).not.toHaveBeenCalled();

    tx.provider.findUnique.mockResolvedValue({ ...provider, isActive: false });
    await expect(service.create(input, 'admin-1')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rejects unknown, inactive or costless products without writing', async () => {
    tx.product.findMany.mockResolvedValue([]);
    await expect(service.create(input, 'admin-1')).rejects.toMatchObject({
      status: 404,
    });

    tx.product.findMany.mockResolvedValue([{ ...product, isActive: false }]);
    await expect(service.create(input, 'admin-1')).rejects.toMatchObject({
      status: 409,
    });

    tx.product.findMany.mockResolvedValue([{ ...product, cost: null }]);
    await expect(service.create(input, 'admin-1')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('precio de compra'),
    });
    expect(tx.purchase.create).not.toHaveBeenCalled();
  });

  it('lists newest first with provider and date filters plus pagination', async () => {
    prisma.purchase.findMany.mockResolvedValue([purchaseRecord]);
    prisma.purchase.count.mockResolvedValue(7);
    const result = await service.findAll({
      proveedorId: provider.id,
      fechaInicio: '2026-10-01T00:00:00.000Z',
      fechaFin: '2026-10-31T23:59:59.999Z',
      pagina: 2,
      limite: 5,
    });
    expect(result).toMatchObject({ pagina: 2, limite: 5, total: 7 });
    expect(prisma.purchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          providerId: provider.id,
          receivedAt: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-10-31T23:59:59.999Z'),
          },
        },
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        skip: 5,
        take: 5,
      }),
    );
  });

  it('returns 404 for an unknown purchase', async () => {
    prisma.purchase.findUnique.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toMatchObject({
      status: 404,
    });
  });
});
