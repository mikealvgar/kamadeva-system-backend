import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RoleName } from '../../roles/role-names.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { roles: string[] } }>();
    return roles.some(
      (role) =>
        user?.roles?.includes(role) ||
        (role === 'VENDEDOR' && user?.roles?.includes('ADMIN')),
    );
  }
}
