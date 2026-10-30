import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isValidSizeSelection } from './size-selection.js';
import { SizesService } from './sizes.service.js';

describe('SizesService', () => {
  const prisma = {
    size: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const service = new SizesService(prisma as unknown as PrismaService);
  const size = { id: 'size', name: 'M', sortOrder: 20, isActive: true };
  const error = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('DB error', {
      code,
      clientVersion: '7.10.0',
    });

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.size.create.mockResolvedValue(size);
    prisma.size.update.mockResolvedValue(size);
  });

  it('normalizes name to trimmed upper case and defaults sort order', async () => {
    await expect(service.create({ name: ' m ' })).resolves.toEqual(size);
    expect(prisma.size.create).toHaveBeenCalledWith({
      data: { name: 'M', sortOrder: 0 },
      select: { id: true, name: true, sortOrder: true, isActive: true },
    });
  });

  it('lists active sizes by default ordered by sortOrder then name', async () => {
    prisma.size.findMany.mockResolvedValue([size]);
    await service.findAll();
    expect(prisma.size.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    );
    await service.findAll(true);
    expect(prisma.size.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('returns 404 for a missing size', async () => {
    prisma.size.findUnique.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Talla inexistente',
    });
  });

  it('updates only supplied fields and rejects an empty update', async () => {
    await service.update('size', { name: 'xl ', isActive: false });
    expect(prisma.size.update.mock.calls[0]![0].data).toEqual({
      name: 'XL',
      isActive: false,
    });
    await expect(service.update('size', {})).rejects.toMatchObject({
      status: 400,
    });
  });

  it.each([
    ['P2002', 409, 'La talla ya existe'],
    ['P2025', 404, 'Talla inexistente'],
  ])('maps write error %s', async (code, status, message) => {
    prisma.size.create.mockRejectedValue(error(code));
    prisma.size.update.mockRejectedValue(error(code));
    await expect(service.create({ name: 'M' })).rejects.toMatchObject({
      status,
      message,
    });
    await expect(service.update('size', { name: 'M' })).rejects.toMatchObject({
      status,
      message,
    });
  });

  it.each([
    ['P2003', 409, 'La talla tiene registros asociados'],
    ['P2025', 404, 'Talla inexistente'],
  ])('maps delete error %s', async (code, status, message) => {
    prisma.size.delete.mockRejectedValue(error(code));
    await expect(service.delete('size')).rejects.toMatchObject({
      status,
      message,
    });
  });

  it('propagates unrelated errors', async () => {
    prisma.size.delete.mockRejectedValue(new Error('boom'));
    await expect(service.delete('size')).rejects.toThrow('boom');
  });
});

describe('isValidSizeSelection', () => {
  const sizes = new Set(['m', 'g']);
  it.each([
    [undefined, undefined, true],
    [null, new Set<string>(), true],
    ['m', undefined, false],
    [undefined, sizes, false],
    ['xl', sizes, false],
    ['m', sizes, true],
  ])('sizeId %s with %o → %s', (sizeId, active, expected) => {
    expect(isValidSizeSelection(sizeId, active)).toBe(expected);
  });
});
