import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class ListCashClosuresDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Sobre closedAt, inclusivo',
  })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Sobre closedAt, inclusivo',
  })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Alias para size', minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
