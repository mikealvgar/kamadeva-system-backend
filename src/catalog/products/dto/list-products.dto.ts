import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, ValidateIf } from 'class-validator';
import { ListCategoriesDto } from '../../dto/list-categories.dto.js';

export class ListProductsDto extends ListCategoriesDto {
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
