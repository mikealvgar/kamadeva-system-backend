import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class ReturnSaleItemDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'ID del renglón de venta (opcional si se envía productoId)',
  })
  @ValidateIf(optional)
  @IsUUID()
  saleItemId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'ID del producto a devolver',
  })
  @ValidateIf(optional)
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'ID de la talla del producto (si aplica)',
  })
  @ValidateIf(optional)
  @IsUUID()
  sizeId?: string;

  @ApiProperty({
    minimum: 0.001,
    maximum: 99999999999.999,
    example: 1,
    description: 'Cantidad de piezas a devolver',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(99999999999.999)
  quantity: number;

  @ApiPropertyOptional({
    maxLength: 500,
    example: 'Talla incorrecta o defecto',
    description: 'Motivo específico de devolución de este artículo',
  })
  @ValidateIf(optional)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReturnSaleDto {
  @ApiProperty({
    type: [ReturnSaleItemDto],
    description: 'Artículos a devolver',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnSaleItemDto)
  items: ReturnSaleItemDto[];

  @ApiPropertyOptional({
    maxLength: 500,
    example: 'Devolución parcial de mercancía',
    description: 'Motivo general de la devolución',
  })
  @ValidateIf(optional)
  @IsString()
  @MaxLength(500)
  reason?: string;
}
