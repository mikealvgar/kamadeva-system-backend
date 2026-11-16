import { ApiProperty } from '@nestjs/swagger';
import { ROLE_NAMES } from '../role-names.js';

export class RoleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ROLE_NAMES })
  nombre!: string;

  @ApiProperty({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty()
  activo!: boolean;
}
