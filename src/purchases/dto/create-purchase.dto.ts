import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
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
const nullable = (_object: unknown, value: unknown): boolean =>
  value !== undefined && value !== null;

export class CreatePurchaseProductDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productoId: string;

  @ApiProperty({ minimum: 0.001, maximum: 99999999999.999, multipleOf: 0.001 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(99999999999.999)
  cantidad: number;
}

export class CreatePurchaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  proveedorId: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  fechaRecepcion?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(100)
  folioProveedor?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(500)
  notas?: string | null;

  @ApiProperty({ type: [CreatePurchaseProductDto], minItems: 1 })
  @ValidateIf(optional)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((item: CreatePurchaseProductDto) => item.productoId)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseProductDto)
  productos: CreatePurchaseProductDto[];
}
