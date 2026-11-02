import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CategoriesService,
  normalizeCategoryDescription,
} from './categories.service.js';

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
  const now = new Date('2026-09-19T10:00:00.000Z');
  const record = {
    id: 'category',
    descripcion: 'ANILLOS',
    activo: true,
    fechaCreacion: now,
    fechaActualizacion: now,
  };
  const dto = {
    id: 'category',
    descripcion: 'ANILLOS',
    name: 'ANILLOS',
    activo: true,
    isActive: true,
    fechaCreacion: now.toISOString(),
    fechaActualizacion: now.toISOString(),
  };
  const failure = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('Database failure', {
      code,
      clientVersion: '7.10.0',
    });

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.category.create.mockResolvedValue(record);
    prisma.category.update.mockResolvedValue(record);
    prisma.category.findUnique.mockResolvedValue(record);
    prisma.category.findMany.mockResolvedValue([record]);
  });

  it('normalizes category description to uppercase and trims multiple whitespace', () => {
    expect(normalizeCategoryDescription('  anillos   de compromiso  ')).toBe(
      'ANILLOS DE COMPROMISO',
    );
  });

  it('creates upper-case descriptions, normalized fields and relies on the unique constraint', async () => {
    expect(await service.create({ descripcion: ' anillos ' })).toEqual(dto);
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { descripcion: 'ANILLOS' },
    });
  });

  it('accepts name alias as description on create', async () => {
    expect(await service.create({ name: ' anillos ' })).toEqual(dto);
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { descripcion: 'ANILLOS' },
    });
  });

  it('rejects empty or whitespace descriptions before writing', async () => {
    await expect(service.create({ descripcion: '   ' })).rejects.toMatchObject({
      status: 400,
      message: 'La descripción es obligatoria',
    });
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'lists public fields with includeInactive=%s in description order',
    async (includeInactive) => {
      expect(await service.findAll(includeInactive)).toEqual([dto]);
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        where: includeInactive ? {} : { activo: true },
        orderBy: { descripcion: 'asc' },
      });
    },
  );

  it('finds a public category and reports missing IDs', async () => {
    expect(await service.findById(record.id)).toEqual(dto);
    expect(prisma.category.findUnique).toHaveBeenCalledWith({
      where: { id: record.id },
    });
    prisma.category.findUnique.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Categoría inexistente',
    });
  });

  it('normalizes description on update and returns the updated category', async () => {
    expect(await service.update(record.id, { descripcion: ' Oro   rosa ' })).toEqual(
      dto,
    );
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: record.id },
      data: { descripcion: 'ORO ROSA' },
    });
  });

  it('updates active status', async () => {
    await service.update(record.id, { activo: false });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: record.id },
      data: { activo: false },
    });
  });

  it('rejects an empty update', async () => {
    await expect(service.update(record.id, {})).rejects.toMatchObject({
      status: 400,
      message: 'Debe enviar al menos un campo',
    });
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('deletes with no response body', async () => {
    await expect(service.delete(record.id)).resolves.toBeUndefined();
    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: record.id },
    });
  });

  it.each(['create', 'update'] as const)(
    'maps duplicate constraint races from %s to 409',
    async (method) => {
      prisma.category[method].mockRejectedValue(failure('P2002'));
      await expect(
        method === 'create'
          ? service.create({ descripcion: 'Anillos' })
          : service.update(record.id, { descripcion: 'Anillos' }),
      ).rejects.toMatchObject({ status: 409, message: 'La categoría ya existe' });
    },
  );

  it.each(['update', 'delete'] as const)(
    'maps missing records from %s to 404',
    async (method) => {
      prisma.category[method].mockRejectedValue(failure('P2025'));
      await expect(
        method === 'update'
          ? service.update('missing', { descripcion: 'Oro' })
          : service.delete('missing'),
      ).rejects.toMatchObject({ status: 404, message: 'Categoría inexistente' });
    },
  );

  it('maps foreign key conflicts to 409', async () => {
    prisma.category.delete.mockRejectedValue(failure('P2003'));
    await expect(service.delete('has-products')).rejects.toMatchObject({
      status: 409,
      message: 'La categoría tiene productos asociados',
    });
  });

  it('preserves unexpected infrastructure failures', async () => {
    const error = new Error('database offline');
    prisma.category.create.mockRejectedValue(error);
    await expect(service.create({ descripcion: 'Anillos' })).rejects.toBe(error);
  });
});
