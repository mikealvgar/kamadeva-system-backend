import { ApiProperty } from '@nestjs/swagger';
import type { AuthUser } from '../types/auth-user.type.js';
import type { AuthResult, TokenPair } from '../types/auth-result.type.js';
import { ROLE_NAMES } from '../../roles/role-names.js';

export class AuthUserDto implements AuthUser {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Juan Pérez' })
  nombre!: string;

  @ApiProperty({ example: 'Juan Pérez', required: false })
  name?: string;

  @ApiProperty({ example: 'juan@kamadeva.com' })
  email!: string;

  @ApiProperty({ example: '8112345678', nullable: true, required: false })
  telefono?: string | null;

  @ApiProperty({ example: true, required: false })
  activo?: boolean;

  @ApiProperty({ example: 'ADMIN' })
  rol!: string;

  @ApiProperty({ format: 'uuid', nullable: true, required: false })
  rolId?: string | null;

  @ApiProperty({
    enum: ROLE_NAMES,
    isArray: true,
    example: ['ADMIN'],
  })
  roles!: string[];

  @ApiProperty({ example: true })
  hasAdmin!: boolean;

  @ApiProperty({
    example: ['VENTAS', 'CATALOGO', 'CLIENTES', 'TABLERO'],
    isArray: true,
  })
  seccionesPermitidas!: string[];
}

export class TokenPairDto implements TokenPair {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;
}

export class AuthResultDto extends TokenPairDto implements AuthResult {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ type: AuthUserDto, required: false })
  usuario?: AuthUserDto;
}
