import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class CreateExpenseDto {
  @ApiProperty({ example: 'Artículos de limpieza', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  concept: string;

  @ApiProperty({
    example: 355.5,
    minimum: 0.01,
    maximum: 9999999999.99,
    multipleOf: 0.01,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999999999.99)
  amount: number;

  @ApiProperty({
    format: 'uuid',
    description: 'Categoría activa del catálogo de gastos',
  })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({
    default: false,
    description: 'true si el dinero sale de la caja física del turno',
  })
  @ValidateIf(optional)
  @IsBoolean()
  deductFromCash?: boolean;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Fecha del gasto; por defecto ahora. No puede ser futura',
  })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  spentAt?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @ValidateIf(optional)
  @IsString()
  @MaxLength(500)
  notes?: string;
}
