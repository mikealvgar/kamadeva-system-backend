import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

@Roles('ADMIN')
class AdminController {
  @Roles('VENDEDOR')
  seller() {}
  @Roles('ADMIN', 'VENDEDOR')
  either() {}
  admin() {}
}
class PublicController {
  read() {}
}

const context = (
  controller: typeof AdminController | typeof PublicController,
  handler: Function,
  roles: string[],
) =>
  ({
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  it.each([
    ['admin', ['ADMIN'], true],
    ['admin', ['VENDEDOR'], false],
    ['admin', [], false],
    ['seller', ['VENDEDOR'], true],
    ['seller', ['ADMIN'], true],
    ['seller', [], false],
    ['either', ['VENDEDOR'], true],
  ] as const)('%s with %j returns %s', (method, roles, expected) => {
    expect(
      guard.canActivate(
        context(AdminController, AdminController.prototype[method], [...roles]),
      ),
    ).toBe(expected);
  });
  it('allows routes without role metadata', () => {
    expect(
      guard.canActivate(
        context(PublicController, PublicController.prototype.read, []),
      ),
    ).toBe(true);
  });
});
