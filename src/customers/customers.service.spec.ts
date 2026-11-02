import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  CustomersService,
  DEFAULT_CUSTOMER_NAME,
} from './customers.service.js';

describe('CustomersService', () => {
  const customer = {
    id: 'customer',
    nombre: 'Ana Pérez',
    telefono: null,
    correo: null,
    activo: true,
    esPredeterminado: false,
    fechaCreacion: new Date('2026-09-19T10:00:00.000Z'),
    fechaActualizacion: new Date('2026-09-19T10:00:00.000Z'),
  };
  const dto = {
    id: customer.id,
    nombre: customer.nombre,
    name: customer.nombre,
    telefono: customer.telefono,
    phone: customer.telefono,
    correo: customer.correo,
    email: customer.correo,
    activo: customer.activo,
    isActive: customer.activo,
    esPredeterminado: customer.esPredeterminado,
    fechaCreacion: customer.fechaCreacion.toISOString(),
    fechaActualizacion: customer.fechaActualizacion.toISOString(),
    createdAt: customer.fechaCreacion.toISOString(),
    updatedAt: customer.fechaActualizacion.toISOString(),
  };
  const select = {
    id: true,
    nombre: true,
    telefono: true,
    correo: true,
    activo: true,
    esPredeterminado: true,
    fechaCreacion: true,
    fechaActualizacion: true,
  };
  const prisma = {
    customer: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const service = new CustomersService(prisma as unknown as PrismaService);
  const failure = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('Database failure', {
      code,
      clientVersion: '7.10.0',
    });

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.customer.create.mockResolvedValue(customer);
    prisma.customer.findUnique.mockResolvedValue(customer);
    prisma.customer.findMany.mockResolvedValue([customer]);
    prisma.customer.update.mockResolvedValue(customer);
    prisma.$transaction.mockImplementation(
      (operation: (tx: typeof prisma) => Promise<unknown>) => operation(prisma),
    );
  });

  it('creates normalized contact fields and exposes only the public DTO', async () => {
    prisma.customer.create.mockResolvedValue({
      ...customer,
      quotes: [],
      internal: 'hidden',
    });
    expect(
      await service.create({
        nombre: ' Ana Pérez ',
        telefono: ' 555-1234 ',
        correo: ' ANA@MAIL.COM ',
      }),
    ).toEqual(dto);
    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: { nombre: 'Ana Pérez', telefono: '555-1234', correo: 'ana@mail.com' },
      select,
    });
  });

  it.each([undefined, '', '   ', null])(
    'persists empty contact %s as null',
    async (value) => {
      await service.create({ nombre: 'Ana', telefono: value, correo: value });
      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: { nombre: 'Ana', telefono: null, correo: null },
        select,
      });
    },
  );

  it.each([undefined, 'false', 'true'] as const)(
    'lists by name with includeInactive=%s',
    async (includeInactive) => {
      expect(await service.findAll({ includeInactive })).toEqual([dto]);
      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: includeInactive === 'true' ? {} : { activo: true },
        orderBy: { nombre: 'asc' },
        select,
      });
    },
  );

  it('combines active filter with a case insensitive search across all contact fields', async () => {
    await service.findAll({ search: ' Ana ' });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          activo: true,
          OR: ['nombre', 'correo', 'telefono'].map((field) => ({
            [field]: { contains: 'Ana', mode: 'insensitive' },
          })),
        },
      }),
    );
  });

  it('finds public details and reports missing IDs', async () => {
    expect(await service.findById('customer')).toEqual(dto);
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Cliente inexistente',
    });
  });

  it('normalizes updates and omits fields that were not supplied', async () => {
    expect(
      await service.update('customer', {
        correo: ' NEW@MAIL.COM ',
        activo: false,
      }),
    ).toEqual(dto);
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer' },
      data: { correo: 'new@mail.com', activo: false },
      select,
    });
  });

  it.each(['', '  ', null])('clears contacts with %s', async (value) => {
    await service.update('customer', { telefono: value, correo: value });
    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { telefono: null, correo: null } }),
    );
  });

  it('rejects empty updates before database access', async () => {
    await expect(service.update('customer', {})).rejects.toMatchObject({
      status: 400,
    });
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('initializes the default with a serializable transaction', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await service.onModuleInit();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { esPredeterminado: true } }),
    );
    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: {
        nombre: DEFAULT_CUSTOMER_NAME,
        telefono: null,
        correo: null,
        activo: true,
        esPredeterminado: true,
      },
      select,
    });
  });

  it('reuses the persisted default without writing on subsequent startups', async () => {
    prisma.customer.findFirst.mockResolvedValue({
      ...customer,
      nombre: DEFAULT_CUSTOMER_NAME,
      esPredeterminado: true,
    });
    expect(await service.ensureDefaultCustomer()).toEqual({
      ...dto,
      nombre: DEFAULT_CUSTOMER_NAME,
      name: DEFAULT_CUSTOMER_NAME,
      esPredeterminado: true,
    });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('adopts an existing customer by name without changing their data', async () => {
    prisma.customer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...customer,
        nombre: DEFAULT_CUSTOMER_NAME,
        telefono: '123',
        correo: 'old@mail.com',
        activo: false,
      });
    await service.ensureDefaultCustomer();
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer' },
      data: { esPredeterminado: true },
      select,
    });
  });

  it('retries a concurrent default initialization using a new transaction', async () => {
    prisma.$transaction.mockRejectedValueOnce(failure('P2034'));
    prisma.customer.findFirst.mockResolvedValue({
      ...customer,
      nombre: DEFAULT_CUSTOMER_NAME,
      esPredeterminado: true,
    });
    await service.onModuleInit();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('propagates persistent initialization conflicts instead of starting without a default', async () => {
    prisma.$transaction.mockRejectedValue(failure('P2034'));
    await expect(service.onModuleInit()).rejects.toMatchObject({
      status: 409,
      cause: { code: 'P2034' },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });

  it('allows editing the default as any other customer', async () => {
    await service.update('customer', {
      nombre: 'General',
      correo: ' NEW@MAIL.COM ',
      telefono: '123',
      activo: false,
    });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer' },
      data: {
        nombre: 'General',
        correo: 'new@mail.com',
        telefono: '123',
        activo: false,
      },
      select,
    });
  });

  it('preserves edited default values on startup', async () => {
    const edited = {
      ...customer,
      nombre: 'General',
      correo: 'contact@mail.com',
      activo: false,
      esPredeterminado: true,
    };
    prisma.customer.findFirst.mockResolvedValue(edited);
    expect(await service.ensureDefaultCustomer()).toMatchObject({
      nombre: 'General',
      correo: 'contact@mail.com',
      activo: false,
    });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('blocks default deletion', async () => {
    prisma.customer.findUnique.mockResolvedValue({ esPredeterminado: true });
    await expect(service.delete('customer')).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.customer.delete).not.toHaveBeenCalled();
  });

  it('deletes an ordinary customer without a response', async () => {
    prisma.customer.findUnique.mockResolvedValue({ esPredeterminado: false });
    await expect(service.delete('customer')).resolves.toBeUndefined();
    expect(prisma.customer.delete).toHaveBeenCalledWith({
      where: { id: 'customer' },
      select: { id: true },
    });
  });

  it.each(['update', 'delete'] as const)(
    'maps a disappearance during %s to 404',
    async (method) => {
      if (method === 'delete') {
        prisma.customer.findUnique.mockResolvedValue({ esPredeterminado: false });
      }
      prisma.customer[method].mockRejectedValue(failure('P2025'));
      await expect(
        method === 'update'
          ? service.update('customer', { nombre: 'Ana' })
          : service.delete('customer'),
      ).rejects.toMatchObject({ status: 404 });
    },
  );

  it('maps restrictive relation failures to 409', async () => {
    prisma.customer.findUnique.mockResolvedValue({ esPredeterminado: false });
    prisma.customer.delete.mockRejectedValue(failure('P2003'));
    await expect(service.delete('customer')).rejects.toMatchObject({
      status: 409,
      message: 'El cliente tiene cotizaciones o ventas asociadas',
    });
  });

  it('propagates infrastructure failures', async () => {
    const error = new Error('Connection lost');
    prisma.customer.create.mockRejectedValue(error);
    await expect(service.create({ nombre: 'Ana' })).rejects.toBe(error);
  });
});
