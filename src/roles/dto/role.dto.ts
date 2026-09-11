import { ApiProperty } from '@nestjs/swagger';
import { ROLE_NAMES } from '../role-names.js';

export class RoleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ROLE_NAMES })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;
}
