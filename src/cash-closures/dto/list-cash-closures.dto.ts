import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, Max, Min, ValidateIf } from 'class-validator';

const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class ListCashClosuresDto {
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

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @ValidateIf(optional)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @ValidateIf(optional)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
