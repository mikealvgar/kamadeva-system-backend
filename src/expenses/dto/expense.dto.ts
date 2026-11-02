import { ApiProperty } from '@nestjs/swagger';

export class ExpenseRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ required: false }) name?: string;
}

export class ExpenseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Artículos de limpieza' }) concepto!: string;
  @ApiProperty({ example: 'Artículos de limpieza', required: false }) concept?: string;
  @ApiProperty({ example: '355.50' }) monto!: string;
  @ApiProperty({ example: '355.50', required: false }) amount?: string;
  @ApiProperty() descontarDeCaja!: boolean;
  @ApiProperty({ required: false }) deductFromCash?: boolean;
  @ApiProperty({ format: 'date-time' }) fechaGasto!: string;
  @ApiProperty({ format: 'date-time', required: false }) spentAt?: string;
  @ApiProperty({ type: ExpenseRefDto }) categoria!: ExpenseRefDto;
  @ApiProperty({ type: ExpenseRefDto, required: false }) category?: ExpenseRefDto;
  @ApiProperty({ type: ExpenseRefDto }) creadoPor!: ExpenseRefDto;
  @ApiProperty({ type: ExpenseRefDto, required: false }) createdBy?: ExpenseRefDto;
  @ApiProperty({ type: String, nullable: true }) notas!: string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) notes?: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) corteCajaId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, required: false }) cashClosureId?: string | null;
  @ApiProperty({ format: 'date-time' }) fechaCreacion!: string;
  @ApiProperty({ format: 'date-time' }) fechaActualizacion!: string;
  @ApiProperty({ format: 'date-time', required: false }) createdAt?: string;
  @ApiProperty({ format: 'date-time', required: false }) updatedAt?: string;
}

export class ExpensePageDto {
  @ApiProperty({ type: [ExpenseDto] }) datos!: ExpenseDto[];
  @ApiProperty({ type: [ExpenseDto], required: false }) data?: ExpenseDto[];
  @ApiProperty({ example: 1 }) total!: number;
  @ApiProperty({ example: 1 }) pagina!: number;
  @ApiProperty({ example: 1, required: false }) page?: number;
  @ApiProperty({ example: 20 }) limite!: number;
  @ApiProperty({ example: 20, required: false }) pageSize?: number;
  @ApiProperty({ example: '355.50' }) montoTotal!: string;
  @ApiProperty({ example: '355.50', required: false }) totalAmount?: string;
}
