import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProductsService } from './products.service.js';

describe('ProductsService', () => {
  const prisma = {
    product: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    category: { findUnique: vi.fn() },
    inventoryMovement: { groupBy: vi.fn(), findMany: vi.fn() },
  };
  const images = { upload: vi.fn() };
  const service = new ProductsService(
    prisma as unknown as PrismaService,
    images,
  );
  const date = new Date('2026-09-13T00:00:00Z');
  const product = {
    id: 'product',
    sku: 'SKU',
    name: 'Anillo',
    description: null,
    barcode: null,
    brand: null,
    tallas: [],
    cost: null,
    price: new Prisma.Decimal('0.10'),
    imageUrl: null,
    isActive: true,
    category: { id: 'category', name: 'Anillos', slug: 'anillos' },
    createdAt: date,
    updatedAt: date,
  };
  const dto = {
    sku: ' sku ',
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
    prisma.product.create.mockResolvedValue(product);
    prisma.product.update.mockResolvedValue(product);
    prisma.product.findUnique.mockResolvedValue(product);
    prisma.product.findMany.mockResolvedValue([product]);
    prisma.category.findUnique.mockResolvedValue({ id: 'category' });
    prisma.inventoryMovement.groupBy.mockResolvedValue([]);
    images.upload.mockResolvedValue(
      'https://res.cloudinary.com/test/image/upload/product.png',
    );
  });

  it('maps public fields to persistence, preserves decimal precision and returns only public fields', async () => {
    const result = await service.create({
      ...dto,
      descripcion: ' ',
      codigoBarras: ' 123 ',
      marca: ' Marca ',
      tallas: [' 8 '],
      precioCompra: 0,
    });
    expect(prisma.product.create.mock.calls[0]![0].data).toEqual({
      sku: 'SKU',
      name: 'Anillo',
      price: new Prisma.Decimal('0.10'),
      categoryId: 'category',
      description: null,
      barcode: '123',
      brand: 'Marca',
      tallas: ['8'],
      cost: new Prisma.Decimal(0),
    });
    expect(result).toEqual({
      id: 'product',
      sku: 'SKU',
      articulo: 'Anillo',
      descripcion: null,
      codigoBarras: null,
      marca: null,
      tallas: null,
      precioCompra: null,
      precioVenta: '0.10',
      stock: '0.000',
      imageUrl: null,
      isActive: true,
      categoria: product.category,
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
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
          OR: ['name', 'sku', 'barcode'].map((key) => ({
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
      tallas: ['8'],
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
      tallas: ['8'],
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
    await expect(service.create(dto)).rejects.toMatchObject({
      status: 404,
      message: 'Categoría inexistente',
    });
    await expect(
      service.update('product', { categoryId: 'missing' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
  it('maps every update field without writing stock', async () => {
    await service.update('product', {
      ...dto,
      descripcion: '',
      codigoBarras: '',
      marca: null,
      tallas: [],
      precioCompra: null,
      isActive: false,
    });
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      sku: 'SKU',
      name: 'Anillo',
      description: null,
      barcode: null,
      brand: null,
      tallas: [],
      cost: null,
      price: new Prisma.Decimal('0.1'),
      categoryId: 'category',
      isActive: false,
    });
  });
  it('only changes supplied fields and rejects an empty update', async () => {
    await service.update('product', { precioCompra: 780.25 });
    expect(prisma.product.update.mock.calls[0]![0].data).toEqual({
      cost: new Prisma.Decimal('780.25'),
    });
    await expect(service.update('product', {})).rejects.toMatchObject({
      status: 400,
    });
  });
  it.each(['P2002', 'P2025', 'P2003'])('maps update races %s', async (code) => {
    prisma.product.update.mockRejectedValue(error(code));
    await expect(
      service.update('product', { categoryId: 'category' }),
    ).rejects.toMatchObject({ status: code === 'P2002' ? 409 : 404 });
  });
  it.each(['P2002', 'P2003'])('maps creation races %s', async (code) => {
    prisma.product.create.mockRejectedValue(error(code));
    await expect(service.create(dto)).rejects.toMatchObject({
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
    await expect(service.create(dto)).rejects.toBe(failure);
  });
});
