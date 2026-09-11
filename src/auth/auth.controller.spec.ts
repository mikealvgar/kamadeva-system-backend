import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { logout: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('returns no response body for logout', async () => {
    await expect(
      controller.logout({ refreshToken: 'token' }),
    ).resolves.toBeUndefined();
  });
});
