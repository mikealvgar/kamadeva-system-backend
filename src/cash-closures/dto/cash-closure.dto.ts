import { ApiProperty } from '@nestjs/swagger';
import { CashAdjustmentType } from '../../generated/prisma/client.js';

export class CashSalesDto {
  @ApiProperty({ example: 12 }) count: number;
  @ApiProperty({ example: '3000.00' }) cash: string;
  @ApiProperty({ example: '1500.00' }) card: string;
  @ApiProperty({ example: '0.00' }) transfer: string;
  @ApiProperty({ example: '0.00' }) other: string;
  @ApiProperty({ example: '4500.00' }) total: string;
}

export class CashRefundsDto {
  @ApiProperty({ example: '100.00' }) cash: string;
  @ApiProperty({ example: '100.00' }) total: string;
}

export class CashExpensesDto {
  @ApiProperty({ example: 2 }) count: number;
  @ApiProperty({ example: '355.00', description: 'Solo deductFromCash' })
  cash: string;
  @ApiProperty({ example: '455.00' }) total: string;
}

export class CashClosureSummaryDto {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  previousClosureId: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  periodStart: string | null;
  @ApiProperty({ format: 'date-time' }) generatedAt: string;
  @ApiProperty({ example: '500.00' }) openingFloat: string;
  @ApiProperty({ type: CashSalesDto }) sales: CashSalesDto;
  @ApiProperty({ type: CashRefundsDto }) refunds: CashRefundsDto;
  @ApiProperty({ type: CashExpensesDto }) expenses: CashExpensesDto;
  @ApiProperty({
    example: '3045.00',
    description: 'Esperado en caja antes de entradas/salidas del vendedor',
  })
  expectedCash: string;
}

export class CashAdjustmentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: CashAdjustmentType }) type: CashAdjustmentType;
  @ApiProperty({ example: '50.00' }) amount: string;
  @ApiProperty() description: string;
}

export class CashClosureRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class CashClosureDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  previousClosureId: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  periodStart: string | null;
  @ApiProperty({ format: 'date-time' }) closedAt: string;
  @ApiProperty({ type: CashClosureRefDto }) closedBy: CashClosureRefDto;
  @ApiProperty({ example: '500.00' }) openingFloat: string;
  @ApiProperty({ type: CashSalesDto }) sales: CashSalesDto;
  @ApiProperty({ type: CashRefundsDto }) refunds: CashRefundsDto;
  @ApiProperty({ type: CashExpensesDto }) expenses: CashExpensesDto;
  @ApiProperty({ type: [CashAdjustmentDto] }) adjustments: CashAdjustmentDto[];
  @ApiProperty({ example: '50.00' }) adjustmentsIn: string;
  @ApiProperty({ example: '200.00' }) adjustmentsOut: string;
  @ApiProperty({ example: '2895.00' }) expectedCash: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description: 'Piezas por denominación, todas las claves',
  })
  denominations: Record<string, number>;
  @ApiProperty({ example: '2900.00' }) countedCash: string;
  @ApiProperty({
    example: '5.00',
    description: 'contado − esperado; positivo sobrante, negativo faltante',
  })
  difference: string;
  @ApiProperty({ example: '500.00' }) floatLeft: string;
  @ApiProperty({ example: '2400.00', description: 'contado − fondo dejado' })
  cashWithdrawn: string;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
}

export class CashClosurePageDto {
  @ApiProperty({ type: [CashClosureDto] }) data: CashClosureDto[];
  @ApiProperty({ example: 1 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) pageSize: number;
}
