import { ApiProperty } from '@nestjs/swagger';
import { TemporaryPermissionDto } from './temporary-permission.dto.js';

export class UserListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  nombre: string;

  @ApiProperty({ format: 'email' })
  correo: string;

  @ApiProperty({ required: false, nullable: true })
  telefono?: string | null;

  @ApiProperty({ type: [String] })
  roles: string[];

  @ApiProperty({ type: [String] })
  seccionesPermitidas: string[];

  @ApiProperty({ type: [TemporaryPermissionDto] })
  permisosTemporales: TemporaryPermissionDto[];

  @ApiProperty()
  activo: boolean;

  @ApiProperty({ format: 'date-time' })
  fechaCreacion: string;
}

export class UserListPageDto {
  @ApiProperty({ type: [UserListItemDto] })
  data: UserListItemDto[];

  @ApiProperty({ example: 1 })
  current_page: number;

  @ApiProperty({ example: 1 })
  total_items: number;

  @ApiProperty({ example: 1 })
  total_pages: number;

  @ApiProperty({ example: false })
  has_next_page: boolean;

  @ApiProperty({ example: false })
  has_prev_page: boolean;
}
