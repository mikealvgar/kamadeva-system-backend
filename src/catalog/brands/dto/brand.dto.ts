import { ApiProperty } from '@nestjs/swagger';

export class BrandDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'NIKE' })
  descripcion!: string;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({ format: 'date-time', required: false })
  fechaCreacion?: string;

  @ApiProperty({ format: 'date-time', required: false })
  fechaActualizacion?: string;
}
