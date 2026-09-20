import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  CustomersService,
  DEFAULT_CUSTOMER_NAME,
} from './customers.service.js';

describe('CustomersService', () => {
  const customer = {
    id: 'customer',
    name: 'Ana Pérez',
    phone: null,
    email: null,
    isActive: true,
    createdAt: new Date('2026-09-19T10:00:00.000Z'),
    updatedAt: new Date('2026-09-19T10:00:00.000Z'),
  };
  const dto = {
    ...customer,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
  const select = {
    id: true,
    name: true,
    phone: true,
    email: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
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
        name: ' Ana Pérez ',
        phone: ' 555-1234 ',
        email: ' ANA@MAIL.COM ',
      }),
    ).toEqual(dto);
    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: { name: 'Ana Pérez', phone: '555-1234', email: 'ana@mail.com' },
      select,
    });
  });
  it.each([undefined, '', '   ', null])(
    'persists empty contact %s as null',
    async (value) => {
      await service.create({ name: 'Ana', phone: value, email: value });
      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: { name: 'Ana', phone: null, email: null },
        select,
      });
    },
  );
  it.each([undefined, 'false', 'true'] as const)(
    'lists by name with includeInactive=%s',
    async (includeInactive) => {
      expect(await service.findAll({ includeInactive })).toEqual([dto]);
      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: includeInactive === 'true' ? {} : { isActive: true },
        orderBy: { name: 'asc' },
        select,
      });
    },
  );
  it('combines active filter with a case insensitive search across all contact fields', async () => {
    await service.findAll({ search: ' Ana ' });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          OR: ['name', 'email', 'phone'].map((field) => ({
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
        email: ' NEW@MAIL.COM ',
        isActive: false,
      }),
    ).toEqual(dto);
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer' },
      data: { email: 'new@mail.com', isActive: false },
      select,
    });
  });
  it.each(['', '  ', null])('clears contacts with %s', async (value) => {
    await service.update('customer', { phone: value, email: value });
    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phone: null, email: null } }),
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
      expect.objectContaining({ where: { name: DEFAULT_CUSTOMER_NAME } }),
    );
    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: {
        name: DEFAULT_CUSTOMER_NAME,
        phone: null,
        email: null,
        isActive: true,
        isDefault: true,
      },
      select,
    });
  });
  it('reuses the persisted default without writing on subsequent startups', async () => {
    prisma.customer.findFirst.mockResolvedValue({
      ...customer,
      name: DEFAULT_CUSTOMER_NAME,
    });
    expect(await service.ensureDefaultCustomer()).toEqual({
      ...dto,
      name: DEFAULT_CUSTOMER_NAME,
    });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });
  it('adopts an existing customer by name without changing their data', async () => {
    prisma.customer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...customer,
        name: DEFAULT_CUSTOMER_NAME,
        phone: '123',
        email: 'old@mail.com',
        isActive: false,
      });
    await service.ensureDefaultCustomer();
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer' },
      data: { isDefault: true },
      select,
    });
  });
  it('retries a concurrent default initialization using a new transaction', async () => {
    prisma.$transaction.mockRejectedValueOnce(failure('P2034'));
    prisma.customer.findFirst.mockResolvedValue({
      ...customer,
      name: DEFAULT_CUSTOMER_NAME,
    });
    await service.onModuleInit();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });
  it('propagates persistent initialization conflicts instead of starting without a default', async () => {
    prisma.$transaction.mockRejectedValue(failure('P2034'));
    await expect(service.onModuleInit()).rejects.toMatchObject({
      code: 'P2034',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });
  it('allows editing the default as any other customer', async () => {
    await service.update('customer', {
      name: 'General',
      email: ' NEW@MAIL.COM ',
      phone: '123',
      isActive: false,
    });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer' },
      data: {
        name: 'General',
        email: 'new@mail.com',
        phone: '123',
        isActive: false,
      },
      select,
    });
  });
  it('preserves edited default values on startup', async () => {
    const edited = {
      ...customer,
      name: 'General',
      email: 'contact@mail.com',
      isActive: false,
    };
    prisma.customer.findFirst.mockResolvedValue(edited);
    expect(await service.ensureDefaultCustomer()).toMatchObject({
      name: 'General',
      email: 'contact@mail.com',
      isActive: false,
    });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });
  it('blocks default deletion', async () => {
    prisma.customer.findUnique.mockResolvedValue({ isDefault: true });
    await expect(service.delete('customer')).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.customer.delete).not.toHaveBeenCalled();
  });
  it('deletes an ordinary customer without a response', async () => {
    await expect(service.delete('customer')).resolves.toBeUndefined();
    expect(prisma.customer.delete).toHaveBeenCalledWith({
      where: { id: 'customer' },
      select: { id: true },
    });
  });
  it.each(['update', 'delete'] as const)(
    'maps a disappearance during %s to 404',
    async (method) => {
      prisma.customer[method].mockRejectedValue(failure('P2025'));
      await expect(
        method === 'update'
          ? service.update('customer', { name: 'Ana' })
          : service.delete('customer'),
      ).rejects.toMatchObject({ status: 404 });
    },
  );
  it('maps restrictive relation failures to 409', async () => {
    prisma.customer.delete.mockRejectedValue(failure('P2003'));
    await expect(service.delete('customer')).rejects.toMatchObject({
      status: 409,
      message: 'El cliente tiene cotizaciones o ventas asociadas',
    });
  });
  it('propagates infrastructure failures', async () => {
    const error = new Error('Connection lost');
    prisma.customer.create.mockRejectedValue(error);
    await expect(service.create({ name: 'Ana' })).rejects.toBe(error);
  });
});
