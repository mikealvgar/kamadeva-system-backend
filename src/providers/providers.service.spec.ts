import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProvidersService } from './providers.service.js';

const error = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('DB error', {
    code,
    clientVersion: '7.10.0',
  });

describe('ProvidersService', () => {
  const tx = {
    provider: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  const prisma = {
    provider: {
      ...tx.provider,
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const service = new ProvidersService(prisma as unknown as PrismaService);
  const now = new Date('2026-10-30T12:00:00Z');
  const record = {
    id: 'p',
    name: 'Textiles',
    phone: null,
    email: 'pedidos@textiles.mx',
    contactName: 'Laura',
    address: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    tx.provider.findFirst.mockResolvedValue(null);
    tx.provider.create.mockResolvedValue(record);
    tx.provider.update.mockResolvedValue(record);
  });

  it('normalizes input and maps to the Spanish contract', async () => {
    const result = await service.create({
      nombre: ' Textiles ',
      telefono: ' ',
      email: ' PEDIDOS@Textiles.MX ',
      contacto: ' Laura ',
    });
    expect(tx.provider.create.mock.calls[0]![0].data).toEqual({
      name: 'Textiles',
      phone: null,
      email: 'pedidos@textiles.mx',
      contactName: 'Laura',
      address: null,
    });
    expect(result).toEqual({
      id: 'p',
      nombre: 'Textiles',
      telefono: null,
      email: 'pedidos@textiles.mx',
      contacto: 'Laura',
      direccion: null,
      isActive: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('rejects case-insensitive duplicate names', async () => {
    tx.provider.findFirst.mockResolvedValue({ id: 'other' });
    await expect(service.create({ nombre: 'textiles' })).rejects.toMatchObject({
      status: 409,
      message: 'Ya existe un proveedor con ese nombre',
    });
    expect(tx.provider.findFirst).toHaveBeenCalledWith({
      where: { name: { equals: 'textiles', mode: 'insensitive' } },
      select: { id: true },
    });
    expect(tx.provider.create).not.toHaveBeenCalled();
  });

  it('updates only supplied fields, clears with null and excludes itself from the name check', async () => {
    await service.update('p', { nombre: 'TEXTILES', contacto: null });
    expect(tx.provider.findFirst).toHaveBeenCalledWith({
      where: {
        name: { equals: 'TEXTILES', mode: 'insensitive' },
        NOT: { id: 'p' },
      },
      select: { id: true },
    });
    expect(tx.provider.update.mock.calls[0]![0].data).toEqual({
      name: 'TEXTILES',
      contactName: null,
    });
    tx.provider.findFirst.mockClear();
    await service.update('p', { isActive: false });
    expect(tx.provider.findFirst).not.toHaveBeenCalled();
    await expect(service.update('p', {})).rejects.toMatchObject({
      status: 400,
    });
  });

  it('searches active providers across name, contact, email and phone', async () => {
    prisma.provider.findMany.mockResolvedValue([record]);
    await service.findAll({ search: ' lau ' });
    const contains = { contains: 'lau', mode: 'insensitive' };
    expect(prisma.provider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          OR: [
            { name: contains },
            { contactName: contains },
            { email: contains },
            { phone: contains },
          ],
        },
        orderBy: { name: 'asc' },
      }),
    );
    await service.findAll({ includeInactive: 'true' });
    expect(prisma.provider.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it.each([
    ['P2025', 404, 'Proveedor inexistente'],
    ['P2003', 409, 'El proveedor tiene registros asociados'],
  ])('maps delete error %s', async (code, status, message) => {
    prisma.provider.delete.mockRejectedValue(error(code));
    await expect(service.delete('p')).rejects.toMatchObject({
      status,
      message,
    });
  });

  it('maps update races and missing reads', async () => {
    tx.provider.update.mockRejectedValue(error('P2002'));
    await expect(service.update('p', { nombre: 'X' })).rejects.toMatchObject({
      status: 409,
    });
    tx.provider.update.mockRejectedValue(error('P2025'));
    await expect(service.update('p', { isActive: true })).rejects.toMatchObject(
      { status: 404 },
    );
    prisma.provider.findUnique.mockResolvedValue(null);
    await expect(service.findById('p')).rejects.toMatchObject({ status: 404 });
  });
});
