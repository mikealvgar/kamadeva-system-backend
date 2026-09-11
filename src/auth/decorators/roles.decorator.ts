import { SetMetadata } from '@nestjs/common';
import type { RoleName } from '../../roles/role-names.js';

export const ROLES_KEY = 'roles';
export const Roles = (...names: RoleName[]) => SetMetadata(ROLES_KEY, names);
