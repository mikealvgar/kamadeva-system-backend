import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaymentMethod, SaleStatus } from '../../generated/prisma/client.js';

const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class ListSalesDto {
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
