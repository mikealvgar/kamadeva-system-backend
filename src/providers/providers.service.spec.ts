import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProvidersService } from './providers.service.js';

const error = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('DB error', {
    code,
    clientVersion: '7.10.0',
  });

describe('ProvidersService', () => {
  const prisma = {
    provider: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new ProvidersService(prisma as unknown as PrismaService);
  const now = new Date('2026-10-30T12:00:00Z');
  const record = {
    id: 'p',
    nombre: 'Textiles',
    telefono: null,
    correo: 'pedidos@textiles.mx',
    nombreContacto: 'Laura',
    direccion: null,
    activo: true,
    fechaCreacion: now,
    fechaActualizacion: now,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.provider.findFirst.mockResolvedValue(null);
    prisma.provider.create.mockResolvedValue(record);
    prisma.provider.update.mockResolvedValue(record);
  });

  it('normalizes input and maps to the Spanish contract', async () => {
    const result = await service.create({
      nombre: ' Textiles ',
      telefono: ' ',
      email: ' PEDIDOS@Textiles.MX ',
      contacto: ' Laura ',
    });
    expect(prisma.provider.create).toHaveBeenCalledWith({
      data: {
        nombre: 'Textiles',
        telefono: null,
        correo: 'pedidos@textiles.mx',
        nombreContacto: 'Laura',
        direccion: null,
        activo: true,
      },
      select: expect.any(Object),
    });
    expect(result).toEqual({
      id: 'p',
      nombre: 'Textiles',
      telefono: null,
      correo: 'pedidos@textiles.mx',
      email: 'pedidos@textiles.mx',
      nombreContacto: 'Laura',
      contacto: 'Laura',
      direccion: null,
      activo: true,
      isActive: true,
      fechaCreacion: now.toISOString(),
      fechaActualizacion: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it('rejects duplicate names via P2002', async () => {
    prisma.provider.create.mockRejectedValue(error('P2002'));
    await expect(service.create({ nombre: 'textiles' })).rejects.toMatchObject({
      status: 409,
      message: 'El nombre de proveedor ya existe',
    });
  });

  it('updates only supplied fields, clears with null', async () => {
    await service.update('p', { nombre: 'TEXTILES', contacto: null });
    expect(prisma.provider.update).toHaveBeenCalledWith({
      where: { id: 'p' },
      data: {
        nombre: 'TEXTILES',
        nombreContacto: null,
      },
      select: expect.any(Object),
    });

    await service.update('p', { isActive: false });
    expect(prisma.provider.update).toHaveBeenLastCalledWith({
      where: { id: 'p' },
      data: {
        activo: false,
      },
      select: expect.any(Object),
    });

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
          activo: true,
          OR: [
            { nombre: contains },
            { correo: contains },
            { telefono: contains },
            { nombreContacto: contains },
          ],
        },
        orderBy: { nombre: 'asc' },
      }),
    );
    await service.findAll({ includeInactive: 'true' });
    expect(prisma.provider.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it.each([
    ['P2025', 404, 'Proveedor inexistente'],
    ['P2003', 409, 'El proveedor tiene compras asociadas'],
  ])('maps delete error %s', async (code, status, message) => {
    prisma.provider.delete.mockRejectedValue(error(code));
    await expect(service.delete('p')).rejects.toMatchObject({
      status,
      message,
    });
  });

  it('maps update races and missing reads', async () => {
    prisma.provider.update.mockRejectedValue(error('P2002'));
    await expect(service.update('p', { nombre: 'X' })).rejects.toMatchObject({
      status: 409,
    });
    prisma.provider.update.mockRejectedValue(error('P2025'));
    await expect(service.update('p', { isActive: true })).rejects.toMatchObject(
      { status: 404 },
    );
    prisma.provider.findUnique.mockResolvedValue(null);
    await expect(service.findById('p')).rejects.toMatchObject({ status: 404 });
  });
});
