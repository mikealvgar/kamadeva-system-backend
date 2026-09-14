import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CategoriesService } from './categories.service.js';
import { slugify } from './slugify.js';

describe('CategoriesService', () => {
  const prisma = {
    category: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new CategoriesService(prisma as unknown as PrismaService);
  const category = {
    id: 'category',
    name: 'Anillos',
    slug: 'anillos',
    description: null,
    isActive: true,
  };
  const select = {
    id: true,
    name: true,
    slug: true,
    description: true,
    isActive: true,
  };
  const failure = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('Database failure', {
      code,
      clientVersion: '7.10.0',
    });

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.category.create.mockResolvedValue(category);
    prisma.category.update.mockResolvedValue(category);
    prisma.category.findUnique.mockResolvedValue(category);
    prisma.category.findMany.mockResolvedValue([category]);
  });

  it.each([
    ['  Ánillos & colección! ', 'anillos-coleccion'],
    ['Niño -- oro 24', 'nino-oro-24'],
    ['!!!', ''],
  ])('slugifies %s', (name, expected) => expect(slugify(name)).toBe(expected));

  it('creates normalized public fields and relies on the unique constraint', async () => {
    expect(
      await service.create({ name: ' Ánillos ', description: '  ' }),
    ).toEqual(category);
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { name: 'Ánillos', slug: 'anillos', description: null },
      select,
    });
  });
  it('preserves an explicit slug and trims the description', async () => {
    await service.create({
      name: 'Anillos',
      slug: 'joyas',
      description: ' Oro ',
    });
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { name: 'Anillos', slug: 'joyas', description: 'Oro' },
      select,
    });
  });
  it('rejects names that cannot produce a valid slug before writing', async () => {
    await expect(service.create({ name: '!!!' })).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.category.create).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'lists public fields with includeInactive=%s in name order',
    async (includeInactive) => {
      expect(await service.findAll(includeInactive)).toEqual([category]);
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: includeInactive ? {} : { isActive: true },
        orderBy: { name: 'asc' },
        select,
      });
    },
  );
  it('finds a public category and reports missing IDs', async () => {
    expect(await service.findById(category.id)).toEqual(category);
    expect(prisma.category.findUnique).toHaveBeenCalledWith({
      where: { id: category.id },
      select,
    });
    prisma.category.findUnique.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('regenerates slug on rename and returns the updated public category', async () => {
    expect(await service.update(category.id, { name: ' Oro rosa ' })).toEqual(
      category,
    );
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: category.id },
      data: { name: 'Oro rosa', slug: 'oro-rosa' },
      select,
    });
  });
  it('uses explicit slug when renaming', async () => {
    await service.update(category.id, { name: 'Oro', slug: 'mi-oro' });
    expect(prisma.category.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Oro', slug: 'mi-oro' } }),
    );
  });
  it.each(['', '   ', null])(
    'clears description %s without changing name or slug',
    async (description) => {
      await service.update(category.id, { description, isActive: false });
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { description: null, isActive: false },
        }),
      );
    },
  );
  it('rejects an empty update', async () => {
    await expect(service.update(category.id, {})).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
  it('deletes with no response body', async () => {
    await expect(service.delete(category.id)).resolves.toBeUndefined();
    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: category.id },
      select: { id: true },
    });
  });
  it.each(['create', 'update'] as const)(
    'maps duplicate constraint races from %s to 409',
    async (method) => {
      prisma.category[method].mockRejectedValue(failure('P2002'));
      await expect(
        method === 'create'
          ? service.create({ name: 'Anillos' })
          : service.update(category.id, { slug: 'anillos' }),
      ).rejects.toMatchObject({ status: 409, message: 'El slug ya existe' });
    },
  );
  it.each(['update', 'delete'] as const)(
    'maps missing records from %s to 404',
    async (method) => {
      prisma.category[method].mockRejectedValue(failure('P2025'));
      await expect(
        method === 'update'
          ? service.update('missing', { name: 'Oro' })
          : service.delete('missing'),
      ).rejects.toMatchObject({ status: 404 });
    },
  );
  it('maps foreign key conflicts to 409', async () => {
    prisma.category.delete.mockRejectedValue(failure('P2003'));
    await expect(service.delete(category.id)).rejects.toMatchObject({
      status: 409,
      message: 'La categoría tiene productos asociados',
    });
  });
  it('preserves unexpected infrastructure failures', async () => {
    const error = new Error('Connection lost');
    prisma.category.create.mockRejectedValue(error);
    await expect(service.create({ name: 'Oro' })).rejects.toBe(error);
  });
});
