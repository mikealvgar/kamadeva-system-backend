import { ApiProperty } from '@nestjs/swagger';

export class ExpenseCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Servicios' })
  name: string;

  @ApiProperty({ example: true })
  isActive: boolean;
}
