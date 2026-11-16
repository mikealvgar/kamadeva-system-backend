import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListCategoriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  includeInactive?: 'true' | 'false';
}
