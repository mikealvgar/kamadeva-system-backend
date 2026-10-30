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
  @ApiProperty({
    maxLength: 64,
    example: '7501234567890',
    description:
      'Identificador único del producto; se guarda sin espacios laterales y en mayúsculas',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  codigoBarras: string;

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

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @Transform(trim)
  @ValidateIf(nullable)
  @IsString()
  @MaxLength(100)
  marca?: string | null;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    uniqueItems: true,
    description:
      'Tallas activas del catálogo. En edición reemplaza la lista completa; [] la vacía',
  })
  @ValidateIf(optional)
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tallaIds?: string[];

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

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: 99999999999.999,
    multipleOf: 0.001,
    description:
      'Stock mínimo; el dashboard lo cuenta como bajo si stock ≤ mínimo. null = sin seguimiento',
  })
  @ValidateIf(nullable)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(99999999999.999)
  stockMinimo?: number | null;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 99999999999.999,
    multipleOf: 0.001,
    description:
      'Existencia objetivo. En alta/edición crea un movimiento de inventario; solo ADMIN puede escribir productos',
  })
  @ValidateIf(optional)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(99999999999.999)
  stock?: number;

  @ApiProperty({ minimum: 0.01, maximum: 9999999999.99, multipleOf: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999999999.99)
  precioVenta: number;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Opcional; null deja el producto sin categoría',
  })
  @ValidateIf(nullable)
  @IsUUID('4')
  categoryId?: string | null;
}
