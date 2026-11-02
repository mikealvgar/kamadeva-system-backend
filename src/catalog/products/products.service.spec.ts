import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProductsService } from './products.service.js';

describe('ProductsService', () => {
  const prisma = {
    $transaction: vi.fn(),
    product: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: { findUnique: vi.fn() },
    brand: { findUnique: vi.fn() },
    inventoryMovement: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
    },
  };
  const images = { upload: vi.fn() };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    images,
  );
  const date = new Date('2026-09-13T00:00:00Z');
  const product = {
    id: 'product',
    nombre: 'Anillo',
    descripcion: null,
    codigoBarras: 'SKU',
    marcaId: null,
    marca: null,
    precioCompra: null,
    existenciaMinima: null as Prisma.Decimal | null,
    precioVenta: new Prisma.Decimal('0.10'),
    imageUrl: null,
    activo: true,
    categoriaId: 'category',
    categoria: { id: 'category', descripcion: 'ANILLOS' },
    fechaCreacion: date,
    fechaActualizacion: date,
  };
  const dto = {
    codigoBarras: ' sku ',
    articulo: ' Anillo ',
    precioVenta: 0.1,
    categoryId: 'category',
  };
  const error = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('DB error', {
      code,
      clientVersion: '7.10.0',
    });

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (operation: (client: typeof prisma) => unknown) => operation(prisma),
    );
    prisma.product.create.mockResolvedValue(product);
    prisma.product.update.mockResolvedValue(product);
    prisma.product.findUnique.mockResolvedValue(product);
    prisma.product.findMany.mockResolvedValue([product]);
    prisma.category.findUnique.mockResolvedValue({ id: 'category' });
    prisma.brand.findUnique.mockResolvedValue(null);
    prisma.inventoryMovement.groupBy.mockResolvedValue([]);
    prisma.inventoryMovement.aggregate.mockResolvedValue({
      _sum: { cambioExistencias: null },
    });
    images.upload.mockResolvedValue(
      'https://res.cloudinary.com/test/image/upload/product.png',
    );
  });

  it('maps public fields to persistence, preserves decimal precision and returns only public fields', async () => {
    prisma.brand.findUnique.mockResolvedValue({
      id: 'brand-id',
      descripcion: 'MARCA',
    });
    const result = await service.create(
      {
        ...dto,
        descripcion: ' ',
        marca: ' Marca ',
        precioCompra: 0,
      },
      'actor',
    );
    expect(prisma.product.create.mock.calls[0]![0].data).toEqual({
      nombre: 'Anillo',
      precioVenta: new Prisma.Decimal('0.10'),
      existenciaMinima: null,
      categoriaId: 'category',
      descripcion: null,
      codigoBarras: 'SKU',
      marcaId: 'brand-id',
      precioCompra: new Prisma.Decimal(0),
      activo: true,
    });
    expect(result).toEqual({
      id: 'product',
      nombre: 'Anillo',
      articulo: 'Anillo',
      name: 'Anillo',
      descripcion: null,
      description: null,
      codigoBarras: 'SKU',
      barcode: 'SKU',
      marca: null,
      marcaId: null,
      brand: null,
      tallas: [],
      precioCompra: null,
      precioVenta: '0.10',
      stock: '0.000',
      existenciaMinima: null,
      stockMinimo: null,
      imageUrl: null,
      activo: true,
      isActive: true,
      categoria: product.categoria,
      categoriaId: 'category',
      fechaCreacion: date.toISOString(),
      fechaActualizacion: date.toISOString(),
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    });
  });

  it('records initial stock as an ADMIN-authored inventory adjustment', async () => {
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        productoId: 'product',
        _sum: { cambioExistencias: new Prisma.Decimal('4.125') },
      },
    ]);
    await service.create({ ...dto, stock: 4.125, precioCompra: 10 }, 'admin');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productoId: 'product',
        tipo: 'ADJUSTMENT_IN',
        cambioExistencias: new Prisma.Decimal('4.125'),
        tipoReferencia: 'PRODUCT_INITIAL_STOCK',
        creadoPorId: 'admin',
      }),
    });
  });

  it('sets stock through a signed movement rather than a product column', async () => {
    prisma.inventoryMovement.aggregate.mockResolvedValue({
      _sum: { cambioExistencias: new Prisma.Decimal('5.000') },
    });
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        productoId: 'product',
        _sum: { cambioExistencias: new Prisma.Decimal('3.000') },
      },
    ]);
    await service.update('product', { stock: 3 }, 'admin');
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({});
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productoId: 'product',
        tipo: 'ADJUSTMENT_OUT',
        cambioExistencias: new Prisma.Decimal('-2.000'),
        tipoReferencia: 'PRODUCT_STOCK_EDIT',
        creadoPorId: 'admin',
      }),
    });
  });

  it('aggregates all listed products in a single query and preserves negative fractional stock', async () => {
    prisma.product.findMany.mockResolvedValue([
      product,
      { ...product, id: 'other', activo: false },
    ]);
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        productoId: 'product',
        _sum: { cambioExistencias: new Prisma.Decimal('-3.125') },
      },
    ]);
    const result = await service.findAll({
      categoryId: 'category',
      includeInactive: 'true',
      search: 'ORO',
    });
    expect(result.map(({ stock }) => stock)).toEqual(['-3.125', '0.000']);
    expect(prisma.inventoryMovement.groupBy).toHaveBeenCalledExactlyOnceWith({
      by: ['productoId'],
      where: { productoId: { in: ['product', 'other'] } },
      _sum: { cambioExistencias: true },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          categoriaId: 'category',
          OR: ['nombre', 'codigoBarras'].map((key) => ({
            [key]: { contains: 'ORO', mode: 'insensitive' },
          })),
        },
        orderBy: { nombre: 'asc' },
      }),
    );
  });

  it('filters active products by default', async () => {
    await service.findAll();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true } }),
    );
  });

  it('does not aggregate an empty list', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    expect(await service.findAll()).toEqual([]);
    expect(prisma.inventoryMovement.groupBy).not.toHaveBeenCalled();
  });

  it('includes stock and exact money strings in detail', async () => {
    prisma.product.findUnique.mockResolvedValue({
      ...product,
      precioCompra: new Prisma.Decimal('780.25'),
      precioVenta: new Prisma.Decimal('9999999999.99'),
    });
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        productoId: 'product',
        _sum: { cambioExistencias: new Prisma.Decimal('12.001') },
      },
    ]);
    expect(await service.findById('product')).toMatchObject({
      precioCompra: '780.25',
      precioVenta: '9999999999.99',
      stock: '12.001',
    });
  });

  it.each(['findById', 'movements', 'delete'] as const)(
    'reports missing product in %s',
    async (method) => {
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.product.delete.mockRejectedValue(error('P2025'));
      await expect(service[method]('missing')).rejects.toMatchObject({
        status: 404,
      });
      expect(prisma.inventoryMovement.groupBy).not.toHaveBeenCalled();
    },
  );

  it('requires category before creating or updating', async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    await expect(service.create(dto, 'actor')).rejects.toMatchObject({
      status: 404,
      message: 'Categoría inexistente',
    });
    await expect(
      service.update('product', { categoryId: 'missing' }, 'actor'),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('maps every update field without writing stock', async () => {
    await service.update(
      'product',
      {
        ...dto,
        descripcion: '',
        codigoBarras: ' new-code ',
        marcaId: null,
        precioCompra: null,
        isActive: false,
      },
      'actor',
    );
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      nombre: 'Anillo',
      descripcion: null,
      codigoBarras: 'NEW-CODE',
      marcaId: null,
      precioCompra: null,
      precioVenta: new Prisma.Decimal('0.1'),
      categoriaId: 'category',
      activo: false,
    });
  });

  it('maps the minimum stock on create, update and read', async () => {
    await service.create({ ...dto, stockMinimo: 2.5 }, 'actor');
    expect(prisma.product.create.mock.calls[0]![0].data.existenciaMinima).toEqual(
      new Prisma.Decimal('2.5'),
    );
    await service.update('product', { stockMinimo: null }, 'actor');
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      existenciaMinima: null,
    });
    prisma.product.findUnique.mockResolvedValue({
      ...product,
      existenciaMinima: new Prisma.Decimal('2.5'),
    });
    expect((await service.findById('product')).stockMinimo).toBe('2.500');
  });

  it('creates, clears and filters products without a category', async () => {
    const { categoryId: _category, ...uncategorized } = dto;
    await service.create(uncategorized, 'actor');
    expect(prisma.category.findUnique).not.toHaveBeenCalled();
    expect(prisma.product.create.mock.calls[0]![0].data.categoriaId).toBeNull();
    await service.update('product', { categoryId: null }, 'actor');
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      categoriaId: null,
    });
    prisma.product.findUnique.mockResolvedValue({ ...product, categoria: null });
    expect((await service.findById('product')).categoria).toBeNull();
    await service.findAll({ sinCategoria: 'true' });
    expect(prisma.product.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { activo: true, categoriaId: null } }),
    );
  });

  it('only changes supplied fields and rejects an empty update', async () => {
    await service.update('product', { precioCompra: 780.25 }, 'actor');
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      precioCompra: new Prisma.Decimal('780.25'),
    });
    await expect(service.update('product', {}, 'actor')).rejects.toMatchObject({
      status: 400,
    });
  });

  it.each(['P2002', 'P2025', 'P2003'])('maps update races %s', async (code) => {
    prisma.product.update.mockRejectedValue(error(code));
    await expect(
      service.update('product', { categoryId: 'category' }, 'actor'),
    ).rejects.toMatchObject({ status: code === 'P2002' ? 409 : 404 });
  });

  it.each(['P2002', 'P2003'])('maps creation races %s', async (code) => {
    prisma.product.create.mockRejectedValue(error(code));
    await expect(service.create(dto, 'actor')).rejects.toMatchObject({
      status: code === 'P2002' ? 409 : 404,
    });
  });

  it('deletes without a body and maps restrictive references to 409', async () => {
    await expect(service.delete('product')).resolves.toBeUndefined();
    expect(prisma.product.delete).toHaveBeenCalledWith({
      where: { id: 'product' },
      select: { id: true },
    });
    prisma.product.delete.mockRejectedValue(error('P2003'));
    await expect(service.delete('product')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('lists only public movement fields ordered newest first', async () => {
    prisma.inventoryMovement.findMany.mockResolvedValue([
      {
        id: 'movement',
        tipo: 'SALE_OUT',
        cambioExistencias: new Prisma.Decimal('-2.125'),
        costoUnitario: new Prisma.Decimal('12.50'),
        tipoReferencia: null,
        referenciaId: null,
        notas: null,
        fechaCreacion: date,
      },
    ]);
    expect(await service.movements('product')).toEqual([
      {
        id: 'movement',
        type: 'SALE_OUT',
        quantityChange: '-2.125',
        unitCost: '12.50',
        referenceType: null,
        referenceId: null,
        notes: null,
        createdAt: date.toISOString(),
      },
    ]);
    expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productoId: 'product' },
        orderBy: { fechaCreacion: 'desc' },
      }),
    );
  });

  it('persists the uploaded URL and returns the product', async () => {
    const buffer = Buffer.from('image');
    prisma.product.update.mockResolvedValue({
      ...product,
      imageUrl: 'https://image.test/new',
    });
    expect(
      await service.uploadImage('product', buffer, 'image/png'),
    ).toMatchObject({ imageUrl: 'https://image.test/new' });
    expect(images.upload).toHaveBeenCalledWith('product', buffer, 'image/png');
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          imageUrl: 'https://res.cloudinary.com/test/image/upload/product.png',
        },
      }),
    );
  });

  it('does not call the image provider for a missing product', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(
      service.uploadImage('missing', Buffer.alloc(1), 'image/png'),
    ).rejects.toMatchObject({ status: 404 });
    expect(images.upload).not.toHaveBeenCalled();
  });

  it('does not change persisted image on provider failure', async () => {
    const failure = new Error('Upload failed');
    images.upload.mockRejectedValue(failure);
    await expect(
      service.uploadImage('product', Buffer.alloc(1), 'image/png'),
    ).rejects.toBe(failure);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('does not disguise infrastructure errors', async () => {
    const failure = new Error('Connection lost');
    prisma.product.create.mockRejectedValue(failure);
    await expect(service.create(dto, 'actor')).rejects.toBe(failure);
  });
});
