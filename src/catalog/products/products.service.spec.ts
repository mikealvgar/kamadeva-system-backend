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
    size: { count: vi.fn() },
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
    name: 'Anillo',
    description: null,
    barcode: 'SKU',
    brand: null,
    sizes: [] as Array<{ size: { id: string; name: string } }>,
    cost: null,
    minStock: null as Prisma.Decimal | null,
    price: new Prisma.Decimal('0.10'),
    imageUrl: null,
    isActive: true,
    category: { id: 'category', name: 'Anillos', slug: 'anillos' },
    createdAt: date,
    updatedAt: date,
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
    prisma.size.count.mockImplementation(
      ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.length),
    );
    prisma.inventoryMovement.groupBy.mockResolvedValue([]);
    prisma.inventoryMovement.aggregate.mockResolvedValue({
      _sum: { quantityChange: null },
    });
    images.upload.mockResolvedValue(
      'https://res.cloudinary.com/test/image/upload/product.png',
    );
  });

  it('maps public fields to persistence, preserves decimal precision and returns only public fields', async () => {
    const result = await service.create(
      {
        ...dto,
        descripcion: ' ',
        marca: ' Marca ',
        tallaIds: ['size-m', 'size-g'],
        precioCompra: 0,
      },
      'actor',
    );
    expect(prisma.product.create.mock.calls[0]![0].data).toEqual({
      name: 'Anillo',
      price: new Prisma.Decimal('0.10'),
      minStock: null,
      categoryId: 'category',
      description: null,
      barcode: 'SKU',
      brand: 'Marca',
      sizes: { create: [{ sizeId: 'size-m' }, { sizeId: 'size-g' }] },
      cost: new Prisma.Decimal(0),
    });
    expect(result).toEqual({
      id: 'product',
      articulo: 'Anillo',
      descripcion: null,
      codigoBarras: 'SKU',
      marca: null,
      tallas: [],
      precioCompra: null,
      precioVenta: '0.10',
      stock: '0.000',
      stockMinimo: null,
      imageUrl: null,
      isActive: true,
      categoria: product.category,
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    });
  });
  it('records initial stock as an ADMIN-authored inventory adjustment', async () => {
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        productId: 'product',
        _sum: { quantityChange: new Prisma.Decimal('4.125') },
      },
    ]);
    await service.create({ ...dto, stock: 4.125, precioCompra: 10 }, 'admin');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product',
        type: 'ADJUSTMENT_IN',
        quantityChange: new Prisma.Decimal('4.125'),
        referenceType: 'PRODUCT_INITIAL_STOCK',
        referenceId: 'product',
        createdById: 'admin',
      }),
    });
  });
  it('sets stock through a signed movement rather than a product column', async () => {
    prisma.inventoryMovement.aggregate.mockResolvedValue({
      _sum: { quantityChange: new Prisma.Decimal('5.000') },
    });
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        productId: 'product',
        _sum: { quantityChange: new Prisma.Decimal('3.000') },
      },
    ]);
    await service.update('product', { stock: 3 }, 'admin');
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({});
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product',
        type: 'ADJUSTMENT_OUT',
        quantityChange: new Prisma.Decimal('-2.000'),
        referenceType: 'PRODUCT_STOCK_EDIT',
        createdById: 'admin',
      }),
    });
  });

  it('aggregates all listed products in a single query and preserves negative fractional stock', async () => {
    prisma.product.findMany.mockResolvedValue([
      product,
      { ...product, id: 'other', isActive: false },
    ]);
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        productId: 'product',
        _sum: { quantityChange: new Prisma.Decimal('-3.125') },
      },
    ]);
    const result = await service.findAll({
      categoryId: 'category',
      includeInactive: 'true',
      search: 'ORO',
    });
    expect(result.map(({ stock }) => stock)).toEqual(['-3.125', '0.000']);
    expect(prisma.inventoryMovement.groupBy).toHaveBeenCalledExactlyOnceWith({
      by: ['productId'],
      where: { productId: { in: ['product', 'other'] } },
      _sum: { quantityChange: true },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          categoryId: 'category',
          OR: ['name', 'barcode'].map((key) => ({
            [key]: { contains: 'ORO', mode: 'insensitive' },
          })),
        },
        orderBy: { name: 'asc' },
      }),
    );
  });
  it('filters active products by default', async () => {
    await service.findAll();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
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
      cost: new Prisma.Decimal('780.25'),
      price: new Prisma.Decimal('9999999999.99'),
      sizes: [
        { size: { id: 'size-m', name: 'M' } },
        { size: { id: 'size-g', name: 'G' } },
      ],
    });
    prisma.inventoryMovement.groupBy.mockResolvedValue([
      {
        productId: 'product',
        _sum: { quantityChange: new Prisma.Decimal('12.001') },
      },
    ]);
    expect(await service.findById('product')).toMatchObject({
      precioCompra: '780.25',
      precioVenta: '9999999999.99',
      tallas: [
        { id: 'size-m', name: 'M' },
        { id: 'size-g', name: 'G' },
      ],
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
  it('rejects missing or inactive sizes before writing', async () => {
    prisma.size.count.mockResolvedValue(1);
    await expect(
      service.create({ ...dto, tallaIds: ['size-m', 'inactive'] }, 'actor'),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Talla inexistente o inactiva',
    });
    await expect(
      service.update('product', { tallaIds: ['size-m', 'inactive'] }, 'actor'),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.size.count).toHaveBeenCalledWith({
      where: { id: { in: ['size-m', 'inactive'] }, isActive: true },
    });
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
  it('replaces the size list on update and skips size lookup when absent', async () => {
    await service.update('product', { tallaIds: ['size-m'] }, 'actor');
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      sizes: { deleteMany: {}, create: [{ sizeId: 'size-m' }] },
    });
    await service.update('product', { marca: 'X' }, 'actor');
    expect(prisma.size.count).toHaveBeenCalledOnce();
  });
  it('maps every update field without writing stock', async () => {
    await service.update(
      'product',
      {
        ...dto,
        descripcion: '',
        codigoBarras: ' new-code ',
        marca: null,
        tallaIds: [],
        precioCompra: null,
        isActive: false,
      },
      'actor',
    );
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      name: 'Anillo',
      description: null,
      barcode: 'NEW-CODE',
      brand: null,
      sizes: { deleteMany: {}, create: [] },
      cost: null,
      price: new Prisma.Decimal('0.1'),
      categoryId: 'category',
      isActive: false,
    });
  });
  it('maps the minimum stock on create, update and read', async () => {
    await service.create({ ...dto, stockMinimo: 2.5 }, 'actor');
    expect(prisma.product.create.mock.calls[0]![0].data.minStock).toEqual(
      new Prisma.Decimal('2.5'),
    );
    await service.update('product', { stockMinimo: null }, 'actor');
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      minStock: null,
    });
    prisma.product.findUnique.mockResolvedValue({
      ...product,
      minStock: new Prisma.Decimal('2.5'),
    });
    expect((await service.findById('product')).stockMinimo).toBe('2.500');
  });
  it('creates, clears and filters products without a category', async () => {
    const { categoryId: _category, ...uncategorized } = dto;
    await service.create(uncategorized, 'actor');
    expect(prisma.category.findUnique).not.toHaveBeenCalled();
    expect(prisma.product.create.mock.calls[0]![0].data.categoryId).toBeNull();
    await service.update('product', { categoryId: null }, 'actor');
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      categoryId: null,
    });
    prisma.product.findUnique.mockResolvedValue({ ...product, category: null });
    expect((await service.findById('product')).categoria).toBeNull();
    await service.findAll({ sinCategoria: 'true' });
    expect(prisma.product.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { isActive: true, categoryId: null } }),
    );
  });
  it('only changes supplied fields and rejects an empty update', async () => {
    await service.update('product', { precioCompra: 780.25 }, 'actor');
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      cost: new Prisma.Decimal('780.25'),
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
        type: 'SALE_OUT',
        quantityChange: new Prisma.Decimal('-2.125'),
        unitCost: new Prisma.Decimal('12.50'),
        referenceType: null,
        referenceId: null,
        notes: null,
        createdAt: date,
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
        where: { productId: 'product' },
        orderBy: { createdAt: 'desc' },
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
