import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class QuoteItemInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ minimum: 0.001, maximum: 99999999999.999, multipleOf: 0.001 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(99999999999.999)
  quantity: number;

  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    maximum: 9999999999.99,
    multipleOf: 0.01,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  discount?: number;

  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    maximum: 9999999999.99,
    multipleOf: 0.01,
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  tax?: number;
}

export class CreateQuoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Fecha estrictamente futura',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsISO8601({ strict: true })
  expiresAt?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [QuoteItemInputDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteItemInputDto)
  items: QuoteItemInputDto[];
}

export class UpdateQuoteDto extends PartialType(CreateQuoteDto, {
  skipNullProperties: false,
}) {}
