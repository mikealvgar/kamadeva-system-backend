import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Juan Pérez' })
  nombre!: string;

  @ApiProperty({ example: 'juan@kamadeva.com', format: 'email' })
  correo!: string;

  @ApiPropertyOptional({ example: 'juan@kamadeva.com', format: 'email' })
  email?: string;

  @ApiPropertyOptional({ example: '8112345678', nullable: true })
  telefono?: string | null;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiPropertyOptional({ example: 'ADMIN', nullable: true })
  rol?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  rolId?: string | null;

  @ApiProperty({ example: ['ADMIN'], type: [String] })
  roles!: string[];

  @ApiProperty({ format: 'date-time' })
  fechaCreacion!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  fechaActualizacion?: string;
}
