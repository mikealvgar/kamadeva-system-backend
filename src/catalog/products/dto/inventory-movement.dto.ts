import { ApiProperty } from '@nestjs/swagger';
import { InventoryMovementType } from '../../../generated/prisma/client.js';

export class InventoryMovementDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: InventoryMovementType }) type: InventoryMovementType;
  @ApiProperty({ example: '-3.000' }) quantityChange: string;
  @ApiProperty({ type: String, nullable: true, example: '780.25' }) unitCost:
    string | null;
  @ApiProperty({ type: String, nullable: true }) referenceType: string | null;
  @ApiProperty({ type: String, nullable: true }) referenceId: string | null;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
