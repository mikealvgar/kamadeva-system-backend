import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiProperty()
  activo: boolean;

  @ApiProperty({ format: 'date-time' })
  fechaCreacion: string;
}

export class UserListPageDto {
  @ApiProperty({ type: [UserListItemDto] })
  items: UserListItemDto[];

  @ApiProperty({ type: [UserListItemDto], required: false })
  data?: UserListItemDto[];

  @ApiProperty({ type: [UserListItemDto], required: false })
  datos: UserListItemDto[];

  @ApiProperty({ example: 0 })
  page: number;

  @ApiProperty({ example: 0, required: false })
  pagina: number;

  @ApiProperty({ example: 10 })
  size: number;

  @ApiProperty({ example: 10, required: false })
  limite: number;

  @ApiProperty({ example: 1 })
  totalRecords: number;

  @ApiProperty({ example: 1, required: false })
  totalElements?: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;

  @ApiProperty({ example: true })
  isLastPage: boolean;

  @ApiPropertyOptional({ example: true })
  lastPage?: boolean;
}
