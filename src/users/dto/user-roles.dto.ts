import { ApiProperty } from '@nestjs/swagger';
import { ROLE_NAMES } from '../../roles/role-names.js';

export class UserRolesDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: ROLE_NAMES, isArray: true })
  roles!: string[];
}
