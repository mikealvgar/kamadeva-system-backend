import { ApiProperty } from '@nestjs/swagger';
import { PurchaseStatus } from '../../generated/prisma/client.js';

export class PurchaseProviderDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nombre: string;
}

export class PurchaseUserRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nombre: string;
}

export class PurchaseProductSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() articulo: string;
  @ApiProperty() codigoBarras: string;
}

export class PurchaseItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: PurchaseProductSummaryDto })
  producto: PurchaseProductSummaryDto;
  @ApiProperty({ example: '2.500' }) cantidad: string;
  @ApiProperty({ example: '780.25' }) costoUnitario: string;
  @ApiProperty({ example: '1950.63' }) subtotal: string;
}

export class PurchaseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: PurchaseProviderDto }) proveedor: PurchaseProviderDto;
  @ApiProperty({ format: 'date-time' }) fechaCompra: string;
  @ApiProperty({ format: 'date-time' }) fechaRecepcion: string;
  @ApiProperty({ type: String, nullable: true }) folioProveedor: string | null;
  @ApiProperty({ type: String, nullable: true }) notas: string | null;
  @ApiProperty({ example: '312.10' }) iva: string;
  @ApiProperty({ example: '2262.73' }) total: string;
  @ApiProperty({ type: [PurchaseItemDto] }) productos: PurchaseItemDto[];
  @ApiProperty({ format: 'uuid' }) creadoPorId: string;
  @ApiProperty({ enum: PurchaseStatus }) estado: PurchaseStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  fechaCancelacion: string | null;
  @ApiProperty({ type: PurchaseUserRefDto, nullable: true })
  canceladoPor: PurchaseUserRefDto | null;
  @ApiProperty({ type: String, nullable: true })
  motivoCancelacion: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class PurchasePageDto {
  @ApiProperty({ type: [PurchaseDto] }) data: PurchaseDto[];
  @ApiProperty({ example: 1 }) current_page: number;
  @ApiProperty({ example: 1 }) total_items: number;
  @ApiProperty({ example: 1 }) total_pages: number;
  @ApiProperty({ example: false }) has_next_page: boolean;
  @ApiProperty({ example: false }) has_prev_page: boolean;
}
