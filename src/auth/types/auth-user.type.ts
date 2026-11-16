import type { TemporaryPermissionItem } from '../../users/dto/temporary-permission.dto.js';

export type AuthUser = {
  id: string;
  nombre: string;
  name?: string;
  email: string;
  telefono?: string | null;
  activo?: boolean;
  rol: string;
  rolId?: string | null;
  roles: string[];
  hasAdmin: boolean;
  seccionesPermitidas: string[];
  permisosTemporales: TemporaryPermissionItem[];
};
