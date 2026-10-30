import { ApiProperty } from '@nestjs/swagger';
import { SizeRefDto } from '../../sizes/dto/size.dto.js';

export class ProductCategoryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
}

export class ProductDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() articulo: string;
  @ApiProperty({ type: String, nullable: true }) descripcion: string | null;
  @ApiProperty({ example: '7501234567890' }) codigoBarras: string;
  @ApiProperty({ type: String, nullable: true }) marca: string | null;
  @ApiProperty({ type: [SizeRefDto], description: 'Ordenadas por sortOrder' })
  tallas: SizeRefDto[];
  @ApiProperty({ type: String, nullable: true, example: '780.25' })
  precioCompra: string | null;
  @ApiProperty({ example: '1250.50' }) precioVenta: string;
  @ApiProperty({ example: '12.000' }) stock: string;
  @ApiProperty({ type: String, nullable: true, example: '3.000' })
  stockMinimo: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ type: ProductCategoryDto, nullable: true })
  categoria: ProductCategoryDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}
