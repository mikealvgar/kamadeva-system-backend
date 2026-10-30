import { ApiProperty } from '@nestjs/swagger';

export class SizeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'M' })
  name: string;

  @ApiProperty({ example: 20 })
  sortOrder: number;

  @ApiProperty({ example: true })
  isActive: boolean;
}

export class SizeRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'M' })
  name: string;
}
