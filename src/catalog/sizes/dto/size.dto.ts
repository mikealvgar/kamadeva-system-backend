import { ApiProperty } from '@nestjs/swagger';

export class SizeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'M' })
  nombre!: string;

  @ApiProperty({ example: 'M', required: false })
  name?: string;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({ example: true, required: false })
  isActive?: boolean;
}

export class SizeRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'M' })
  nombre!: string;

  @ApiProperty({ example: 'M', required: false })
  name?: string;
}
