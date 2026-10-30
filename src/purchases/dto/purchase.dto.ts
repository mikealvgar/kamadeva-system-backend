import { ApiProperty } from '@nestjs/swagger';

export class PurchaseProviderDto {
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
  @ApiProperty({ format: 'date-time' }) fechaRecepcion: string;
  @ApiProperty({ type: String, nullable: true }) folioProveedor: string | null;
  @ApiProperty({ type: String, nullable: true }) notas: string | null;
  @ApiProperty({ example: '1950.63' }) total: string;
  @ApiProperty({ type: [PurchaseItemDto] }) productos: PurchaseItemDto[];
  @ApiProperty({ format: 'uuid' }) creadoPorId: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class PurchasePageDto {
  @ApiProperty({ type: [PurchaseDto] }) items: PurchaseDto[];
  @ApiProperty() pagina: number;
  @ApiProperty() limite: number;
  @ApiProperty() total: number;
}
