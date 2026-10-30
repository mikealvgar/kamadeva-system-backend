import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEnum,
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
import { PaymentMethod } from '../../generated/prisma/client.js';

const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class SaleItemInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Obligatoria si el producto tiene tallas activas; prohibida si no tiene',
  })
  @ValidateIf(optional)
  @IsUUID()
  sizeId?: string;

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
  @ValidateIf(optional)
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
  @ValidateIf(optional)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  tax?: number;
}

export class SalePaymentInputDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({
    minimum: 0,
    maximum: 9999999999.99,
    multipleOf: 0.01,
    description:
      'Debe coincidir exactamente con el total calculado; sin pagos parciales ni cambio',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  amount: number;
}

export class CreateSaleDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Si se omite se usa el cliente "Público general"',
  })
  @ValidateIf(optional)
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf(optional)
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [SaleItemInputDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items: SaleItemInputDto[];

  @ApiProperty({ type: SalePaymentInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SalePaymentInputDto)
  payment: SalePaymentInputDto;
}
