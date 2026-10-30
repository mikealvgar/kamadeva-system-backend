import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CashAdjustmentType } from '../../generated/prisma/client.js';
import { DENOMINATIONS } from '../cash-closure.calculator.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class CashAdjustmentInputDto {
  @ApiProperty({
    enum: CashAdjustmentType,
    description:
      'INCOME: dinero que entró sin registrarse. WITHDRAWAL: dinero usado para otra cosa (no registrado como gasto)',
  })
  @IsEnum(CashAdjustmentType)
  type: CashAdjustmentType;

  @ApiProperty({ minimum: 0.01, maximum: 9999999999.99, multipleOf: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9999999999.99)
  amount: number;

  @ApiProperty({ example: 'Pago a mensajero', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description: string;
}

export class CreateCashClosureDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'previousClosureId del resumen consultado; null en el primer corte. Si ya no es el último corte responde 409',
  })
  // null is valid (first closure); undefined fails IsUUID.
  @ValidateIf((_object: unknown, value: unknown) => value !== null)
  @IsUUID()
  previousClosureId: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer', minimum: 0 },
    example: { '500': 4, '200': 5, '100': 10, '0.5': 10 },
    description: `Piezas por denominación (${DENOMINATIONS.join(', ')}); las omitidas cuentan 0`,
  })
  @IsObject()
  denominations: Record<string, unknown>;

  @ApiPropertyOptional({ type: [CashAdjustmentInputDto], maxItems: 50 })
  @ValidateIf(optional)
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CashAdjustmentInputDto)
  adjustments?: CashAdjustmentInputDto[];

  @ApiProperty({
    minimum: 0,
    maximum: 9999999999.99,
    multipleOf: 0.01,
    description:
      'Fondo que se deja en caja; será el fondo inicial del siguiente corte. No puede superar lo contado',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  floatLeft: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trim)
  @ValidateIf(optional)
  @IsString()
  @MaxLength(500)
  notes?: string;
}
