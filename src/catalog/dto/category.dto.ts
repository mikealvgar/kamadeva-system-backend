import { ApiProperty } from '@nestjs/swagger';

export class CategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ANILLOS' })
  descripcion!: string;

  @ApiProperty({ example: 'ANILLOS', required: false })
  name?: string;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({ example: true, required: false })
  isActive?: boolean;

  @ApiProperty({ format: 'date-time', required: false })
  fechaCreacion?: string;

  @ApiProperty({ format: 'date-time', required: false })
  fechaActualizacion?: string;
}
