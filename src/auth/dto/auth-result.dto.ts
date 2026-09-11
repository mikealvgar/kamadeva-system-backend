import { ApiProperty } from '@nestjs/swagger';
import type { AuthUser } from '../types/auth-user.type.js';
import type { AuthResult, TokenPair } from '../types/auth-result.type.js';
import { ROLE_NAMES } from '../../roles/role-names.js';

export class AuthUserDto implements AuthUser {
  @ApiProperty({ format: 'uuid' })
  id: string;
  @ApiProperty({ example: 'Juan Pérez' })
  name: string;
  @ApiProperty({ example: 'juan@kamadeva.com' })
  email: string;
  @ApiProperty({
    enum: ROLE_NAMES,
    isArray: true,
    example: ['ADMIN'],
    description:
      'Roles activos. Registro: ADMIN para el primer usuario y VENDEDOR para los siguientes.',
  })
  roles: string[];
}

export class TokenPairDto implements TokenPair {
  @ApiProperty()
  accessToken: string;
  @ApiProperty()
  refreshToken: string;
}

export class AuthResultDto extends TokenPairDto implements AuthResult {
  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}
