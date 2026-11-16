import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PurchasesService } from './purchases.service.js';

describe('PurchasesService', () => {
  const provider = { id: 'provider-1', activo: true };
  const product = {
    id: 'product-1',
    nombre: 'Vibrador',
    codigoBarras: '750001',
    precioCompra: new Prisma.Decimal('125.50'),
    activo: true,
  };
  const purchaseRecord = {
    id: 'purchase-1',
    proveedor: { id: provider.id, nombre: 'Proveedor Norte' },
    fechaCompra: new Date('2026-10-29T18:00:00.000Z'),
    fechaRecepcion: new Date('2026-10-30T18:00:00.000Z'),
    folioProveedor: 'FAC-1842',
    notas: 'Compra de mercancía',
    iva: new Prisma.Decimal('0.00'),
    total: new Prisma.Decimal('251.00'),
    creadoPorId: 'admin-1',
    estado: 'COMPLETED' as const,
    fechaCancelacion: null as Date | null,
    canceladoPor: null as { id: string; nombre: string } | null,
    motivoCancelacion: null as string | null,
    fechaCreacion: new Date('2026-10-30T18:00:00.000Z'),
    items: [
      {
        id: 'item-1',
        productoId: product.id,
        nombreProducto: product.nombre,
        codigoBarras: product.codigoBarras,
        cantidad: new Prisma.Decimal('2.000'),
        costoUnitario: new Prisma.Decimal('125.50'),
        subtotalRenglon: new Prisma.Decimal('251.00'),
      },
    ],
  };

  const tx = {
    provider: { findUnique: vi.fn() },
    product: { findMany: vi.fn(), update: vi.fn() },
    purchase: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    inventoryMovement: { createMany: vi.fn(), groupBy: vi.fn() },
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
      nombreProducto: 'Vibrador',
      codigoBarras: '750001',
      cantidad: new Prisma.Decimal('2.000'),
      costoUnitario: new Prisma.Decimal('125.50'),
      subtotalRenglon: new Prisma.Decimal('251.00'),
    });
    expect(tx.inventoryMovement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productoId: product.id,
          tipo: 'PURCHASE_IN',
          cambioExistencias: new Prisma.Decimal('2.000'),
          costoUnitario: new Prisma.Decimal('125.50'),
          tipoReferencia: 'PURCHASE',
          referenciaId: 'purchase-1',
          creadoPorId: 'admin-1',
        }),
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('updates product precioCompra and precioVenta, and persists fechaCompra, iva and total', async () => {
    tx.purchase.create.mockResolvedValue({
      ...purchaseRecord,
      fechaCompra: new Date('2026-10-28T10:00:00.000Z'),
      iva: new Prisma.Decimal('48.00'),
      total: new Prisma.Decimal('348.00'),
    });
    const result = await service.create(
      {
        ...input,
        fechaCompra: '2026-10-28T10:00:00.000Z',
        iva: 48,
        productos: [
          {
            productoId: product.id,
            cantidad: 2,
            precioCompra: 150,
            precioVenta: 220,
          },
        ],
      },
      'admin-1',
    );
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: product.id },
      data: {
        precioCompra: new Prisma.Decimal('150.00'),
        precioVenta: new Prisma.Decimal('220.00'),
      },
    });
    expect(result).toMatchObject({
      fechaCompra: '2026-10-28T10:00:00.000Z',
      iva: '48.00',
      total: '348.00',
    });
  });

  it('rejects an unknown or inactive provider without writing', async () => {
    tx.provider.findUnique.mockResolvedValue(null);
    await expect(service.create(input, 'admin-1')).rejects.toMatchObject({
      status: 404,
    });
    expect(tx.purchase.create).not.toHaveBeenCalled();

    tx.provider.findUnique.mockResolvedValue({ ...provider, activo: false });
    await expect(service.create(input, 'admin-1')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rejects unknown, inactive or costless products without writing', async () => {
    tx.product.findMany.mockResolvedValue([]);
    await expect(service.create(input, 'admin-1')).rejects.toMatchObject({
      status: 404,
    });

    tx.product.findMany.mockResolvedValue([{ ...product, activo: false }]);
    await expect(service.create(input, 'admin-1')).rejects.toMatchObject({
      status: 409,
    });

    tx.product.findMany.mockResolvedValue([{ ...product, precioCompra: null }]);
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
    expect(result).toMatchObject({
      current_page: 2,
      total_items: 7,
      total_pages: 2,
      has_next_page: false,
      has_prev_page: true,
    });
    expect(prisma.purchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          proveedorId: provider.id,
          fechaRecepcion: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-10-31T23:59:59.999Z'),
          },
        },
        orderBy: [{ fechaRecepcion: 'desc' }, { id: 'desc' }],
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

  it('cancels a completed purchase and creates ADJUSTMENT_OUT kardex movements', async () => {
    const cancelledRecord = {
      ...purchaseRecord,
      estado: 'CANCELLED' as const,
      fechaCancelacion: new Date('2026-11-01T12:00:00.000Z'),
      canceladoPor: { id: 'admin-1', nombre: 'Admin' },
      motivoCancelacion: 'Factura cancelada',
    };
    tx.purchase.findUnique.mockResolvedValue(purchaseRecord);
    tx.inventoryMovement.groupBy.mockResolvedValue([
      { productoId: product.id, _sum: { cambioExistencias: new Prisma.Decimal('5.000') } },
    ]);
    tx.purchase.update.mockResolvedValue(cancelledRecord);

    const result = await service.cancel(
      purchaseRecord.id,
      'Factura cancelada',
      'admin-1',
    );

    expect(result).toMatchObject({
      id: purchaseRecord.id,
      estado: 'CANCELLED',
      fechaCancelacion: '2026-11-01T12:00:00.000Z',
      canceladoPor: { id: 'admin-1', nombre: 'Admin' },
      motivoCancelacion: 'Factura cancelada',
    });
    expect(tx.inventoryMovement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productoId: product.id,
          tipo: 'ADJUSTMENT_OUT',
          cambioExistencias: new Prisma.Decimal('-2.000'),
          costoUnitario: new Prisma.Decimal('125.50'),
          tipoReferencia: 'PURCHASE_CANCELLATION',
          referenciaId: purchaseRecord.id,
          creadoPorId: 'admin-1',
          notas: 'Cancelación de compra: Factura cancelada',
        }),
      ],
    });
  });

  it('returns an already cancelled purchase idempotently without moving stock again', async () => {
    const cancelledRecord = {
      ...purchaseRecord,
      estado: 'CANCELLED' as const,
      fechaCancelacion: new Date('2026-11-01T12:00:00.000Z'),
      canceladoPor: { id: 'admin-1', nombre: 'Admin' },
      motivoCancelacion: 'Factura cancelada',
    };
    tx.purchase.findUnique.mockResolvedValue(cancelledRecord);

    const result = await service.cancel(
      purchaseRecord.id,
      'Otro motivo',
      'admin-2',
    );

    expect(result.estado).toBe('CANCELLED');
    expect(result.motivoCancelacion).toBe('Factura cancelada');
    expect(tx.purchase.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.createMany).not.toHaveBeenCalled();
  });

  it('rejects cancellation with 409 when current stock is less than purchased quantity', async () => {
    tx.purchase.findUnique.mockResolvedValue(purchaseRecord);
    tx.inventoryMovement.groupBy.mockResolvedValue([
      { productoId: product.id, _sum: { cambioExistencias: new Prisma.Decimal('1.000') } },
    ]);

    await expect(
      service.cancel(purchaseRecord.id, 'Error de captura', 'admin-1'),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.purchase.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.createMany).not.toHaveBeenCalled();
  });

  it('returns 404 when cancelling an unknown purchase', async () => {
    tx.purchase.findUnique.mockResolvedValue(null);
    await expect(
      service.cancel('missing', 'Motivo', 'admin-1'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
