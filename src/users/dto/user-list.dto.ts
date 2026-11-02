import { ApiProperty } from '@nestjs/swagger';

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
  datos: UserListItemDto[];

  @ApiProperty()
  pagina: number;

  @ApiProperty()
  limite: number;

  @ApiProperty()
  total: number;
}
