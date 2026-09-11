import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('UsersService', () => {
  let service: UsersService;
  const prisma = { user: { findUnique: vi.fn(), create: vi.fn() } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('normalizes email lookup and includes roles', async () => {
    await service.findByEmail(' TEST@EXAMPLE.COM ');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
      include: { roles: { include: { role: true } } },
    });
  });
  it('normalizes user creation without returning only a bare record', async () => {
    await service.create({
      name: ' Test ',
      email: ' TEST@EXAMPLE.COM ',
      passwordHash: 'hash',
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { name: 'Test', email: 'test@example.com', passwordHash: 'hash' },
      include: { roles: { include: { role: true } } },
    });
  });
});
