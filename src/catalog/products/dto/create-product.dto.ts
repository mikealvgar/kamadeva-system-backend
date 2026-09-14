import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;
const nullable = (_object: unknown, value: unknown): boolean =>
  value !== undefined && value !== null;

export class CreateProductDto {
  @ApiProperty({ maxLength: 64, example: 'AN-R-001' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku: string;

  @ApiProperty({ maxLength: 200, example: 'Anillo de plata' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  articulo: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 64 })
  @Transform(trim)
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(64)
  codigoBarras?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @Transform(trim)
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(100)
  marca?: string | null;

  @ApiPropertyOptional({
    type: [String],
    uniqueItems: true,
    example: ['5', '6'],
  })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          typeof item === 'string' ? item.trim() : item,
        )
      : value,
  )
  @ValidateIf(optional)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  tallas?: string[];

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 9999999999.99,
    multipleOf: 0.01,
  })
  @ValidateIf(nullable)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  precioCompra?: number | null;

  @ApiProperty({ minimum: 0.01, maximum: 9999999999.99, multipleOf: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999999999.99)
  precioVenta: number;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  categoryId: string;
}
