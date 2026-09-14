import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';

export class ListCategoriesDto {
  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  includeInactive?: 'true' | 'false';
}
