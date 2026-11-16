import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, ValidateIf } from 'class-validator';

export class ExportProductsDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'true: solo productos sin categoría',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  sinCategoria?: 'true' | 'false';

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtrar por marca' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  marcaId?: string;

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'true: solo productos con existencias <= existenciaMinima',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  stockBajo?: 'true' | 'false';

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'true: incluir productos inactivos',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  includeInactive?: 'true' | 'false';

  @ApiPropertyOptional({
    description: 'Contiene en artículo o código de barras; ignora mayúsculas',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  search?: string;
}
