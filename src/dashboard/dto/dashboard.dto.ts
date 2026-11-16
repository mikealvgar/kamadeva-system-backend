import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, Max, Min, ValidateIf } from 'class-validator';

const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class SalesByMethodDto {
  @ApiProperty({ example: '9800.00' }) CASH: string;
  @ApiProperty({ example: '4450.00' }) CARD: string;
  @ApiProperty({ example: '0.00' }) TRANSFER: string;
  @ApiProperty({ example: '0.00' }) OTHER: string;
}

export class SalesTodayDto {
  @ApiProperty({ example: '14250.00' }) total: string;
  @ApiProperty({ example: 38 }) count: number;
  @ApiProperty({ example: '375.00' }) averageTicket: string;
  @ApiProperty({ type: SalesByMethodDto }) byMethod: SalesByMethodDto;
}

export class InventorySummaryDto {
  @ApiProperty({ example: 342 }) activeProducts: number;
  @ApiProperty({
    example: 6,
    description: 'Activos con stockMinimo y stock ≤ stockMinimo',
  })
  lowStock: number;
}

export class ExpensesTodayDto {
  @ApiProperty({ example: '650.00' }) total: string;
  @ApiProperty({ example: '350.00' }) fromCash: string;
}

export class EstimatedProfitDto {
  @ApiProperty({ example: '12284.48', description: 'Σ total − impuesto' })
  netSales: string;
  @ApiProperty({
    example: '6354.48',
    description: 'Costo al vender; ventas previas usan el costo actual',
  })
  costOfGoods: string;
  @ApiProperty({ example: '650.00' }) expenses: string;
  @ApiProperty({ example: '5280.00' }) profit: string;
  @ApiProperty({
    description: 'true si algún producto vendido no tiene costo (cuenta 0)',
  })
  costIncomplete: boolean;
}

export class DashboardSummaryDto {
  @ApiProperty({ example: '2026-10-30' }) date: string;
  @ApiProperty({ example: 'America/Mexico_City' }) timezone: string;
  @ApiProperty({ type: SalesTodayDto }) salesToday: SalesTodayDto;
  @ApiProperty({ type: InventorySummaryDto }) inventory: InventorySummaryDto;
  @ApiProperty({ type: ExpensesTodayDto }) expensesToday: ExpensesTodayDto;
  @ApiProperty({
    type: EstimatedProfitDto,
    nullable: true,
    description: 'Solo ADMIN; null para VENDEDOR',
  })
  estimatedProfitToday: EstimatedProfitDto | null;
}

export class TopProductsQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusivo; por defecto inicio del mes local',
  })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusivo; por defecto ahora',
  })
  @ValidateIf(optional)
  @IsISO8601({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @ValidateIf(optional)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ enum: ['units', 'revenue'], default: 'units' })
  @ValidateIf(optional)
  @IsIn(['units', 'revenue'])
  sortBy?: 'units' | 'revenue';
}

export class TopProductRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '7501234567890' }) barcode: string;
  @ApiProperty() name: string;
}

export class TopProductDto {
  @ApiProperty({ type: TopProductRefDto }) product: TopProductRefDto;
  @ApiProperty({ example: '12.000' }) units: string;
  @ApiProperty({ example: '3588.00' }) revenue: string;
  @ApiProperty({ example: 9, description: 'Ventas distintas' })
  salesCount: number;
}

export class TopProductsDto {
  @ApiProperty({ format: 'date-time' }) startDate: string;
  @ApiProperty({ format: 'date-time' }) endDate: string;
  @ApiProperty({ enum: ['units', 'revenue'] }) sortBy: 'units' | 'revenue';
  @ApiProperty({ type: [TopProductDto] }) data: TopProductDto[];
}

export class SalesHistoryQueryDto {
  @ApiPropertyOptional({ enum: ['week', 'month'], default: 'week' })
  @ValidateIf(optional)
  @IsIn(['week', 'month'])
  period?: 'week' | 'month';
}

export class SalesHistoryDayDto {
  @ApiProperty({ example: '2026-10-27' }) date: string;
  @ApiProperty({ example: '2100.00' }) salesTotal: string;
  @ApiProperty({ example: 7 }) salesCount: number;
  @ApiProperty({ example: '150.00' }) expensesTotal: string;
}

export class SalesHistoryDto {
  @ApiProperty({ enum: ['week', 'month'] }) period: 'week' | 'month';
  @ApiProperty({ example: 'America/Mexico_City' }) timezone: string;
  @ApiProperty({ type: [SalesHistoryDayDto] }) days: SalesHistoryDayDto[];
}
