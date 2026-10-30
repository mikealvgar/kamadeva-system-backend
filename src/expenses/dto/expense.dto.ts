import { ApiProperty } from '@nestjs/swagger';

export class ExpenseRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class ExpenseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Artículos de limpieza' }) concept: string;
  @ApiProperty({ example: '355.50' }) amount: string;
  @ApiProperty() deductFromCash: boolean;
  @ApiProperty({ format: 'date-time' }) spentAt: string;
  @ApiProperty({ type: ExpenseRefDto }) category: ExpenseRefDto;
  @ApiProperty({ type: ExpenseRefDto }) createdBy: ExpenseRefDto;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Corte de caja que lo contó; null mientras está pendiente',
  })
  cashClosureId: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

export class ExpensePageDto {
  @ApiProperty({ type: [ExpenseDto] }) data: ExpenseDto[];
  @ApiProperty({ example: 1 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) pageSize: number;
  @ApiProperty({
    example: '355.50',
    description: 'Suma de todos los gastos del filtro, no solo de la página',
  })
  totalAmount: string;
}
