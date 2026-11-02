import { ApiProperty } from '@nestjs/swagger';
import { SizeRefDto } from '../../sizes/dto/size.dto.js';

export class ProductCategoryRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() descripcion!: string;
  @ApiProperty({ required: false }) name?: string;
}

export class ProductBrandRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() descripcion!: string;
}

export class ProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ required: false }) articulo?: string;
  @ApiProperty({ required: false }) name?: string;
  @ApiProperty({ type: String, nullable: true }) descripcion!: string | null;
  @ApiProperty({ type: String, nullable: true, required: false }) description?: string | null;
  @ApiProperty({ example: '7501234567890' }) codigoBarras!: string;
  @ApiProperty({ example: '7501234567890', required: false }) barcode?: string;
  @ApiProperty({ type: ProductBrandRefDto, nullable: true }) marca!: ProductBrandRefDto | null;
  @ApiProperty({ format: 'uuid', nullable: true, required: false }) marcaId?: string | null;
  @ApiProperty({ type: [SizeRefDto] }) tallas!: SizeRefDto[];
  @ApiProperty({ type: String, nullable: true, example: '780.25' }) precioCompra!: string | null;
  @ApiProperty({ example: '1250.50' }) precioVenta!: string;
  @ApiProperty({ example: '12.000' }) stock!: string;
  @ApiProperty({ type: String, nullable: true, example: '3.000' }) existenciaMinima!: string | null;
  @ApiProperty({ type: String, nullable: true, example: '3.000', required: false }) stockMinimo?: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty() activo!: boolean;
  @ApiProperty({ required: false }) isActive?: boolean;
  @ApiProperty({ type: ProductCategoryRefDto, nullable: true }) categoria!: ProductCategoryRefDto | null;
  @ApiProperty({ format: 'uuid', nullable: true, required: false }) categoriaId?: string | null;
  @ApiProperty({ format: 'date-time' }) fechaCreacion!: string;
  @ApiProperty({ format: 'date-time' }) fechaActualizacion!: string;
  @ApiProperty({ format: 'date-time', required: false }) createdAt?: string;
  @ApiProperty({ format: 'date-time', required: false }) updatedAt?: string;
}
