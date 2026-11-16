import { ApiProperty } from '@nestjs/swagger';

export class ExpenseCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Servicios' })
  nombre!: string;

  @ApiProperty({ example: 'Servicios', required: false })
  name?: string;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({ example: true, required: false })
  isActive?: boolean;
}
