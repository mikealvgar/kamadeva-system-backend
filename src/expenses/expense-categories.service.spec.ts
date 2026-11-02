import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExpenseCategoriesService } from './expense-categories.service.js';

const error = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('DB error', {
    code,
    clientVersion: '7.10.0',
  });

describe('ExpenseCategoriesService', () => {
  const tx = {
    expenseCategory: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(),
    expenseCategory: {
      ...tx.expenseCategory,
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new ExpenseCategoriesService(
    prisma as unknown as PrismaService,
  );
  const categoryRecord = {
    id: 'cat-1',
    nombre: 'Servicios',
    activo: true,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (operation: (client: typeof tx) => unknown) => operation(tx),
    );
    tx.expenseCategory.findFirst.mockResolvedValue(null);
    tx.expenseCategory.create.mockResolvedValue(categoryRecord);
    tx.expenseCategory.update.mockResolvedValue(categoryRecord);
    tx.expenseCategory.findUnique.mockResolvedValue(categoryRecord);
  });

  describe('create', () => {
    it('creates category with trimmed name', async () => {
      const result = await service.create({ nombre: ' Servicios ' });
      expect(tx.expenseCategory.findFirst).toHaveBeenCalledWith({
        where: { nombre: { equals: 'Servicios', mode: 'insensitive' } },
        select: { id: true },
      });
      expect(tx.expenseCategory.create).toHaveBeenCalledWith({
        data: { nombre: 'Servicios' },
        select: expect.any(Object),
      });
      expect(result).toEqual({
        id: 'cat-1',
        nombre: 'Servicios',
        name: 'Servicios',
        activo: true,
        isActive: true,
      });
    });

    it('rejects empty or blank name', async () => {
      await expect(service.create({ nombre: '   ' })).rejects.toMatchObject({
        status: 400,
        message: 'El nombre de la categoría es obligatorio',
      });
    });

    it('rejects duplicate name', async () => {
      tx.expenseCategory.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.create({ nombre: 'Servicios' })).rejects.toMatchObject({
        status: 409,
        message: 'La categoría ya existe',
      });
    });

    it('maps P2002 to 409', async () => {
      tx.expenseCategory.create.mockRejectedValue(error('P2002'));
      await expect(service.create({ nombre: 'Servicios' })).rejects.toMatchObject({
        status: 409,
        message: 'La categoría ya existe',
      });
    });
  });

  describe('findAll', () => {
    it('filters active categories by default', async () => {
      prisma.expenseCategory.findMany.mockResolvedValue([categoryRecord]);
      const result = await service.findAll();
      expect(prisma.expenseCategory.findMany).toHaveBeenCalledWith({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
        select: expect.any(Object),
      });
      expect(result).toHaveLength(1);
    });

    it('includes inactive when requested', async () => {
      prisma.expenseCategory.findMany.mockResolvedValue([categoryRecord]);
      await service.findAll(true);
      expect(prisma.expenseCategory.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { nombre: 'asc' },
        select: expect.any(Object),
      });
    });
  });

  describe('findById', () => {
    it('returns category when found', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(categoryRecord);
      const result = await service.findById('cat-1');
      expect(result.id).toBe('cat-1');
    });

    it('throws 404 when category not found', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(null);
      await expect(service.findById('unknown')).rejects.toMatchObject({
        status: 404,
        message: 'Categoría inexistente',
      });
    });
  });

  describe('update', () => {
    it('updates name and checks uniqueness if changed', async () => {
      tx.expenseCategory.findUnique.mockResolvedValue(categoryRecord);
      const result = await service.update('cat-1', { nombre: 'Nuevos Servicios' });
      expect(tx.expenseCategory.findFirst).toHaveBeenCalledWith({
        where: { nombre: { equals: 'Nuevos Servicios', mode: 'insensitive' } },
        select: { id: true },
      });
      expect(tx.expenseCategory.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { nombre: 'Nuevos Servicios' },
        select: expect.any(Object),
      });
      expect(result.id).toBe('cat-1');
    });

    it('does not check uniqueness if name casing is same', async () => {
      tx.expenseCategory.findUnique.mockResolvedValue(categoryRecord);
      await service.update('cat-1', { nombre: 'SERVICIOS' });
      expect(tx.expenseCategory.findFirst).not.toHaveBeenCalled();
    });

    it('throws 400 when no fields are provided', async () => {
      await expect(service.update('cat-1', {})).rejects.toMatchObject({
        status: 400,
        message: 'Debe enviar al menos un campo',
      });
    });

    it('throws 404 when category does not exist', async () => {
      tx.expenseCategory.findUnique.mockResolvedValue(null);
      await expect(service.update('cat-1', { activo: false })).rejects.toMatchObject({
        status: 404,
        message: 'Categoría inexistente',
      });
    });
  });

  describe('delete', () => {
    it('deletes category', async () => {
      prisma.expenseCategory.delete.mockResolvedValue({ id: 'cat-1' });
      await expect(service.delete('cat-1')).resolves.toBeUndefined();
      expect(prisma.expenseCategory.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        select: { id: true },
      });
    });

    it('maps P2025 to 404', async () => {
      prisma.expenseCategory.delete.mockRejectedValue(error('P2025'));
      await expect(service.delete('missing')).rejects.toMatchObject({
        status: 404,
        message: 'Categoría inexistente',
      });
    });

    it('maps P2003 to 409', async () => {
      prisma.expenseCategory.delete.mockRejectedValue(error('P2003'));
      await expect(service.delete('cat-1')).rejects.toMatchObject({
        status: 409,
        message: 'La categoría tiene egresos asociados',
      });
    });
  });
});
