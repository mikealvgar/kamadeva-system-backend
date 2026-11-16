import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaymentMethod, SaleStatus } from '../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class ListSalesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Inclusivo' })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Inclusivo' })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ enum: SaleStatus })
  @ValidateIf(optional)
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Vendedor' })
  @ValidateIf(optional)
  @IsUUID()
  createdById?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(optional)
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @ValidateIf(optional)
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    example: 'V-000123',
    description: 'Coincidencia exacta',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @ValidateIf(optional)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  folio?: string;

  @ApiPropertyOptional({ description: 'Alias para size', minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
