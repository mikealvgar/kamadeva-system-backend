import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class ListExpensesDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Sobre spentAt, inclusivo',
  })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Sobre spentAt, inclusivo',
  })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(optional)
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Quién lo registró' })
  @ValidateIf(optional)
  @IsUUID()
  createdById?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @ValidateIf(optional)
  @IsIn(['true', 'false'])
  deductFromCash?: 'true' | 'false';

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'true: aún sin corte de caja; false: ya incluidos en un corte',
  })
  @ValidateIf(optional)
  @IsIn(['true', 'false'])
  pendingClosure?: 'true' | 'false';

  @ApiPropertyOptional({ format: 'uuid', description: 'Gastos de un corte' })
  @ValidateIf(optional)
  @IsUUID()
  cashClosureId?: string;

  @ApiPropertyOptional({ description: 'Alias para size', minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
