import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { InventoryMovementType } from '../../../generated/prisma/client.js';

export const manualMovementTypes = [
  InventoryMovementType.PURCHASE_IN,
  InventoryMovementType.RETURN_IN,
  InventoryMovementType.ADJUSTMENT_IN,
  InventoryMovementType.ADJUSTMENT_OUT,
];

export class CreateInventoryMovementDto {
  @ApiProperty({ enum: manualMovementTypes })
  @IsIn(manualMovementTypes)
  type: InventoryMovementType;

  @ApiProperty({ minimum: 0.001, maximum: 99999999999.999, multipleOf: 0.001 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Max(99999999999.999)
  quantity: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999999999.99, multipleOf: 0.01 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  unitCost?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  notes?: string;
}
